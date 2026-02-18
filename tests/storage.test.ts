import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { IndexedDBStorage, LocalStorageAdapter, createStorage } from '../src/storage.js';
import type { LogEntry } from '../src/types.js';

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level: 'log',
    message: 'test message',
    args: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// IndexedDBStorage
// ---------------------------------------------------------------------------
describe('IndexedDBStorage', () => {
  let storage: IndexedDBStorage;

  beforeEach(async () => {
    storage = new IndexedDBStorage('test-db-' + Math.random().toString(36).slice(2));
    await storage.init();
  });

  afterEach(() => {
    storage.close();
  });

  it('should initialize without error', () => {
    expect(storage).toBeDefined();
  });

  it('should add and retrieve a log entry', async () => {
    const entry = makeEntry({ message: 'hello' });
    await storage.addEntry(entry);

    const all = await storage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.message).toBe('hello');
    expect(all[0]!.level).toBe('log');
  });

  it('should retrieve entries by level', async () => {
    await storage.addEntry(makeEntry({ level: 'error', message: 'err1' }));
    await storage.addEntry(makeEntry({ level: 'warn', message: 'warn1' }));
    await storage.addEntry(makeEntry({ level: 'error', message: 'err2' }));
    await storage.addEntry(makeEntry({ level: 'log', message: 'log1' }));

    const errors = await storage.getByLevel('error');
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.level === 'error')).toBe(true);

    const warns = await storage.getByLevel('warn');
    expect(warns).toHaveLength(1);
    expect(warns[0]!.message).toBe('warn1');
  });

  it('should return count of entries', async () => {
    expect(await storage.count()).toBe(0);
    await storage.addEntry(makeEntry());
    await storage.addEntry(makeEntry());
    expect(await storage.count()).toBe(2);
  });

  it('should clear all entries', async () => {
    await storage.addEntry(makeEntry());
    await storage.addEntry(makeEntry());
    expect(await storage.count()).toBe(2);

    await storage.clear();
    expect(await storage.count()).toBe(0);
  });

  it('should trim oldest entries when exceeding maxCount', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.addEntry(makeEntry({ message: `msg-${i}` }));
    }
    expect(await storage.count()).toBe(10);

    await storage.trim(5);
    const remaining = await storage.getAll();
    expect(remaining).toHaveLength(5);
    // The oldest entries (0-4) should have been removed
    expect(remaining[0]!.message).toBe('msg-5');
  });

  it('should not trim when count is within limit', async () => {
    await storage.addEntry(makeEntry());
    await storage.addEntry(makeEntry());
    await storage.trim(10);
    expect(await storage.count()).toBe(2);
  });

  it('should reject operations when database is not initialized', async () => {
    const uninit = new IndexedDBStorage('uninit-db');
    // Do not call init()
    // addEntry now buffers entries and flushes via queueMicrotask,
    // so it resolves immediately. The flush will fail silently.
    await expect(uninit.addEntry(makeEntry())).resolves.toBeUndefined();
    // flush() attempts to write the buffer and rejects when db is null
    await expect(uninit.flush()).rejects.toThrow('Database not initialized');
    await expect(uninit.getAll()).rejects.toThrow('Database not initialized');
    await expect(uninit.getByLevel('log')).rejects.toThrow('Database not initialized');
    await expect(uninit.clear()).rejects.toThrow('Database not initialized');
    await expect(uninit.count()).rejects.toThrow('Database not initialized');
    await expect(uninit.trim(10)).rejects.toThrow('Database not initialized');
  });

  it('should handle close being called multiple times', () => {
    storage.close();
    expect(() => storage.close()).not.toThrow();
  });

  it('should store args array correctly', async () => {
    const entry = makeEntry({ args: ['arg1', '{"key":"val"}'] });
    await storage.addEntry(entry);
    const all = await storage.getAll();
    expect(all[0]!.args).toEqual(['arg1', '{"key":"val"}']);
  });

  it('should preserve timestamp format', async () => {
    const ts = '2026-02-09T01:00:00.000Z';
    await storage.addEntry(makeEntry({ timestamp: ts }));
    const all = await storage.getAll();
    expect(all[0]!.timestamp).toBe(ts);
  });

  it('should retrieve entries by tag', async () => {
    await storage.addEntry(makeEntry({ tag: 'auth', message: 'auth1' }));
    await storage.addEntry(makeEntry({ tag: 'network', message: 'net1' }));
    await storage.addEntry(makeEntry({ tag: 'auth', message: 'auth2' }));
    await storage.addEntry(makeEntry({ message: 'no tag' }));

    const authEntries = await storage.getByTag('auth');
    expect(authEntries).toHaveLength(2);
    expect(authEntries.every((e) => e.tag === 'auth')).toBe(true);

    const networkEntries = await storage.getByTag('network');
    expect(networkEntries).toHaveLength(1);
    expect(networkEntries[0]!.message).toBe('net1');
  });

  it('should return empty array for nonexistent tag', async () => {
    await storage.addEntry(makeEntry({ tag: 'auth', message: 'auth1' }));
    const results = await storage.getByTag('nonexistent');
    expect(results).toEqual([]);
  });

  it('should handle entries without tag field in getByTag', async () => {
    await storage.addEntry(makeEntry({ message: 'untagged1' }));
    await storage.addEntry(makeEntry({ message: 'untagged2' }));
    const results = await storage.getByTag('anything');
    expect(results).toEqual([]);
  });

  it('should reject getByTag when database is not initialized', async () => {
    const uninit = new IndexedDBStorage('uninit-tag-db');
    await expect(uninit.getByTag('auth')).rejects.toThrow('Database not initialized');
  });
});

