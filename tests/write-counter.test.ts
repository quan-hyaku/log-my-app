import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WriteCounter } from '../src/write-counter.js';
import { TRIM_CHECK_INTERVAL } from '../src/types.js';

const PERSIST_INTERVAL = Math.max(1, Math.floor(TRIM_CHECK_INTERVAL / 5));
const STORAGE_KEY = 'test-wc';
const LS_KEY = `__${STORAGE_KEY}_writeCount__`;

describe('WriteCounter', () => {
  beforeEach(() => {
    localStorage.removeItem(LS_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(LS_KEY);
  });

  describe('basic increment/reset', () => {
    it('should start at 0 when no persisted value exists', () => {
      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.value).toBe(0);
    });

    it('should increment and return the new count', () => {
      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.increment()).toBe(1);
      expect(counter.increment()).toBe(2);
      expect(counter.value).toBe(2);
    });

    it('should reset count to 0 and persist', () => {
      const counter = new WriteCounter(STORAGE_KEY);
      counter.increment();
      counter.increment();
      counter.reset();

      expect(counter.value).toBe(0);
      expect(localStorage.getItem(LS_KEY)).toBe('0');
    });
  });

  describe('persistence across instances (simulating page refresh)', () => {
    it('should restore count from localStorage on construction', () => {
      const counter1 = new WriteCounter(STORAGE_KEY);
      // Write enough to trigger a persist
      for (let i = 0; i < PERSIST_INTERVAL; i++) {
        counter1.increment();
      }

      // Create a new counter (simulates page refresh)
      const counter2 = new WriteCounter(STORAGE_KEY);
      expect(counter2.value).toBe(PERSIST_INTERVAL);
    });

    it('should persist on explicit persist() call', () => {
      const counter = new WriteCounter(STORAGE_KEY);
      for (let i = 0; i < 3; i++) {
        counter.increment();
      }
      counter.persist();

      const counter2 = new WriteCounter(STORAGE_KEY);
      expect(counter2.value).toBe(3);
    });

    it('should accumulate writes across multiple init/destroy cycles', () => {
      // Session 1: write some entries
      const counter1 = new WriteCounter(STORAGE_KEY);
      for (let i = 0; i < 30; i++) {
        counter1.increment();
      }
      counter1.persist(); // simulates destroyLogger() calling persist

      // Session 2: continue where we left off
      const counter2 = new WriteCounter(STORAGE_KEY);
      expect(counter2.value).toBe(30);
      for (let i = 0; i < 25; i++) {
        counter2.increment();
      }
      counter2.persist();

      // Session 3: should have cumulative count
      const counter3 = new WriteCounter(STORAGE_KEY);
      expect(counter3.value).toBe(55);
    });
  });

  describe('trim trigger across sessions', () => {
    it('should trigger trim when cumulative writes across sessions reach TRIM_CHECK_INTERVAL', () => {
      // Session 1: write almost TRIM_CHECK_INTERVAL entries
      const almostFull = TRIM_CHECK_INTERVAL - 5;
      const counter1 = new WriteCounter(STORAGE_KEY);
      for (let i = 0; i < almostFull; i++) {
        counter1.increment();
      }
      counter1.persist();

      // Session 2: continue; the next 5 writes should push past TRIM_CHECK_INTERVAL
      const counter2 = new WriteCounter(STORAGE_KEY);
      expect(counter2.value).toBe(almostFull);

      let crossedThreshold = false;
      for (let i = 0; i < 10; i++) {
        const count = counter2.increment();
        if (count >= TRIM_CHECK_INTERVAL) {
          crossedThreshold = true;
          break;
        }
      }
      expect(crossedThreshold).toBe(true);
    });
  });

  describe('periodic persistence via PERSIST_INTERVAL', () => {
    it('should auto-persist to localStorage every PERSIST_INTERVAL increments', () => {
      const counter = new WriteCounter(STORAGE_KEY);

      // Increment just below PERSIST_INTERVAL - should not yet persist
      for (let i = 0; i < PERSIST_INTERVAL - 1; i++) {
        counter.increment();
      }
      // Value in localStorage may be null or stale
      const before = localStorage.getItem(LS_KEY);

      // One more increment should trigger persist
      counter.increment();
      const after = localStorage.getItem(LS_KEY);
      expect(after).toBe(String(PERSIST_INTERVAL));
    });

    it('should persist again after another PERSIST_INTERVAL increments', () => {
      const counter = new WriteCounter(STORAGE_KEY);
      for (let i = 0; i < PERSIST_INTERVAL * 2; i++) {
        counter.increment();
      }
      expect(localStorage.getItem(LS_KEY)).toBe(String(PERSIST_INTERVAL * 2));
    });
  });

  describe('corrupted/missing localStorage fallback', () => {
    it('should default to 0 when localStorage value is not a number', () => {
      localStorage.setItem(LS_KEY, 'not-a-number');
      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.value).toBe(0);
    });

    it('should default to 0 when localStorage value is negative', () => {
      localStorage.setItem(LS_KEY, '-5');
      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.value).toBe(0);
    });

    it('should default to 0 when localStorage value is NaN', () => {
      localStorage.setItem(LS_KEY, 'NaN');
      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.value).toBe(0);
    });

    it('should default to 0 when localStorage value is Infinity', () => {
      localStorage.setItem(LS_KEY, 'Infinity');
      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.value).toBe(0);
    });

    it('should default to 0 when localStorage value is empty string', () => {
      localStorage.setItem(LS_KEY, '');
      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.value).toBe(0);
    });

    it('should handle localStorage.getItem throwing', () => {
      const origGetItem = localStorage.getItem;
      localStorage.getItem = () => { throw new Error('Unavailable'); };

      const counter = new WriteCounter(STORAGE_KEY);
      expect(counter.value).toBe(0);

      localStorage.getItem = origGetItem;
    });

    it('should handle localStorage.setItem throwing on persist', () => {
      const counter = new WriteCounter(STORAGE_KEY);
      const origSetItem = localStorage.setItem;
      localStorage.setItem = () => { throw new Error('QuotaExceeded'); };

      // Should not throw
      expect(() => counter.persist()).not.toThrow();
      expect(() => counter.increment()).not.toThrow();

      localStorage.setItem = origSetItem;
    });
  });

  describe('key namespacing', () => {
    it('should use different localStorage keys for different storage keys', () => {
      const counter1 = new WriteCounter('app-a');
      const counter2 = new WriteCounter('app-b');

      for (let i = 0; i < PERSIST_INTERVAL; i++) {
        counter1.increment();
      }

      expect(counter2.value).toBe(0);
      expect(localStorage.getItem('__app-a_writeCount__')).toBe(String(PERSIST_INTERVAL));
      expect(localStorage.getItem('__app-b_writeCount__')).toBeNull();

      // Cleanup
      localStorage.removeItem('__app-a_writeCount__');
      localStorage.removeItem('__app-b_writeCount__');
    });
  });
});

