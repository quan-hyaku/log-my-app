import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initLogger,
  destroyLogger,
  getLogs,
  getLogsByLevel,
  getLogsByTag,
  clearLogs,
} from '../src/logger.js';
import { Logger } from '../src/custom-logger.js';
import { LocalStorageAdapter } from '../src/storage.js';
import type { LogEntry } from '../src/types.js';

// ---------------------------------------------------------------------------
// Polyfill window, ErrorEvent, PromiseRejectionEvent for Node
// (mirrors error-handler.test.ts setup)
// ---------------------------------------------------------------------------
const windowTarget = new globalThis.EventTarget();

if (typeof globalThis.window === 'undefined') {
  (globalThis as Record<string, unknown>).window = {
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    removeEventListener: windowTarget.removeEventListener.bind(windowTarget),
    dispatchEvent: windowTarget.dispatchEvent.bind(windowTarget),
  };
}

if (typeof globalThis.ErrorEvent === 'undefined') {
  globalThis.ErrorEvent = class ErrorEvent extends Event {
    readonly error: unknown;
    readonly message: string;
    readonly filename: string;
    readonly lineno: number;
    readonly colno: number;

    constructor(type: string, init?: ErrorEventInit) {
      super(type);
      this.error = init?.error ?? null;
      this.message = init?.message ?? '';
      this.filename = init?.filename ?? '';
      this.lineno = init?.lineno ?? 0;
      this.colno = init?.colno ?? 0;
    }
  } as unknown as typeof ErrorEvent;
}

if (typeof globalThis.PromiseRejectionEvent === 'undefined') {
  globalThis.PromiseRejectionEvent = class PromiseRejectionEvent extends Event {
    readonly promise: Promise<unknown>;
    readonly reason: unknown;

    constructor(type: string, init: PromiseRejectionEventInit) {
      super(type);
      this.promise = init.promise;
      this.reason = init.reason;
    }
  } as unknown as typeof PromiseRejectionEvent;
}

function dispatchError(error: unknown, message?: string): void {
  window.dispatchEvent(
    new ErrorEvent('error', {
      error,
      message: message ?? (error instanceof Error ? error.message : String(error)),
    }),
  );
}