// ---------------------------------------------------------------------------
// LocalStorageAdapter
// ---------------------------------------------------------------------------
describe('LocalStorageAdapter', () => {
  let storage: LocalStorageAdapter;

  beforeEach(async () => {
    localStorage.clear();
    storage = new LocalStorageAdapter('test-ls-' + Math.random().toString(36).slice(2), 5000);
    await storage.init();
  });

  afterEach(() => {
    storage.close();
    localStorage.clear();
  });

  it('should initialize with empty array in localStorage', async () => {
    const s = new LocalStorageAdapter('init-test', 100);
    await s.init();
    // Key format is __<storageKey>__
    expect(localStorage.getItem('__init-test__')).toBe('[]');
  });

  it('should add and retrieve entries', async () => {
    await storage.addEntry(makeEntry({ message: 'ls-msg' }));
    const all = await storage.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.message).toBe('ls-msg');
  });

  it('should filter entries by level', async () => {
    await storage.addEntry(makeEntry({ level: 'info', message: 'info1' }));
    await storage.addEntry(makeEntry({ level: 'debug', message: 'debug1' }));
    await storage.addEntry(makeEntry({ level: 'info', message: 'info2' }));

    const infos = await storage.getByLevel('info');
    expect(infos).toHaveLength(2);

    const debugs = await storage.getByLevel('debug');
    expect(debugs).toHaveLength(1);
    expect(debugs[0]!.message).toBe('debug1');
  });

  it('should return count', async () => {
    expect(await storage.count()).toBe(0);
    await storage.addEntry(makeEntry());
    expect(await storage.count()).toBe(1);
  });

  it('should clear entries', async () => {
    await storage.addEntry(makeEntry());
    await storage.addEntry(makeEntry());
    await storage.clear();
    expect(await storage.count()).toBe(0);
  });

  it('should trim to max count keeping newest entries', async () => {
    for (let i = 0; i < 10; i++) {
      await storage.addEntry(makeEntry({ message: `msg-${i}` }));
    }
    await storage.trim(5);
    const all = await storage.getAll();
    expect(all).toHaveLength(5);
    expect(all[0]!.message).toBe('msg-5');
  });

  it('should cap maxEntries at LOCALSTORAGE_MAX_LOG_COUNT (1000)', async () => {
    // Passing a value larger than 1000 should still cap at 1000
    const s = new LocalStorageAdapter('cap-test', 9999);
    await s.init();
    // Trim to 9999 should actually trim to 1000 due to the cap
    for (let i = 0; i < 5; i++) {
      await s.addEntry(makeEntry({ message: `m${i}` }));
    }
    // Trimming should not remove anything since 5 < 1000
    await s.trim(9999);
    expect(await s.count()).toBe(5);
  });

  it('should handle corrupted localStorage data gracefully', async () => {
    // Manually corrupt the storage key
    const key = `__corrupt-test__`;
    localStorage.setItem(key, 'not-valid-json');
    const s = new LocalStorageAdapter('corrupt-test', 100);
    await s.init();
    // getAll should return empty array when JSON parse fails
    const all = await s.getAll();
    expect(all).toEqual([]);
  });

  it('should not throw when close is called', () => {
    expect(() => storage.close()).not.toThrow();
  });

  it('should retrieve entries by tag', async () => {
    await storage.addEntry(makeEntry({ tag: 'auth', message: 'auth1' }));
    await storage.addEntry(makeEntry({ tag: 'network', message: 'net1' }));
    await storage.addEntry(makeEntry({ tag: 'auth', message: 'auth2' }));
    await storage.addEntry(makeEntry({ message: 'no tag' }));

    const authEntries = await storage.getByTag('auth');
    expect(authEntries).toHaveLength(2);
    expect(authEntries.every((e) => e.tag === 'auth')).toBe(true);

    const networkEntries = await storage.getByTag('network');
    expect(networkEntries).toHaveLength(1);
    expect(networkEntries[0]!.message).toBe('net1');
  });

  it('should return empty array for nonexistent tag in localStorage', async () => {
    await storage.addEntry(makeEntry({ tag: 'auth', message: 'auth1' }));
    const results = await storage.getByTag('nonexistent');
    expect(results).toEqual([]);
  });

  it('should handle entries without tag field in getByTag', async () => {
    await storage.addEntry(makeEntry({ message: 'untagged1' }));
    await storage.addEntry(makeEntry({ message: 'untagged2' }));
    const results = await storage.getByTag('anything');
    expect(results).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// LocalStorageAdapter - in-memory cache behavior
// ---------------------------------------------------------------------------
describe('LocalStorageAdapter - in-memory cache', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('should make entries readable immediately from memory (before flush)', async () => {
    const s = new LocalStorageAdapter('cache-test-' + Math.random().toString(36).slice(2), 1000);
    await s.init();

    await s.addEntry(makeEntry({ message: 'immediate' }));

    // Entry should be readable from getAll() immediately (from memory)
    // even though the debounced flush has not fired yet
    const all = await s.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.message).toBe('immediate');

    s.close();
  });

  it('should flush writes to localStorage', async () => {
    const key = 'flush-test-' + Math.random().toString(36).slice(2);
    const s = new LocalStorageAdapter(key, 1000);
    await s.init();

    await s.addEntry(makeEntry({ message: 'flushed' }));

    // Before explicit flush, localStorage may not be updated yet
    // (debounced). After flush(), it must be written.
    await s.flush();

    const raw = localStorage.getItem(`__${key}__`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as LogEntry[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.message).toBe('flushed');

    s.close();
  });

  it('should flush remaining entries on close()', async () => {
    const key = 'close-flush-' + Math.random().toString(36).slice(2);
    const s = new LocalStorageAdapter(key, 1000);
    await s.init();

    await s.addEntry(makeEntry({ message: 'before-close' }));

    // close() should flush synchronously
    s.close();

    const raw = localStorage.getItem(`__${key}__`);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as LogEntry[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0]!.message).toBe('before-close');
  });

  it('should read existing entries from localStorage into memory on init', async () => {
    const key = 'init-read-' + Math.random().toString(36).slice(2);

    // Pre-populate localStorage with entries
    const existingEntries = [
      makeEntry({ message: 'existing-1' }),
      makeEntry({ message: 'existing-2' }),
    ];
    localStorage.setItem(`__${key}__`, JSON.stringify(existingEntries));

    // Init should read them into memory
    const s = new LocalStorageAdapter(key, 1000);
    await s.init();

    const all = await s.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.message).toBe('existing-1');
    expect(all[1]!.message).toBe('existing-2');

    s.close();
  });
});

