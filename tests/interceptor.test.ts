import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleInterceptor } from '../src/interceptor.js';
import type { LogEntry, StorageAdapter } from '../src/types.js';

function createMockStorage(): StorageAdapter & {
  entries: LogEntry[];
  trimCalls: number[];
} {
  const entries: LogEntry[] = [];
  let trimCalls: number[] = [];
  return {
    entries,
    trimCalls,
    async init() {},
    async addEntry(entry: LogEntry) {
      entries.push(entry);
    },
    async getAll() {
      return [...entries];
    },
    async getByLevel(level) {
      return entries.filter((e) => e.level === level);
    },
    async getByTag(tag) {
      return entries.filter((e) => e.tag === tag);
    },
    async clear() {
      entries.length = 0;
    },
    async count() {
      return entries.length;
    },
    async trim(maxCount: number) {
      trimCalls.push(maxCount);
    },
    close() {},
  };
}

describe('ConsoleInterceptor', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;
  let interceptor: ConsoleInterceptor;
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;
  let originalInfo: typeof console.info;
  let originalDebug: typeof console.debug;

  beforeEach(() => {
    // Save original console methods
    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;
    originalInfo = console.info;
    originalDebug = console.debug;

    mockStorage = createMockStorage();
    interceptor = new ConsoleInterceptor(mockStorage, 5000);
  });

  afterEach(() => {
    interceptor.uninstall();
    // Restore original console methods as a safety net
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.info = originalInfo;
    console.debug = originalDebug;
  });

  it('should install and report as installed', () => {
    expect(interceptor.isInstalled()).toBe(false);
    interceptor.install();
    expect(interceptor.isInstalled()).toBe(true);
  });

  it('should not install twice', () => {
    interceptor.install();
    const logAfterFirst = console.log;
    interceptor.install(); // should be a no-op
    expect(console.log).toBe(logAfterFirst);
  });

  it('should intercept console.log and persist entry', async () => {
    interceptor.install();
    console.log('test message');

    // Wait for async persist
    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    const entry = mockStorage.entries[0]!;
    expect(entry.level).toBe('log');
    expect(entry.message).toBe('test message');
    expect(entry.args).toEqual([]);
  });

  it('should intercept console.warn', async () => {
    interceptor.install();
    console.warn('warning!');

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });
    expect(mockStorage.entries[0]!.level).toBe('warn');
  });

  it('should intercept console.error', async () => {
    interceptor.install();
    console.error('error occurred');

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });
    expect(mockStorage.entries[0]!.level).toBe('error');
  });

  it('should intercept console.info', async () => {
    interceptor.install();
    console.info('info message');

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });
    expect(mockStorage.entries[0]!.level).toBe('info');
  });

  it('should intercept console.debug', async () => {
    interceptor.install();
    console.debug('debug message');

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });
    expect(mockStorage.entries[0]!.level).toBe('debug');
  });

  it('should still call the original console method', () => {
    const spy = vi.fn();
    console.log = spy;
    // Re-create interceptor so it captures the spy as "original"
    interceptor = new ConsoleInterceptor(mockStorage, 5000);
    interceptor.install();

    console.log('should reach spy');
    expect(spy).toHaveBeenCalledWith('should reach spy');
  });

  it('should uninstall and restore original console methods', () => {
    interceptor.install();
    // After install, console.log should be replaced with a wrapper
    expect(console.log).not.toBe(originalLog);

    interceptor.uninstall();
    expect(interceptor.isInstalled()).toBe(false);
    // After uninstall, console.log should be the bound original (not the wrapper).
    // The interceptor stores originals via .bind(console), so we verify it is
    // no longer the interceptor wrapper by checking it doesn't persist entries.
    const countBefore = mockStorage.entries.length;
    console.log('after uninstall');
    // Give a tick for any async persist that might fire
    expect(mockStorage.entries.length).toBe(countBefore);
  });

  it('should not throw on uninstall when not installed', () => {
    expect(() => interceptor.uninstall()).not.toThrow();
  });

  it('should handle multiple arguments', async () => {
    interceptor.install();
    console.log('hello', 'world', 42);

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    const entry = mockStorage.entries[0]!;
    expect(entry.message).toBe('hello');
    expect(entry.args).toEqual(['world', '42']);
  });

  it('should serialize objects in args', async () => {
    interceptor.install();
    console.log('data:', { key: 'value' });

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    const entry = mockStorage.entries[0]!;
    expect(entry.message).toBe('data:');
    expect(entry.args).toEqual(['{"key":"value"}']);
  });

  it('should handle circular references without throwing', async () => {
    interceptor.install();
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    console.log('circular:', circular);

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    // Should not throw, safeStringify falls back to String()
    const entry = mockStorage.entries[0]!;
    expect(entry.message).toBe('circular:');
    expect(entry.args).toHaveLength(1);
  });

  it('should handle undefined and null arguments', async () => {
    interceptor.install();
    console.log(undefined, null);

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    const entry = mockStorage.entries[0]!;
    // undefined first arg -> empty string message
    expect(entry.message).toBe('');
    expect(entry.args).toEqual(['null']);
  });

  it('should handle no arguments', async () => {
    interceptor.install();
    console.log();

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    const entry = mockStorage.entries[0]!;
    expect(entry.message).toBe('');
    expect(entry.args).toEqual([]);
  });

  it('should generate ISO timestamp', async () => {
    interceptor.install();
    const before = new Date().toISOString();
    console.log('ts test');

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });
    const after = new Date().toISOString();

    const ts = mockStorage.entries[0]!.timestamp;
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });

  it('should handle rapid consecutive logs', async () => {
    interceptor.install();
    const count = 50;
    for (let i = 0; i < count; i++) {
      console.log(`rapid-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(count);
    });

    expect(mockStorage.entries[0]!.message).toBe('rapid-0');
    expect(mockStorage.entries[count - 1]!.message).toBe(`rapid-${count - 1}`);
  });

  it('should not break when storage.addEntry rejects', async () => {
    const failStorage = createMockStorage();
    failStorage.addEntry = async () => {
      throw new Error('Storage write failed');
    };
    const inter = new ConsoleInterceptor(failStorage, 5000);
    inter.install();

    // Should not throw
    expect(() => console.log('should not break')).not.toThrow();

    inter.uninstall();
  });

  it('should handle large payloads', async () => {
    interceptor.install();
    const largeString = 'x'.repeat(100_000);
    console.log(largeString);

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    expect(mockStorage.entries[0]!.message).toBe(largeString);
  });
});
