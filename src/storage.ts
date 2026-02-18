import type { LogEntry, LogLevel, StorageAdapter } from './types.js';
import { LOCALSTORAGE_MAX_LOG_COUNT } from './types.js';

const STORE_NAME = 'logs';
const DB_VERSION = 2;
const INDEXEDDB_BACKPRESSURE_LIMIT = 1000;
const LOCALSTORAGE_FLUSH_DELAY = 200;

export class IndexedDBStorage implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;
  private pendingEntries: LogEntry[] = [];
  private flushScheduled = false;

  constructor(storageKey: string) {
    this.dbName = storageKey;
  }

  init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;

        if (oldVersion < 1) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true,
          });
          store.createIndex('level', 'level', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('tag', 'tag', { unique: false });
        }

        if (oldVersion >= 1 && oldVersion < 2) {
          const store = request.transaction!.objectStore(STORE_NAME);
          store.createIndex('tag', 'tag', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  async addEntry(entry: LogEntry): Promise<void> {
    this.pendingEntries.push(entry);

    // Backpressure: if buffer exceeds limit, drop debug-level entries
    if (this.pendingEntries.length > INDEXEDDB_BACKPRESSURE_LIMIT) {
      this.pendingEntries = this.pendingEntries.filter(
        (e) => e.level !== 'debug',
      );
    }

    if (!this.flushScheduled) {
      this.flushScheduled = true;
      queueMicrotask(() => {
        this.flushEntries().catch(() => {
          // Flush failures are non-critical
        });
      });
    }
  }

  private flushEntries(): Promise<void> {
    this.flushScheduled = false;

    if (this.pendingEntries.length === 0) return Promise.resolve();
    if (!this.db) return Promise.reject(new Error('Database not initialized'));

    const batch = this.pendingEntries;
    this.pendingEntries = [];

    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const entry of batch) {
        store.add(entry);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async flush(): Promise<void> {
    await this.flushEntries();
  }

  getAll(): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as LogEntry[]);
      request.onerror = () => reject(request.error);
    });
  }

  getByLevel(level: LogLevel): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('level');
      const request = index.getAll(level);
      request.onsuccess = () => resolve(request.result as LogEntry[]);
      request.onerror = () => reject(request.error);
    });
  }

  getByTag(tag: string): Promise<LogEntry[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('tag');
      const request = index.getAll(tag);
      request.onsuccess = () => resolve(request.result as LogEntry[]);
      request.onerror = () => reject(request.error);
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  count(): Promise<number> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  trim(maxCount: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const countReq = store.count();

      countReq.onsuccess = () => {
        const total = countReq.result;
        if (total <= maxCount) {
          resolve();
          return;
        }

        // Range-based trim: find the key of the (deleteCount)th entry,
        // then delete everything up to and including that key.
        const deleteCount = total - maxCount;
        const cursorReq = store.openKeyCursor();
        let seen = 0;

        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return;

          seen++;
          if (seen === deleteCount) {
            // Delete all entries with key <= cursor.key
            const range = IDBKeyRange.upperBound(cursor.key);
            store.delete(range);
          } else {
            cursor.continue();
          }
        };
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close(): void {
    // Synchronously abandon any pending writes (no async operations in close)
    this.pendingEntries = [];
    this.flushScheduled = false;

    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly key: string;
  private readonly maxEntries: number;
  private entries: LogEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(storageKey: string, maxLogCount: number) {
    this.key = `__${storageKey}__`;
    this.maxEntries = Math.min(maxLogCount, LOCALSTORAGE_MAX_LOG_COUNT);
  }

  async init(): Promise<void> {
    // Read from localStorage once into memory
    const raw = localStorage.getItem(this.key);
    if (raw) {
      try {
        this.entries = JSON.parse(raw) as LogEntry[];
      } catch {
        this.entries = [];
      }
    } else {
      this.entries = [];
      localStorage.setItem(this.key, '[]');
    }
  }

  async addEntry(entry: LogEntry): Promise<void> {
    this.entries.push(entry);
    this.scheduleDebouncedFlush();
  }

  async getAll(): Promise<LogEntry[]> {
    return this.entries.slice();
  }

  async getByLevel(level: LogLevel): Promise<LogEntry[]> {
    return this.entries.filter((e) => e.level === level);
  }

  async getByTag(tag: string): Promise<LogEntry[]> {
    return this.entries.filter((e) => e.tag === tag);
  }

  async clear(): Promise<void> {
    this.entries = [];
    localStorage.setItem(this.key, '[]');
  }

  async count(): Promise<number> {
    return this.entries.length;
  }

  async trim(maxCount: number): Promise<void> {
    const cap = Math.min(maxCount, this.maxEntries);
    if (this.entries.length > cap) {
      this.entries = this.entries.slice(this.entries.length - cap);
      this.scheduleDebouncedFlush();
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.writeEntries();
  }

  close(): void {
    // Flush synchronously before closing
    if (this.flushTimer !== null) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.writeEntries();
  }

  private scheduleDebouncedFlush(): void {
    if (this.flushTimer !== null) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.writeEntries();
    }, LOCALSTORAGE_FLUSH_DELAY);
  }

  private writeEntries(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(this.entries));
    } catch {
      // QuotaExceededError -- drop oldest half and retry
      this.entries = this.entries.slice(Math.floor(this.entries.length / 2));
      try {
        localStorage.setItem(this.key, JSON.stringify(this.entries));
      } catch {
        // Storage completely full, nothing we can do
      }
    }
  }
}

export async function createStorage(
  storageKey: string,
  maxLogCount: number,
): Promise<StorageAdapter> {
  if (await isIndexedDBAvailable()) {
    const storage = new IndexedDBStorage(storageKey);
    await storage.init();
    return storage;
  }

  const storage = new LocalStorageAdapter(storageKey, maxLogCount);
  await storage.init();
  return storage;
}

async function isIndexedDBAvailable(): Promise<boolean> {
  if (typeof indexedDB === 'undefined') return false;

  try {
    return await new Promise<boolean>((resolve) => {
      const request = indexedDB.open('__log_my_app_test__');
      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase('__log_my_app_test__');
        resolve(true);
      };
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