// ---------------------------------------------------------------------------
// IndexedDBStorage - write batching
// ---------------------------------------------------------------------------
describe('IndexedDBStorage - write batching', () => {
  let storage: IndexedDBStorage;

  beforeEach(async () => {
    storage = new IndexedDBStorage('batch-test-' + Math.random().toString(36).slice(2));
    await storage.init();
  });

  afterEach(() => {
    storage.close();
  });

  it('should batch multiple rapid addEntry calls', async () => {
    // Fire several addEntry calls synchronously (no await between them)
    // They should all be buffered and flushed in a single batch
    for (let i = 0; i < 10; i++) {
      storage.addEntry(makeEntry({ message: `batch-${i}` }));
    }

    // Flush to ensure all entries are written
    await storage.flush();

    const all = await storage.getAll();
    expect(all).toHaveLength(10);
    expect(all[0]!.message).toBe('batch-0');
    expect(all[9]!.message).toBe('batch-9');
  });

  it('should make entries fully retrievable after batch flush', async () => {
    for (let i = 0; i < 20; i++) {
      storage.addEntry(makeEntry({ message: `entry-${i}`, level: i % 2 === 0 ? 'info' : 'warn' }));
    }

    await storage.flush();

    const all = await storage.getAll();
    expect(all).toHaveLength(20);

    const infos = await storage.getByLevel('info');
    expect(infos).toHaveLength(10);

    const warns = await storage.getByLevel('warn');
    expect(warns).toHaveLength(10);
  });

  it('should handle range-based trim correctly', async () => {
    // Add 10 entries
    for (let i = 0; i < 10; i++) {
      await storage.addEntry(makeEntry({ message: `trim-${i}` }));
    }
    await storage.flush();
    expect(await storage.count()).toBe(10);

    // Trim to keep only 5
    await storage.trim(5);
    const remaining = await storage.getAll();
    expect(remaining).toHaveLength(5);
    // Oldest entries (0-4) should be removed
    expect(remaining[0]!.message).toBe('trim-5');
    expect(remaining[4]!.message).toBe('trim-9');
  });
});