describe('WriteCounter integration with initLogger/destroyLogger/clearLogs', () => {
  const INIT_STORAGE_KEY = 'test-wc-init-' + Math.random().toString(36).slice(2);
  const INIT_LS_KEY = `__${INIT_STORAGE_KEY}_writeCount__`;

  afterEach(async () => {
    // Ensure logger is destroyed between tests
    const { destroyLogger } = await import('../src/logger.js');
    try { destroyLogger(); } catch { /* already destroyed */ }
    localStorage.removeItem(INIT_LS_KEY);
  });

  it('clearLogs() should reset the write counter to 0', async () => {
    const { initLogger, destroyLogger, clearLogs } = await import('../src/logger.js');
    const { Logger } = await import('../src/custom-logger.js');

    await initLogger({ storageKey: INIT_STORAGE_KEY });

    // Write some entries so counter > 0
    for (let i = 0; i < 10; i++) {
      Logger.info(`msg-${i}`);
    }

    await vi.waitFor(() => {
      // Wait for async persists to complete
      const raw = localStorage.getItem(INIT_LS_KEY);
      // Counter might not have auto-persisted yet, but the in-memory value matters
      return true;
    });

    await clearLogs();

    // After clearLogs, the counter should be reset to 0
    // Verify by destroying (which persists) and checking localStorage
    destroyLogger();
    expect(localStorage.getItem(INIT_LS_KEY)).toBe('0');
  });

  it('destroyLogger() should persist the counter without resetting it', async () => {
    const { initLogger, destroyLogger } = await import('../src/logger.js');
    const { Logger } = await import('../src/custom-logger.js');

    await initLogger({ storageKey: INIT_STORAGE_KEY });

    // Write some entries
    for (let i = 0; i < 7; i++) {
      Logger.info(`msg-${i}`);
    }

    // Wait for async addEntry to complete
    await vi.waitFor(async () => {
      const { getLogs } = await import('../src/logger.js');
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(7);
    });

    destroyLogger();

    // The counter should be persisted with the count (not reset to 0)
    const persisted = localStorage.getItem(INIT_LS_KEY);
    expect(persisted).not.toBeNull();
    expect(Number(persisted)).toBe(7);
  });

  it('counter should survive across initLogger/destroyLogger cycles', async () => {
    const { initLogger, destroyLogger } = await import('../src/logger.js');
    const { Logger } = await import('../src/custom-logger.js');

    // Session 1
    await initLogger({ storageKey: INIT_STORAGE_KEY });
    for (let i = 0; i < 5; i++) {
      Logger.info(`session1-${i}`);
    }
    await vi.waitFor(async () => {
      const { getLogs } = await import('../src/logger.js');
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(5);
    });
    destroyLogger();

    // Session 2
    await initLogger({ storageKey: INIT_STORAGE_KEY });
    for (let i = 0; i < 3; i++) {
      Logger.info(`session2-${i}`);
    }
    await vi.waitFor(async () => {
      const { getLogs } = await import('../src/logger.js');
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });
    destroyLogger();

    // Counter should be cumulative: 5 + 3 = 8
    const persisted = localStorage.getItem(INIT_LS_KEY);
    expect(Number(persisted)).toBe(8);
  });
});

