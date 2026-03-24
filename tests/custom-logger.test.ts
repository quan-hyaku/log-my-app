import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initLogger,
  destroyLogger,
  getLogs,
  getLogsByTag,
} from '../src/logger.js';
import { Logger } from '../src/custom-logger.js';
import { nativeMethods } from '../src/interceptor.js';

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

  describe('Logger outputs to console via nativeMethods', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should call nativeMethods.log when using Logger.log()', () => {
      const spy = vi.spyOn(nativeMethods, 'log').mockImplementation(() => {});
      Logger.log('hello');
      expect(spy).toHaveBeenCalledWith('hello');
    });

    it('should call nativeMethods.info when using Logger.info()', () => {
      const spy = vi.spyOn(nativeMethods, 'info').mockImplementation(() => {});
      Logger.info('info msg');
      expect(spy).toHaveBeenCalledWith('info msg');
    });

    it('should call nativeMethods.warn when using Logger.warn()', () => {
      const spy = vi.spyOn(nativeMethods, 'warn').mockImplementation(() => {});
      Logger.warn('warn msg');
      expect(spy).toHaveBeenCalledWith('warn msg');
    });

    it('should call nativeMethods.error when using Logger.error()', () => {
      const spy = vi.spyOn(nativeMethods, 'error').mockImplementation(() => {});
      Logger.error('error msg');
      expect(spy).toHaveBeenCalledWith('error msg');
    });

    it('should call nativeMethods.debug when using Logger.debug()', () => {
      const spy = vi.spyOn(nativeMethods, 'debug').mockImplementation(() => {});
      Logger.debug('debug msg');
      expect(spy).toHaveBeenCalledWith('debug msg');
    });

    it('should pass extra arguments to the native console method', () => {
      const spy = vi.spyOn(nativeMethods, 'log').mockImplementation(() => {});
      Logger.log('msg', 42, { key: 'val' });
      expect(spy).toHaveBeenCalledWith('msg', 42, { key: 'val' });
    });

    it('should prefix tagged logger output with [tag]', () => {
      const spy = vi.spyOn(nativeMethods, 'error').mockImplementation(() => {});
      Logger.tag('MyTag').error('oops');
      expect(spy).toHaveBeenCalledWith('[MyTag]', 'oops');
    });

    it('should prefix tagged logger output with [tag] and pass extra args', () => {
      const spy = vi.spyOn(nativeMethods, 'warn').mockImplementation(() => {});
      Logger.tag('Network').warn('timeout', { url: '/api' });
      expect(spy).toHaveBeenCalledWith('[Network]', 'timeout', { url: '/api' });
    });

    it('should call the correct native method for each level via tagged logger', () => {
      const spies = {
        log: vi.spyOn(nativeMethods, 'log').mockImplementation(() => {}),
        info: vi.spyOn(nativeMethods, 'info').mockImplementation(() => {}),
        warn: vi.spyOn(nativeMethods, 'warn').mockImplementation(() => {}),
        error: vi.spyOn(nativeMethods, 'error').mockImplementation(() => {}),
        debug: vi.spyOn(nativeMethods, 'debug').mockImplementation(() => {}),
      };

      const tagged = Logger.tag('T');
      tagged.log('l');
      tagged.info('i');
      tagged.warn('w');
      tagged.error('e');
      tagged.debug('d');

      expect(spies.log).toHaveBeenCalledWith('[T]', 'l');
      expect(spies.info).toHaveBeenCalledWith('[T]', 'i');
      expect(spies.warn).toHaveBeenCalledWith('[T]', 'w');
      expect(spies.error).toHaveBeenCalledWith('[T]', 'e');
      expect(spies.debug).toHaveBeenCalledWith('[T]', 'd');
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
