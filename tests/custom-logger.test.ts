import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initLogger,
  destroyLogger,
  getLogs,
  getLogsByTag,
} from '../src/logger.js';
import { Logger } from '../src/custom-logger.js';

describe('Custom Logger API', () => {
  beforeEach(async () => {
    await initLogger({ storageKey: 'custom-logger-test-' + Math.random().toString(36).slice(2) });
  });

  afterEach(() => {
    destroyLogger();
  });

  describe('Logger without tag', () => {
    it('should persist Logger.info() to storage', async () => {
      Logger.info('info msg');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'info msg')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'info msg')!;
      expect(entry).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.tag).toBeUndefined();
    });

    it('should persist Logger.log() to storage', async () => {
      Logger.log('log msg');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'log msg')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'log msg')!;
      expect(entry.level).toBe('log');
      expect(entry.tag).toBeUndefined();
    });

    it('should persist Logger.warn() to storage', async () => {
      Logger.warn('warn msg');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'warn msg')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'warn msg')!;
      expect(entry.level).toBe('warn');
      expect(entry.tag).toBeUndefined();
    });

    it('should persist Logger.error() to storage', async () => {
      Logger.error('error msg');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'error msg')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'error msg')!;
      expect(entry.level).toBe('error');
      expect(entry.tag).toBeUndefined();
    });

    it('should persist Logger.debug() to storage', async () => {
      Logger.debug('debug msg');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'debug msg')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'debug msg')!;
      expect(entry.level).toBe('debug');
      expect(entry.tag).toBeUndefined();
    });

    it('should serialize extra arguments', async () => {
      Logger.info('with args', 42, { key: 'val' });

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'with args')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'with args')!;
      expect(entry.args).toContain('42');
      expect(entry.args).toContain('{"key":"val"}');
    });
  });

  describe('Logger.tag() - tagged logging', () => {
    it('should persist Logger.tag("auth").info() with tag "auth"', async () => {
      Logger.tag('auth').info('auth info');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'auth info')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'auth info')!;
      expect(entry).toBeDefined();
      expect(entry.level).toBe('info');
      expect(entry.tag).toBe('auth');
    });

    it('should persist Logger.tag("network").error() with tag "network"', async () => {
      Logger.tag('network').error('network error');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'network error')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'network error')!;
      expect(entry.level).toBe('error');
      expect(entry.tag).toBe('network');
    });

    it('should support all five levels via tag()', async () => {
      const tagged = Logger.tag('multi');
      tagged.log('t-log');
      tagged.info('t-info');
      tagged.warn('t-warn');
      tagged.error('t-error');
      tagged.debug('t-debug');

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.filter((l) => l.tag === 'multi')).toHaveLength(5);
      });

      const logs = await getLogs();
      const tagged_logs = logs.filter((l) => l.tag === 'multi');
      const levels = new Set(tagged_logs.map((l) => l.level));
      expect(levels.has('log')).toBe(true);
      expect(levels.has('info')).toBe(true);
      expect(levels.has('warn')).toBe(true);
      expect(levels.has('error')).toBe(true);
      expect(levels.has('debug')).toBe(true);
    });

    it('should serialize extra arguments in tagged logger', async () => {
      Logger.tag('data').info('payload', { foo: 'bar' }, [1, 2]);

      await vi.waitFor(async () => {
        const logs = await getLogs();
        expect(logs.some((l) => l.message === 'payload')).toBe(true);
      });

      const logs = await getLogs();
      const entry = logs.find((l) => l.message === 'payload')!;
      expect(entry.tag).toBe('data');
      expect(entry.args).toContain('{"foo":"bar"}');
      expect(entry.args).toContain('[1,2]');
    });
  });

  describe('Logger does NOT output to console', () => {
    it('should not call console.log when using Logger.log()', async () => {
      const spy = vi.spyOn(console, 'log');
      const callsBefore = spy.mock.calls.length;

      Logger.log('silent message');

      // Logger should not have called console.log
      // (console.log may have been called by vitest internals, so we check
      // that our specific message was NOT passed to console.log)
      const newCalls = spy.mock.calls.slice(callsBefore);
      const found = newCalls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('silent message')),
      );
      expect(found).toBe(false);

      spy.mockRestore();
    });

    it('should not call console.info when using Logger.info()', async () => {
      const spy = vi.spyOn(console, 'info');
      const callsBefore = spy.mock.calls.length;

      Logger.info('silent info');

      const newCalls = spy.mock.calls.slice(callsBefore);
      const found = newCalls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('silent info')),
      );
      expect(found).toBe(false);

      spy.mockRestore();
    });

    it('should not call console methods when using Logger.tag().warn()', async () => {
      const spy = vi.spyOn(console, 'warn');
      const callsBefore = spy.mock.calls.length;

      Logger.tag('test').warn('silent tagged warn');

      const newCalls = spy.mock.calls.slice(callsBefore);
      const found = newCalls.some((args) =>
        args.some((a) => typeof a === 'string' && a.includes('silent tagged warn')),
      );
      expect(found).toBe(false);

      spy.mockRestore();
    });
  });
});

describe('Custom Logger - not initialized', () => {
  it('should throw when Logger.log() is called before initLogger()', () => {
    expect(() => Logger.log('fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.info() is called before initLogger()', () => {
    expect(() => Logger.info('fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.warn() is called before initLogger()', () => {
    expect(() => Logger.warn('fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.error() is called before initLogger()', () => {
    expect(() => Logger.error('fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.debug() is called before initLogger()', () => {
    expect(() => Logger.debug('fail')).toThrow('Logger is not initialized');
  });

  it('should throw when Logger.tag() is called before initLogger()', () => {
    expect(() => Logger.tag('auth')).toThrow('Logger is not initialized');
  });
});
