import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { bindLogger, unbindLogger, Logger } from '../src/custom-logger.js';
import { TRIM_CHECK_INTERVAL } from '../src/types.js';
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

describe('Custom Logger - trim on persist', () => {
  let mockStorage: ReturnType<typeof createMockStorage>;
  const MAX_LOG_COUNT = 500;

  beforeEach(() => {
    mockStorage = createMockStorage();
    bindLogger(mockStorage, MAX_LOG_COUNT);
  });

  afterEach(() => {
    unbindLogger();
  });

  it('should trigger trim after TRIM_CHECK_INTERVAL writes via Logger.info()', async () => {
    for (let i = 0; i < TRIM_CHECK_INTERVAL; i++) {
      Logger.info(`msg-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.trimCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(mockStorage.trimCalls[0]).toBe(MAX_LOG_COUNT);
  });

  it('should trigger trim after TRIM_CHECK_INTERVAL writes via Logger.tag()', async () => {
    const tagged = Logger.tag('network');
    for (let i = 0; i < TRIM_CHECK_INTERVAL; i++) {
      tagged.info(`tagged-msg-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.trimCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(mockStorage.trimCalls[0]).toBe(MAX_LOG_COUNT);
    // Verify entries have the tag
    expect(mockStorage.entries.every((e) => e.tag === 'network')).toBe(true);
  });

  it('should NOT trigger trim before reaching TRIM_CHECK_INTERVAL writes', async () => {
    for (let i = 0; i < TRIM_CHECK_INTERVAL - 1; i++) {
      Logger.log(`msg-${i}`);
    }

    // Wait for all addEntry promises to resolve
    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(TRIM_CHECK_INTERVAL - 1);
    });

    expect(mockStorage.trimCalls).toHaveLength(0);
  });

  it('should trigger trim again after a second batch of TRIM_CHECK_INTERVAL writes', async () => {
    const totalWrites = TRIM_CHECK_INTERVAL * 2;
    for (let i = 0; i < totalWrites; i++) {
      Logger.warn(`msg-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.trimCalls.length).toBeGreaterThanOrEqual(2);
    });

    expect(mockStorage.trimCalls).toHaveLength(2);
    expect(mockStorage.trimCalls[0]).toBe(MAX_LOG_COUNT);
    expect(mockStorage.trimCalls[1]).toBe(MAX_LOG_COUNT);
  });

  it('should count tagged and untagged writes toward the same trim counter', async () => {
    const half = Math.floor(TRIM_CHECK_INTERVAL / 2);

    // Write half as untagged
    for (let i = 0; i < half; i++) {
      Logger.info(`untagged-${i}`);
    }

    // Write the rest as tagged to reach TRIM_CHECK_INTERVAL
    const tagged = Logger.tag('mixed');
    const remaining = TRIM_CHECK_INTERVAL - half;
    for (let i = 0; i < remaining; i++) {
      tagged.info(`tagged-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.trimCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(mockStorage.trimCalls[0]).toBe(MAX_LOG_COUNT);
  });

  it('should reset writeCount after unbindLogger and rebind', async () => {
    // Write almost TRIM_CHECK_INTERVAL entries
    for (let i = 0; i < TRIM_CHECK_INTERVAL - 1; i++) {
      Logger.info(`before-unbind-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(TRIM_CHECK_INTERVAL - 1);
    });

    expect(mockStorage.trimCalls).toHaveLength(0);

    // Unbind and rebind resets writeCount to 0
    unbindLogger();
    const freshStorage = createMockStorage();
    bindLogger(freshStorage, MAX_LOG_COUNT);

    // A single write should NOT trigger trim (counter was reset)
    Logger.info('after-rebind');

    await vi.waitFor(() => {
      expect(freshStorage.entries).toHaveLength(1);
    });

    expect(freshStorage.trimCalls).toHaveLength(0);

    // Clean up
    unbindLogger();
    // Re-bind original for afterEach unbindLogger
    bindLogger(mockStorage, MAX_LOG_COUNT);
  });

  it('should not break when storage.trim rejects', async () => {
    mockStorage.trim = async () => {
      throw new Error('Trim failed');
    };

    // Should not throw even when trim fails
    for (let i = 0; i < TRIM_CHECK_INTERVAL; i++) {
      Logger.info(`msg-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.entries).toHaveLength(TRIM_CHECK_INTERVAL);
    });

    // The test passes as long as no unhandled rejection occurs
  });

  it('should support all log levels triggering trim via tagged logger', async () => {
    const tagged = Logger.tag('levels');
    const perLevel = Math.ceil(TRIM_CHECK_INTERVAL / 5);

    for (let i = 0; i < perLevel; i++) {
      tagged.log(`log-${i}`);
      tagged.info(`info-${i}`);
      tagged.warn(`warn-${i}`);
      tagged.error(`error-${i}`);
      tagged.debug(`debug-${i}`);
    }

    await vi.waitFor(() => {
      expect(mockStorage.trimCalls.length).toBeGreaterThanOrEqual(1);
    });

    expect(mockStorage.trimCalls[0]).toBe(MAX_LOG_COUNT);
  });
});