describe('WriteCounter integration with ConsoleInterceptor', () => {
  // These tests use mock storage to verify both interceptor and Logger.tag()
  // share the same counter and that it persists.

  let mockStorage: ReturnType<typeof createMockStorage>;
  let originalLog: typeof console.log;

  function createMockStorage() {
    const entries: Array<{ level: string; message: string }> = [];
    const trimCalls: number[] = [];
    return {
      entries,
      trimCalls,
      async init() {},
      async addEntry(entry: { level: string; message: string }) {
        entries.push(entry);
      },
      async getAll() { return [...entries]; },
      async getByLevel(level: string) { return entries.filter(e => e.level === level); },
      async getByTag(tag: string) { return entries.filter(() => false); },
      async clear() { entries.length = 0; },
      async count() { return entries.length; },
      async trim(maxCount: number) { trimCalls.push(maxCount); },
      async flush() {},
      close() {},
    };
  }

  beforeEach(() => {
    originalLog = console.log;
    localStorage.removeItem(LS_KEY);
  });

  afterEach(() => {
    console.log = originalLog;
    localStorage.removeItem(LS_KEY);
  });

  it('should share a single WriteCounter between ConsoleInterceptor and bindLogger', async () => {
    const { ConsoleInterceptor } = await import('../src/interceptor.js');
    const { bindLogger, unbindLogger, Logger } = await import('../src/custom-logger.js');

    const storage = createMockStorage();
    const counter = new WriteCounter(STORAGE_KEY);

    // Both use the same counter
    const interceptor = new ConsoleInterceptor(
      storage as never,
      5000,
      counter,
    );
    interceptor.install();
    bindLogger(storage as never, 5000, counter);

    // Log via console (interceptor) and Logger.tag() (custom-logger)
    console.log('from console');
    Logger.tag('test').info('from tag');

    await vi.waitFor(() => {
      expect(storage.entries).toHaveLength(2);
    });

    // Both writes go through the same counter
    expect(counter.value).toBe(2);

    interceptor.uninstall();
    unbindLogger();
  });

  it('should trigger trim when cumulative writes across console and Logger.tag reach TRIM_CHECK_INTERVAL', async () => {
    const { ConsoleInterceptor } = await import('../src/interceptor.js');
    const { bindLogger, unbindLogger, Logger } = await import('../src/custom-logger.js');

    const storage = createMockStorage();
    const counter = new WriteCounter(STORAGE_KEY);
    const MAX_LOG_COUNT = 500;

    const interceptor = new ConsoleInterceptor(
      storage as never,
      MAX_LOG_COUNT,
      counter,
    );
    interceptor.install();
    bindLogger(storage as never, MAX_LOG_COUNT, counter);

    const half = Math.floor(TRIM_CHECK_INTERVAL / 2);

    // Write half via console interceptor
    for (let i = 0; i < half; i++) {
      console.log(`console-${i}`);
    }

    // Write the rest via Logger.tag to reach TRIM_CHECK_INTERVAL
    const tagged = Logger.tag('shared');
    const remaining = TRIM_CHECK_INTERVAL - half;
    for (let i = 0; i < remaining; i++) {
      tagged.info(`tagged-${i}`);
    }

    await vi.waitFor(() => {
      expect(storage.trimCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(storage.trimCalls[0]).toBe(MAX_LOG_COUNT);

    interceptor.uninstall();
    unbindLogger();
  });
});
