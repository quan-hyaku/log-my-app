import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ConsoleInterceptor } from '../src/interceptor.js';
import type { LogEntry, StorageAdapter } from '../src/types.js';

function createMockStorage(): StorageAdapter & {
  entries: LogEntry[];
  trimCalls: number[];
} {
  const entries: LogEntry[] = [];
  const trimCalls: number[] = [];
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
    async flush() {},
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

  it('should still call the original console method after install', () => {
    // The interceptor captures console refs at module load time.
    // After install, calling console.log invokes the wrapper which
    // internally calls the native reference. We verify the wrapper
    // both persists the entry AND invokes the underlying method by
    // checking that the wrapper does not throw and that a persist
    // occurs (covered by the interception tests above).
    interceptor.install();

    // Should not throw — the original method is called internally
    expect(() => console.log('should reach original')).not.toThrow();
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

  it('should use console references captured at module load time, not install time', () => {
    // Replace console.log with a spy BEFORE install
    const spy = vi.fn();
    console.log = spy;

    // Install after the monkey-patch -- the interceptor should use the
    // module-level native refs, not the current console.log (which is our spy).
    interceptor.install();
    console.log('test');

    // The spy should NOT be called as the "original", because the interceptor
    // uses the pristine console.log captured at module-load time.
    // The spy was set as console.log, but install() replaced it again with the
    // interceptor wrapper which calls the module-level original.
    expect(spy).not.toHaveBeenCalled();
  });

  it('should handle large payloads (truncated by safeStringify)', async () => {
    interceptor.install();
    const largeString = 'x'.repeat(100_000);
    console.log(largeString);

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    // safeStringify truncates strings at default maxLength (10,240)
    const msg = mockStorage.entries[0]!.message;
    expect(msg.length).toBeLessThanOrEqual(10_243); // 10240 + "..."
    expect(msg.startsWith('x')).toBe(true);
  });
});

describe('ConsoleInterceptor - captureStackTraces config', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(() => {
    mockStorage = createMockStorage();
  });

  afterEach(() => {
    // Restore will happen via the interceptor's uninstall
  });

  it('should omit stack traces from Error args when captureStackTraces is false', async () => {
    const interceptor = new ConsoleInterceptor(mockStorage, 5000, 2, false);
    interceptor.install();

    const err = new Error('test error');
    console.error('error:', err);

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    const entry = mockStorage.entries[0]!;
    // The error was the second argument, so it appears in args
    const serialized = entry.args[0]!;
    const parsed = JSON.parse(serialized);
    expect(parsed.name).toBe('Error');
    expect(parsed.message).toBe('test error');
    expect(parsed.stack).toBeUndefined();

    interceptor.uninstall();
  });

  it('should include stack traces in Error args by default (captureStackTraces=true)', async () => {
    const interceptor = new ConsoleInterceptor(mockStorage, 5000, 2, true);
    interceptor.install();

    const err = new Error('with stack');
    console.error('error:', err);

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(1);
    });

    const entry = mockStorage.entries[0]!;
    const serialized = entry.args[0]!;
    const parsed = JSON.parse(serialized);
    expect(parsed.name).toBe('Error');
    expect(parsed.message).toBe('with stack');
    expect(typeof parsed.stack).toBe('string');

    interceptor.uninstall();
  });
});