function uid(): string {
  return Math.random().toString(36).slice(2);
}

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
// 1. High-volume: 10,000 rapid console.log calls
// ---------------------------------------------------------------------------
describe('Stress: High-volume logging', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should handle 10,000 rapid console.log calls without crashes', async () => {
    const key = `stress-high-vol-${uid()}`;
    // Set maxLogCount high enough to avoid trimming during the test
    await initLogger({ storageKey: key, maxLogCount: 15_000 });

    const COUNT = 10_000;
    for (let i = 0; i < COUNT; i++) {
      console.log(`hv-${i}`);
    }

    // Wait for all entries to be persisted
    await vi.waitFor(
      async () => {
        const logs = await getLogs();
        expect(logs.length).toBeGreaterThanOrEqual(COUNT);
      },
      { timeout: 30_000 },
    );

    const logs = await getLogs();
    // Verify entries exist (first, middle, last)
    expect(logs.some((l) => l.message === 'hv-0')).toBe(true);
    expect(logs.some((l) => l.message === `hv-${COUNT - 1}`)).toBe(true);
    expect(logs.some((l) => l.message === `hv-${Math.floor(COUNT / 2)}`)).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 2. Large payloads: 1MB string and deeply nested objects
// ---------------------------------------------------------------------------
describe('Stress: Large payloads', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should handle a 1MB string payload (truncated by safeStringify)', async () => {
    const key = `stress-1mb-${uid()}`;
    await initLogger({ storageKey: key });

    const oneMB = 'X'.repeat(1_000_000);
    console.log(oneMB);

    await vi.waitFor(
      async () => {
        const logs = await getLogs();
        expect(logs.length).toBeGreaterThan(0);
      },
      { timeout: 10_000 },
    );

    const logs = await getLogs();
    const entry = logs[logs.length - 1]!;
    expect(entry).toBeDefined();
    // safeStringify truncates at default maxLength (10,240) + "..."
    expect(entry.message.length).toBeLessThanOrEqual(10_243);
    expect(entry.message.startsWith('X')).toBe(true);
  }, 30_000);

  it('should handle a deeply nested object (50+ levels) with depth truncation', async () => {
    const key = `stress-nested-${uid()}`;
    await initLogger({ storageKey: key });

    // Build a 60-level deep nested object
    let obj: Record<string, unknown> = { value: 'leaf' };
    for (let i = 0; i < 60; i++) {
      obj = { nested: obj };
    }

    console.log('deep-nest', obj);

    await vi.waitFor(
      async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'deep-nest')).toBe(true);
      },
      { timeout: 10_000 },
    );

    const logs = await getLogs();
    const entry = logs.find((l) => l.message === 'deep-nest')!;
    expect(entry).toBeDefined();
    // The args should contain a stringified version of the nested object
    // with depth truncation ("[Object]") since default maxDepth is 2
    expect(entry.args.length).toBe(1);
    expect(entry.args[0]!.includes('[Object]')).toBe(true);
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 3. Concurrent reads/writes: getLogs() while rapid writes happen
// ---------------------------------------------------------------------------
describe('Stress: Concurrent reads and writes', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should handle getLogs() during rapid writes without errors', async () => {
    const key = `stress-concurrent-${uid()}`;
    await initLogger({ storageKey: key });

    const WRITE_COUNT = 500;
    const READ_COUNT = 20;

    // Fire off writes
    for (let i = 0; i < WRITE_COUNT; i++) {
      console.log(`concurrent-${i}`);
    }

    // Interleave reads while writes are still flushing
    const readResults: LogEntry[][] = [];
    for (let i = 0; i < READ_COUNT; i++) {
      const logs = await getLogs();
      readResults.push(logs);
    }

    // All reads should succeed (no throws)
    expect(readResults).toHaveLength(READ_COUNT);
    // Each successive read should have >= entries as the previous (monotonic)
    for (let i = 1; i < readResults.length; i++) {
      expect(readResults[i]!.length).toBeGreaterThanOrEqual(readResults[i - 1]!.length);
    }

    // Wait for all writes to complete
    await vi.waitFor(
      async () => {
        const logs = await getLogs();
        expect(logs.length).toBeGreaterThanOrEqual(WRITE_COUNT);
      },
      { timeout: 15_000 },
    );
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 4. QuotaExceeded simulation for LocalStorageAdapter
// ---------------------------------------------------------------------------
describe('Stress: QuotaExceeded simulation (LocalStorageAdapter)', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('should handle QuotaExceededError by trimming entries', async () => {
    const adapter = new LocalStorageAdapter(`quota-test-${uid()}`, 1000);
    await adapter.init();

    // Add some baseline entries
    for (let i = 0; i < 10; i++) {
      await adapter.addEntry(makeEntry({ message: `baseline-${i}` }));
    }
    // Force the debounced flush to write to localStorage
    await adapter.flush();

    const countBefore = await adapter.count();
    expect(countBefore).toBe(10);

    // Mock setItem to throw QuotaExceededError on first call, then succeed
    let throwCount = 0;
    const originalSetItem = localStorage.setItem.bind(localStorage);
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(
      (key: string, value: string) => {
        throwCount++;
        if (throwCount % 2 === 1) {
          // First call throws (original write), second succeeds (trimmed retry)
          const err = new DOMException('QuotaExceededError', 'QuotaExceededError');
          throw err;
        }
        originalSetItem(key, value);
      },
    );

    // Add an entry and force flush -- this should trigger the QuotaExceeded handling
    await adapter.addEntry(makeEntry({ message: 'after-quota' }));
    await adapter.flush();

    // After the trim-and-retry, we should still have some entries in memory
    setItemSpy.mockRestore();
    const all = await adapter.getAll();
    expect(all.length).toBeGreaterThan(0);

    adapter.close();
  });

  it('should survive when localStorage is completely full (both writes fail)', async () => {
    const adapter = new LocalStorageAdapter(`quota-full-${uid()}`, 1000);
    await adapter.init();

    // Add baseline entries
    for (let i = 0; i < 5; i++) {
      await adapter.addEntry(makeEntry({ message: `base-${i}` }));
    }
    await adapter.flush();

    // Mock setItem to always throw
    const setItemSpy = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    // Should not throw even when storage is completely full
    await adapter.addEntry(makeEntry({ message: 'full-storage' }));
    // flush() triggers writeEntries which catches the error
    expect(() => adapter.close()).not.toThrow();

    setItemSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// 5. Init/destroy cycling: 50 rapid cycles
// ---------------------------------------------------------------------------
describe('Stress: Init/destroy cycling', () => {
  afterEach(() => {
    // Safety cleanup
    try { destroyLogger(); } catch { /* ignore */ }
  });

  it('should handle 50 rapid initLogger/destroyLogger cycles without leaks', async () => {
    const CYCLES = 50;

    for (let i = 0; i < CYCLES; i++) {
      await initLogger({ storageKey: `cycle-${uid()}` });
      destroyLogger();
    }

    // After all cycles, logger should be destroyed
    await expect(getLogs()).rejects.toThrow('Logger is not initialized');

    // Re-init should work fine after many cycles
    await initLogger({ storageKey: `cycle-final-${uid()}` });
    console.log('post-cycle');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.some((l) => l.message === 'post-cycle')).toBe(true);
    });

    destroyLogger();
  }, 30_000);
});

// ---------------------------------------------------------------------------
// 6. Double init: Verify initLogger() throws when already initialized
// ---------------------------------------------------------------------------
describe('Stress: Double init guard', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should throw when initLogger() is called while already initialized', async () => {
    await initLogger({ storageKey: `double-init-${uid()}` });

    await expect(initLogger({ storageKey: `double-init-2-${uid()}` })).rejects.toThrow(
      'Logger is already initialized. Call destroyLogger() first.',
    );
  });

  it('should allow re-init after destroy even with different config', async () => {
    await initLogger({ storageKey: `double-a-${uid()}`, maxLogCount: 100 });
    destroyLogger();
    await expect(
      initLogger({ storageKey: `double-b-${uid()}`, maxLogCount: 200 }),
    ).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// 7. Post-destroy operations: getLogs(), Logger.info() after destroyLogger()
// ---------------------------------------------------------------------------
describe('Stress: Post-destroy operations', () => {
  it('should throw when getLogs() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-get-${uid()}` });
    destroyLogger();

    await expect(getLogs()).rejects.toThrow('Logger is not initialized');
  });

  it('should throw when getLogsByLevel() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-level-${uid()}` });
    destroyLogger();

    await expect(getLogsByLevel('error')).rejects.toThrow('Logger is not initialized');
  });

  it('should throw when getLogsByTag() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-tag-${uid()}` });
    destroyLogger();

    await expect(getLogsByTag('test')).rejects.toThrow('Logger is not initialized');
  });

  it('should throw when clearLogs() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-clear-${uid()}` });
    destroyLogger();

    await expect(clearLogs()).rejects.toThrow('Logger is not initialized');
  });

  it('should throw when Logger.info() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-info-${uid()}` });
    destroyLogger();

    expect(() => Logger.info('should fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.log() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-log-${uid()}` });
    destroyLogger();

    expect(() => Logger.log('should fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.warn() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-warn-${uid()}` });
    destroyLogger();

    expect(() => Logger.warn('should fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.error() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-error-${uid()}` });
    destroyLogger();

    expect(() => Logger.error('should fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.debug() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-debug-${uid()}` });
    destroyLogger();

    expect(() => Logger.debug('should fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.tag() is called after destroyLogger()', async () => {
    await initLogger({ storageKey: `post-destroy-tag-api-${uid()}` });
    destroyLogger();

    expect(() => Logger.tag('test')).toThrow('Logger is not initialized');
  });
});

// ---------------------------------------------------------------------------
// 8. Rapid error events: 1000 rapid uncaught errors
// ---------------------------------------------------------------------------
describe('Stress: Rapid error events', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should handle 1000 rapid uncaught errors without crashes', async () => {
    const key = `stress-errors-${uid()}`;
    await initLogger({ storageKey: key, captureUncaughtErrors: true });

    const ERROR_COUNT = 1000;
    for (let i = 0; i < ERROR_COUNT; i++) {
      dispatchError(new Error(`rapid-err-${i}`));
    }

    await vi.waitFor(
      async () => {
        const logs = await getLogsByTag('uncaught');
        expect(logs.length).toBeGreaterThanOrEqual(ERROR_COUNT);
      },
      { timeout: 30_000 },
    );

    const logs = await getLogsByTag('uncaught');
    expect(logs.length).toBe(ERROR_COUNT);
    // Check first and last
    expect(logs.some((l) => l.message === 'rapid-err-0')).toBe(true);
    expect(logs.some((l) => l.message === `rapid-err-${ERROR_COUNT - 1}`)).toBe(true);
    // All should be error level
    expect(logs.every((l) => l.level === 'error')).toBe(true);
  }, 60_000);
});

// ---------------------------------------------------------------------------
// 9. Mixed load: Console interception + Logger API + error capture
// ---------------------------------------------------------------------------
describe('Stress: Mixed load', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should handle 1000 operations each from console, Logger API, and error capture', async () => {
    const key = `stress-mixed-${uid()}`;
    await initLogger({ storageKey: key, captureUncaughtErrors: true });

    const OPS = 1000;

    // Fire all 3000 operations
    for (let i = 0; i < OPS; i++) {
      console.log(`console-${i}`);
      Logger.info(`logger-${i}`);
      dispatchError(new Error(`error-${i}`));
    }

    const TOTAL = OPS * 3;

    await vi.waitFor(
      async () => {
        const logs = await getLogs();
        expect(logs.length).toBeGreaterThanOrEqual(TOTAL);
      },
      { timeout: 30_000 },
    );

    const logs = await getLogs();

    // Verify console entries
    const consoleLogs = logs.filter((l) => l.message.startsWith('console-'));
    expect(consoleLogs.length).toBeGreaterThanOrEqual(OPS);

    // Verify Logger API entries
    const loggerLogs = logs.filter((l) => l.message.startsWith('logger-'));
    expect(loggerLogs.length).toBe(OPS);

    // Verify error capture entries
    const errorLogs = await getLogsByTag('uncaught');
    expect(errorLogs.length).toBe(OPS);

    // Verify level distribution
    const infoLogs = await getLogsByLevel('info');
    expect(infoLogs.length).toBeGreaterThanOrEqual(OPS); // Logger.info
    const errorLevel = await getLogsByLevel('error');
    expect(errorLevel.length).toBeGreaterThanOrEqual(OPS); // error captures

    // Spot-check specific entries
    expect(logs.some((l) => l.message === 'console-0')).toBe(true);
    expect(logs.some((l) => l.message === `console-${OPS - 1}`)).toBe(true);
    expect(logs.some((l) => l.message === 'logger-0')).toBe(true);
    expect(logs.some((l) => l.message === `logger-${OPS - 1}`)).toBe(true);
    expect(errorLogs.some((l) => l.message === 'error-0')).toBe(true);
    expect(errorLogs.some((l) => l.message === `error-${OPS - 1}`)).toBe(true);
  }, 60_000);
});
