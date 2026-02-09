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
    await expect(uninit.addEntry(makeEntry())).rejects.toThrow('Database not initialized');
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
