import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initLogger,
  destroyLogger,
  getLogs,
  getLogsByLevel,
  clearLogs,
  downloadLogs,
} from '../src/logger.js';

describe('Logger lifecycle', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should initialize successfully', async () => {
    await expect(initLogger()).resolves.not.toThrow();
  });

  it('should throw when initialized twice', async () => {
    await initLogger();
    await expect(initLogger()).rejects.toThrow(
      'Logger is already initialized. Call destroyLogger() first.',
    );
  });

  it('should allow re-initialization after destroy', async () => {
    await initLogger();
    destroyLogger();
    await expect(initLogger()).resolves.not.toThrow();
  });

  it('should accept custom config', async () => {
    await expect(
      initLogger({ maxLogCount: 100, storageKey: 'custom-key' }),
    ).resolves.not.toThrow();
  });

  it('should not throw when destroying without initialization', () => {
    expect(() => destroyLogger()).not.toThrow();
  });

  it('should not throw when destroying multiple times', async () => {
    await initLogger();
    destroyLogger();
    expect(() => destroyLogger()).not.toThrow();
  });
});

describe('Logger API - getLogs / getLogsByLevel / clearLogs', () => {
  beforeEach(async () => {
    await initLogger({ storageKey: 'api-test-' + Math.random().toString(36).slice(2) });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should throw when getLogs is called before init', async () => {
    destroyLogger();
    await expect(getLogs()).rejects.toThrow('Logger is not initialized');
  });

  it('should throw when getLogsByLevel is called before init', async () => {
    destroyLogger();
    await expect(getLogsByLevel('log')).rejects.toThrow('Logger is not initialized');
  });

  it('should throw when clearLogs is called before init', async () => {
    destroyLogger();
    await expect(clearLogs()).rejects.toThrow('Logger is not initialized');
  });

  it('should return empty logs initially', async () => {
    const logs = await getLogs();
    expect(logs).toEqual([]);
  });

  it('should capture console.log calls', async () => {
    console.log('api test message');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    const logs = await getLogs();
    const found = logs.find((l) => l.message === 'api test message');
    expect(found).toBeDefined();
    expect(found!.level).toBe('log');
  });

  it('should filter logs by level', async () => {
    console.log('log msg');
    console.error('error msg');
    console.warn('warn msg');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });

    const errors = await getLogsByLevel('error');
    const found = errors.find((e) => e.message === 'error msg');
    expect(found).toBeDefined();
    expect(errors.every((e) => e.level === 'error')).toBe(true);
  });

  it('should clear all logs', async () => {
    console.log('to be cleared');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    await clearLogs();
    const logs = await getLogs();
    expect(logs).toEqual([]);
  });

  it('should capture all five console levels', async () => {
    console.log('l');
    console.warn('w');
    console.error('e');
    console.info('i');
    console.debug('d');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(5);
    });

    const logs = await getLogs();
    const levels = new Set(logs.map((l) => l.level));
    expect(levels.has('log')).toBe(true);
    expect(levels.has('warn')).toBe(true);
    expect(levels.has('error')).toBe(true);
    expect(levels.has('info')).toBe(true);
    expect(levels.has('debug')).toBe(true);
  });
});

describe('Logger API - log entry schema', () => {
  beforeEach(async () => {
    await initLogger({ storageKey: 'schema-test-' + Math.random().toString(36).slice(2) });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should have correct schema fields', async () => {
    console.log('schema test');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    const logs = await getLogs();
    const entry = logs.find((l) => l.message === 'schema test')!;
    expect(entry).toBeDefined();
    expect(typeof entry.timestamp).toBe('string');
    expect(entry.level).toBe('log');
    expect(typeof entry.message).toBe('string');
    expect(Array.isArray(entry.args)).toBe(true);
  });

  it('should have valid ISO timestamp', async () => {
    const before = new Date().toISOString();
    console.log('timestamp test');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });
    const after = new Date().toISOString();

    const logs = await getLogs();
    const entry = logs.find((l) => l.message === 'timestamp test')!;
    expect(entry.timestamp >= before).toBe(true);
    expect(entry.timestamp <= after).toBe(true);
    // Verify it parses as a valid date
    expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
  });

  it('should serialize multiple arguments', async () => {
    console.log('multi', 42, { foo: 'bar' }, [1, 2]);

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    const logs = await getLogs();
    const entry = logs.find((l) => l.message === 'multi')!;
    expect(entry.args).toContain('42');
    expect(entry.args).toContain('{"foo":"bar"}');
    expect(entry.args).toContain('[1,2]');
  });
});

