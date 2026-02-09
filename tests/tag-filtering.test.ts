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

describe('Tag filtering - getLogsByTag', () => {
  beforeEach(async () => {
    await initLogger({ storageKey: 'tag-filter-' + Math.random().toString(36).slice(2) });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should return only entries with the specified tag', async () => {
    Logger.tag('auth').info('login attempt');
    Logger.tag('auth').warn('login failed');
    Logger.tag('network').error('timeout');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs).toHaveLength(3);
    });

    const authLogs = await getLogsByTag('auth');
    expect(authLogs).toHaveLength(2);
    expect(authLogs.every((l) => l.tag === 'auth')).toBe(true);
  });

  it('should exclude untagged entries from tag queries', async () => {
    Logger.info('untagged msg');
    Logger.tag('auth').info('tagged msg');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs).toHaveLength(2);
    });

    const authLogs = await getLogsByTag('auth');
    expect(authLogs).toHaveLength(1);
    expect(authLogs[0]!.message).toBe('tagged msg');
  });

  it('should exclude console.log (untagged) entries from tag queries', async () => {
    console.log('console untagged');
    Logger.tag('auth').info('logger tagged');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(2);
    });

    const authLogs = await getLogsByTag('auth');
    expect(authLogs).toHaveLength(1);
    expect(authLogs[0]!.message).toBe('logger tagged');
    expect(authLogs[0]!.tag).toBe('auth');
  });

  it('should return empty array for nonexistent tag', async () => {
    Logger.tag('auth').info('auth msg');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs).toHaveLength(1);
    });

    const results = await getLogsByTag('nonexistent');
    expect(results).toEqual([]);
  });

  it('should throw when getLogsByTag is called before init', async () => {
    destroyLogger();
    await expect(getLogsByTag('auth')).rejects.toThrow('Logger is not initialized');
  });
});

describe('Tag filtering - edge cases', () => {
  beforeEach(async () => {
    await initLogger({ storageKey: 'tag-edge-' + Math.random().toString(36).slice(2) });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should handle empty string tag', async () => {
    Logger.tag('').info('empty tag msg');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogs();
    expect(logs[0]!.tag).toBe('');

    const results = await getLogsByTag('');
    expect(results).toHaveLength(1);
    expect(results[0]!.message).toBe('empty tag msg');
  });

  it('should distinguish same message with different tags', async () => {
    Logger.tag('auth').info('same message');
    Logger.tag('network').info('same message');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs).toHaveLength(2);
    });

    const authLogs = await getLogsByTag('auth');
    expect(authLogs).toHaveLength(1);
    expect(authLogs[0]!.message).toBe('same message');
    expect(authLogs[0]!.tag).toBe('auth');

    const networkLogs = await getLogsByTag('network');
    expect(networkLogs).toHaveLength(1);
    expect(networkLogs[0]!.message).toBe('same message');
    expect(networkLogs[0]!.tag).toBe('network');
  });

  it('should return empty array when all entries are untagged', async () => {
    Logger.info('no tag 1');
    Logger.info('no tag 2');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs).toHaveLength(2);
    });

    const results = await getLogsByTag('anything');
    expect(results).toEqual([]);
  });

  it('should handle same message with tag and without tag', async () => {
    Logger.info('duplicate msg');
    Logger.tag('tagged').info('duplicate msg');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs).toHaveLength(2);
    });

    const taggedResults = await getLogsByTag('tagged');
    expect(taggedResults).toHaveLength(1);
    expect(taggedResults[0]!.tag).toBe('tagged');

    const all = await getLogs();
    const untagged = all.filter((l) => l.message === 'duplicate msg' && l.tag === undefined);
    expect(untagged).toHaveLength(1);
  });
});

describe('Integration - console.log + Logger + filtering', () => {
  beforeEach(async () => {
    await initLogger({ storageKey: 'integration-' + Math.random().toString(36).slice(2) });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should mix console.log (untagged) and Logger.tag (tagged) and filter by tag', async () => {
    console.log('console msg');
    console.error('console error');
    Logger.tag('auth').info('auth login');
    Logger.tag('auth').warn('auth warning');
    Logger.tag('network').error('network fail');
    Logger.info('logger untagged');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(6);
    });

    const authLogs = await getLogsByTag('auth');
    expect(authLogs).toHaveLength(2);
    expect(authLogs.every((l) => l.tag === 'auth')).toBe(true);

    const networkLogs = await getLogsByTag('network');
    expect(networkLogs).toHaveLength(1);
    expect(networkLogs[0]!.tag).toBe('network');
    expect(networkLogs[0]!.level).toBe('error');
  });

  it('should filter by level across both tagged and untagged entries', async () => {
    console.error('console error');
    Logger.tag('auth').error('auth error');
    Logger.error('logger error no tag');
    Logger.tag('network').info('network info');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(4);
    });

    const errors = await getLogsByLevel('error');
    expect(errors.length).toBeGreaterThanOrEqual(3);
    expect(errors.every((e) => e.level === 'error')).toBe(true);

    // Errors include both tagged and untagged
    const tagged = errors.filter((e) => e.tag !== undefined);
    expect(tagged.length).toBeGreaterThanOrEqual(1);
  });

  it('should clear all entries including tagged ones', async () => {
    Logger.tag('auth').info('tagged');
    console.log('untagged');
    Logger.info('logger untagged');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });

    await clearLogs();

    const logs = await getLogs();
    expect(logs).toEqual([]);

    const taggedAfter = await getLogsByTag('auth');
    expect(taggedAfter).toEqual([]);
  });

  it('should persist entries from Logger and console.log to the same storage', async () => {
    console.log('from console');
    Logger.info('from logger');
    Logger.tag('tag1').warn('from tagged logger');

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.length).toBeGreaterThanOrEqual(3);
    });

    const all = await getLogs();
    expect(all.some((l) => l.message === 'from console')).toBe(true);
    expect(all.some((l) => l.message === 'from logger')).toBe(true);
    expect(all.some((l) => l.message === 'from tagged logger' && l.tag === 'tag1')).toBe(true);
  });
});