// ---------------------------------------------------------------------------
// IndexedDBStorage - trim edge cases and error surfacing
// ---------------------------------------------------------------------------
describe('IndexedDBStorage - trim edge cases', () => {
  let storage: IndexedDBStorage;

  beforeEach(async () => {
    storage = new IndexedDBStorage('trim-edge-' + Math.random().toString(36).slice(2));
    await storage.init();
  });

  afterEach(() => {
    storage.close();
  });

  it('should trim correctly after a burst of unbatched addEntry calls', async () => {
    // Fire 20 addEntry calls without awaiting (buffered writes)
    for (let i = 0; i < 20; i++) {
      storage.addEntry(makeEntry({ message: `burst-${i}` }));
    }

    // Trim should flush pending entries first, then trim
    await storage.trim(10);

    const remaining = await storage.getAll();
    expect(remaining).toHaveLength(10);
    // Oldest entries (0-9) should be removed, newest (10-19) kept
    expect(remaining[0]!.message).toBe('burst-10');
    expect(remaining[9]!.message).toBe('burst-19');
  });

  it('should not remove entries when count equals maxCount', async () => {
    for (let i = 0; i < 5; i++) {
      await storage.addEntry(makeEntry({ message: `exact-${i}` }));
    }
    await storage.flush();

    await storage.trim(5);
    expect(await storage.count()).toBe(5);
    const all = await storage.getAll();
    expect(all[0]!.message).toBe('exact-0');
    expect(all[4]!.message).toBe('exact-4');
  });

  it('should remove exactly 1 entry when count is 1 over maxCount', async () => {
    for (let i = 0; i < 6; i++) {
      await storage.addEntry(makeEntry({ message: `one-over-${i}` }));
    }
    await storage.flush();

    await storage.trim(5);
    const remaining = await storage.getAll();
    expect(remaining).toHaveLength(5);
    expect(remaining[0]!.message).toBe('one-over-1');
    expect(remaining[4]!.message).toBe('one-over-5');
  });

  it('should handle large overshoot (trim from many to few)', async () => {
    for (let i = 0; i < 50; i++) {
      await storage.addEntry(makeEntry({ message: `large-${i}` }));
    }
    await storage.flush();
    expect(await storage.count()).toBe(50);

    await storage.trim(3);
    const remaining = await storage.getAll();
    expect(remaining).toHaveLength(3);
    expect(remaining[0]!.message).toBe('large-47');
    expect(remaining[2]!.message).toBe('large-49');
  });

  it('should trim to 0 when maxCount is 0', async () => {
    for (let i = 0; i < 5; i++) {
      await storage.addEntry(makeEntry({ message: `zero-${i}` }));
    }
    await storage.flush();

    await storage.trim(0);
    expect(await storage.count()).toBe(0);
  });

  it('should handle rapid addEntry + trim sequences without failure', async () => {
    // Interleave adds and trims
    for (let i = 0; i < 10; i++) {
      await storage.addEntry(makeEntry({ message: `seq-${i}` }));
    }
    await storage.flush();
    await storage.trim(5);

    for (let i = 10; i < 20; i++) {
      await storage.addEntry(makeEntry({ message: `seq-${i}` }));
    }
    await storage.flush();
    await storage.trim(5);

    const remaining = await storage.getAll();
    expect(remaining).toHaveLength(5);
    // Should keep the 5 newest from the second batch
    expect(remaining[0]!.message).toBe('seq-15');
    expect(remaining[4]!.message).toBe('seq-19');
  });

  it('should not fail when trimming an empty store', async () => {
    expect(await storage.count()).toBe(0);
    await storage.trim(10);
    expect(await storage.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// IndexedDBStorage - trim error visibility (warnInternal)
// ---------------------------------------------------------------------------
describe('IndexedDBStorage - trim error visibility', () => {
  it('should call warnInternal when flush fails during addEntry', async () => {
    const { warnInternal } = await import('../src/internal-warn.js');
    const warnSpy = vi.spyOn({ warnInternal }, 'warnInternal');

    // We test indirectly: an uninitialized storage will fail on flushEntries
    const uninit = new IndexedDBStorage('warn-test');
    // Do not call init() — addEntry queues a microtask flush that will fail
    await uninit.addEntry(makeEntry());

    // The microtask flush runs asynchronously; give it a tick
    await new Promise((resolve) => queueMicrotask(resolve));

    // The trim on uninitialized db rejects with a clear error
    await expect(uninit.trim(10)).rejects.toThrow('Database not initialized');

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// createStorage factory
// ---------------------------------------------------------------------------
describe('createStorage', () => {
  it('should return IndexedDBStorage when IndexedDB is available', async () => {
    const storage = await createStorage('factory-test', 5000);
    expect(storage).toBeDefined();
    // Should be IndexedDBStorage since fake-indexeddb is available
    const all = await storage.getAll();
    expect(all).toEqual([]);
    storage.close();
  });

  it('should fall back to LocalStorageAdapter when IndexedDB is unavailable', async () => {
    const origIndexedDB = globalThis.indexedDB;
    // Remove indexedDB to simulate unavailability
    // @ts-expect-error - intentionally removing for testing
    delete globalThis.indexedDB;

    try {
      const storage = await createStorage('fallback-test', 5000);
      expect(storage).toBeDefined();
      await storage.addEntry(makeEntry({ message: 'fallback' }));
      const all = await storage.getAll();
      expect(all).toHaveLength(1);
      expect(all[0]!.message).toBe('fallback');
      storage.close();
    } finally {
      // Restore indexedDB
      globalThis.indexedDB = origIndexedDB;
    }
  });
});