describe('Logger API - downloadLogs', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should throw when called before init', async () => {
    await expect(downloadLogs()).rejects.toThrow('Logger is not initialized');
  });

  it('should call document.createElement and URL APIs for JSON format', async () => {
    await initLogger({ storageKey: 'dl-test-' + Math.random().toString(36).slice(2) });
    console.log('download test');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    // Mock browser APIs
    const clickFn = vi.fn();
    const revokeObjectURL = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:test-url');

    const origCreateElement = globalThis.document?.createElement;
    const origURL = globalThis.URL;

    globalThis.document = {
      createElement: vi.fn(() => ({
        href: '',
        download: '',
        click: clickFn,
      })),
    } as unknown as Document;

    globalThis.URL = {
      createObjectURL,
      revokeObjectURL,
    } as unknown as typeof URL;

    globalThis.Blob = class MockBlob {
      constructor(
        public parts: unknown[],
        public options: Record<string, string>,
      ) {}
    } as unknown as typeof Blob;

    try {
      await downloadLogs('json');
      expect(clickFn).toHaveBeenCalled();
      expect(createObjectURL).toHaveBeenCalled();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    } finally {
      if (origCreateElement) {
        globalThis.document = { createElement: origCreateElement } as unknown as Document;
      }
      globalThis.URL = origURL;
    }
  });
});

describe('Logger edge cases', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should handle objects with circular references', async () => {
    await initLogger({ storageKey: 'edge-circ-' + Math.random().toString(36).slice(2) });

    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    console.log('circular', obj);

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    const logs = await getLogs();
    const entry = logs.find((l) => l.message === 'circular')!;
    expect(entry).toBeDefined();
    // safeStringify falls back to String() for circular refs
    expect(typeof entry.args[0]).toBe('string');
  });

  it('should handle undefined and null arguments', async () => {
    await initLogger({ storageKey: 'edge-undef-' + Math.random().toString(36).slice(2) });

    console.log(undefined, null);

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    const logs = await getLogs();
    const entry = logs[logs.length - 1]!;
    expect(entry.message).toBe('');
    expect(entry.args).toContain('null');
  });

  it('should handle very large payloads (truncated by safeStringify)', async () => {
    await initLogger({ storageKey: 'edge-large-' + Math.random().toString(36).slice(2) });

    const bigString = 'A'.repeat(50_000);
    console.log(bigString);

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    const logs = await getLogs();
    // safeStringify truncates at default maxLength (10,240), so the
    // message will be truncated with "..." appended
    const entry = logs[logs.length - 1]!;
    expect(entry).toBeDefined();
    expect(entry.message.length).toBeLessThanOrEqual(10_243);
    expect(entry.message.startsWith('A')).toBe(true);
  });

  it('should handle rapid consecutive logs without losing data', async () => {
    await initLogger({ storageKey: 'edge-rapid-' + Math.random().toString(36).slice(2) });

    const count = 30;
    for (let i = 0; i < count; i++) {
      console.log(`rapid-${i}`);
    }

    await vi.waitFor(
      async () => {
        const logs = await getLogs();
        expect(logs.length).toBeGreaterThanOrEqual(count);
      },
      { timeout: 5000 },
    );

    const logs = await getLogs();
    for (let i = 0; i < count; i++) {
      expect(logs.some((l) => l.message === `rapid-${i}`)).toBe(true);
    }
  });

  it('should handle logging after clearLogs', async () => {
    await initLogger({ storageKey: 'edge-clear-' + Math.random().toString(36).slice(2) });

    console.log('before clear');
    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThan(0);
    });

    await clearLogs();
    console.log('after clear');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.some((l) => l.message === 'after clear')).toBe(true);
    });

    const logs = await getLogs();
    expect(logs.some((l) => l.message === 'before clear')).toBe(false);
  });
});
