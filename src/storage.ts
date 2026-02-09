import type { LogEntry, LogLevel, StorageAdapter } from './types.js';
import { LOCALSTORAGE_MAX_LOG_COUNT } from './types.js';

const STORE_NAME = 'logs';
const DB_VERSION = 2;

export class IndexedDBStorage implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private readonly dbName: string;

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

  addEntry(entry: LogEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.add(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
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

        const deleteCount = total - maxCount;
        const cursorReq = store.openCursor();
        let deleted = 0;

        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (cursor && deleted < deleteCount) {
            cursor.delete();
            deleted++;
            cursor.continue();
          }
        };
      };

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export class LocalStorageAdapter implements StorageAdapter {
  private readonly key: string;
  private readonly maxEntries: number;

  constructor(storageKey: string, maxLogCount: number) {
    this.key = `__${storageKey}__`;
    this.maxEntries = Math.min(maxLogCount, LOCALSTORAGE_MAX_LOG_COUNT);
  }

  async init(): Promise<void> {
    // Ensure the key exists
    if (localStorage.getItem(this.key) === null) {
      localStorage.setItem(this.key, '[]');
    }
  }

  async addEntry(entry: LogEntry): Promise<void> {
    const entries = this.readEntries();
    entries.push(entry);
    this.writeEntries(entries);
  }

  async getAll(): Promise<LogEntry[]> {
    return this.readEntries();
  }

  async getByLevel(level: LogLevel): Promise<LogEntry[]> {
    return this.readEntries().filter((e) => e.level === level);
  }

  async getByTag(tag: string): Promise<LogEntry[]> {
    return this.readEntries().filter((e) => e.tag === tag);
  }

  async clear(): Promise<void> {
    localStorage.setItem(this.key, '[]');
  }

  async count(): Promise<number> {
    return this.readEntries().length;
  }

  async trim(maxCount: number): Promise<void> {
    const cap = Math.min(maxCount, this.maxEntries);
    const entries = this.readEntries();
    if (entries.length > cap) {
      this.writeEntries(entries.slice(entries.length - cap));
    }
  }

  close(): void {
    // Nothing to close for localStorage
  }

  private readEntries(): LogEntry[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return [];
      return JSON.parse(raw) as LogEntry[];
    } catch {
      return [];
    }
  }

  private writeEntries(entries: LogEntry[]): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(entries));
    } catch {
      // QuotaExceededError — drop oldest half and retry
      const trimmed = entries.slice(Math.floor(entries.length / 2));
      try {
        localStorage.setItem(this.key, JSON.stringify(trimmed));
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
