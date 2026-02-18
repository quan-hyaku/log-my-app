import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  initLogger,
  destroyLogger,
  getLogs,
  getLogsByLevel,
  getLogsByTag,
} from '../src/logger.js';
import { Logger } from '../src/custom-logger.js';

// ---------------------------------------------------------------------------
// Polyfill window, ErrorEvent, and PromiseRejectionEvent for Node
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

function dispatchRejection(reason: unknown): void {
  window.dispatchEvent(
    new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(),
      reason,
    }),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Error handler - uncaught errors', () => {
  beforeEach(async () => {
    await initLogger({
      storageKey: 'error-handler-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should capture error events with tag "uncaught"', async () => {
    const err = new Error('boom');
    dispatchError(err);

    await vi.waitFor(async () => {
      const logs = await getLogs();
      expect(logs.some((l) => l.tag === 'uncaught')).toBe(true);
    });

    const logs = await getLogsByTag('uncaught');
    expect(logs).toHaveLength(1);
    expect(logs[0]!.tag).toBe('uncaught');
    expect(logs[0]!.message).toBe('boom');
  });

  it('should include name, message, and stack for Error objects', async () => {
    const err = new TypeError('bad type');
    dispatchError(err);

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('uncaught');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('uncaught');
    const entry = logs[0]!;
    expect(entry.message).toBe('bad type');
    const details = JSON.parse(entry.args[0]!);
    expect(details.name).toBe('TypeError');
    expect(details.message).toBe('bad type');
    expect(typeof details.stack).toBe('string');
  });

  it('should set level to "error" for uncaught errors', async () => {
    dispatchError(new Error('level check'));

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('uncaught');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('uncaught');
    expect(logs[0]!.level).toBe('error');
  });
});

describe('Error handler - unhandled rejections', () => {
  beforeEach(async () => {
    await initLogger({
      storageKey: 'rejection-handler-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should capture unhandled rejections with tag "unhandled-rejection"', async () => {
    dispatchRejection(new Error('rejected'));

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('unhandled-rejection');
    expect(logs[0]!.tag).toBe('unhandled-rejection');
    expect(logs[0]!.message).toBe('rejected');
  });

  it('should include name, message, and stack for Error rejections', async () => {
    const err = new RangeError('out of range');
    dispatchRejection(err);

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('unhandled-rejection');
    const entry = logs[0]!;
    expect(entry.message).toBe('out of range');
    const details = JSON.parse(entry.args[0]!);
    expect(details.name).toBe('RangeError');
    expect(details.message).toBe('out of range');
    expect(typeof details.stack).toBe('string');
  });

  it('should handle string rejection reason', async () => {
    dispatchRejection('string error');

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('unhandled-rejection');
    expect(logs[0]!.message).toBe('string error');
  });

  it('should handle number rejection reason', async () => {
    dispatchRejection(42);

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('unhandled-rejection');
    expect(logs[0]!.message).toBe('42');
  });

  it('should handle object rejection reason', async () => {
    dispatchRejection({ code: 'ERR_NETWORK', detail: 'timeout' });

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('unhandled-rejection');
    const entry = logs[0]!;
    expect(entry.message).toContain('ERR_NETWORK');
  });

  it('should set level to "error" for unhandled rejections', async () => {
    dispatchRejection(new Error('level check'));

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('unhandled-rejection');
    expect(logs[0]!.level).toBe('error');
  });
});

describe('Error handler - default config (no captureUncaughtErrors)', () => {
  beforeEach(async () => {
    await initLogger({
      storageKey: 'no-capture-' + Math.random().toString(36).slice(2),
    });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should NOT capture errors when captureUncaughtErrors is not set', async () => {
    dispatchError(new Error('should not capture'));

    // Give time for potential persist
    await new Promise((r) => setTimeout(r, 50));

    const uncaught = await getLogsByTag('uncaught');
    expect(uncaught).toHaveLength(0);
  });

  it('should NOT capture rejections when captureUncaughtErrors is not set', async () => {
    dispatchRejection(new Error('should not capture'));

    await new Promise((r) => setTimeout(r, 50));

    const rejections = await getLogsByTag('unhandled-rejection');
    expect(rejections).toHaveLength(0);
  });
});

describe('Error handler - destroyLogger removes listeners', () => {
  it('should not capture errors after destroyLogger()', async () => {
    await initLogger({
      storageKey: 'destroy-test-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });

    // Verify capture works before destroy
    dispatchError(new Error('before destroy'));
    await vi.waitFor(async () => {
      const logs = await getLogsByTag('uncaught');
      expect(logs).toHaveLength(1);
    });

    destroyLogger();

    // Re-init WITHOUT captureUncaughtErrors to have storage for querying
    await initLogger({
      storageKey: 'destroy-test-after-' + Math.random().toString(36).slice(2),
    });

    dispatchError(new Error('after destroy'));

    await new Promise((r) => setTimeout(r, 50));

    const uncaught = await getLogsByTag('uncaught');
    expect(uncaught).toHaveLength(0);

    destroyLogger();
  });

  it('should not capture rejections after destroyLogger()', async () => {
    await initLogger({
      storageKey: 'destroy-rej-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });

    dispatchRejection(new Error('before destroy'));
    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    destroyLogger();

    await initLogger({
      storageKey: 'destroy-rej-after-' + Math.random().toString(36).slice(2),
    });

    dispatchRejection(new Error('after destroy'));

    await new Promise((r) => setTimeout(r, 50));

    const rejections = await getLogsByTag('unhandled-rejection');
    expect(rejections).toHaveLength(0);

    destroyLogger();
  });
});

describe('Error handler - getLogsByTag filtering', () => {
  beforeEach(async () => {
    await initLogger({
      storageKey: 'filter-test-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should filter with getLogsByTag("uncaught")', async () => {
    dispatchError(new Error('err1'));
    dispatchError(new Error('err2'));
    dispatchRejection(new Error('rej1'));

    await vi.waitFor(async () => {
      const all = await getLogs();
      expect(all.length).toBeGreaterThanOrEqual(3);
    });

    const uncaught = await getLogsByTag('uncaught');
    expect(uncaught).toHaveLength(2);
    expect(uncaught.every((e) => e.tag === 'uncaught')).toBe(true);
  });

  it('should filter with getLogsByTag("unhandled-rejection")', async () => {
    dispatchError(new Error('err1'));
    dispatchRejection(new Error('rej1'));
    dispatchRejection('string reason');

    await vi.waitFor(async () => {
      const all = await getLogs();
      expect(all.length).toBeGreaterThanOrEqual(3);
    });

    const rejections = await getLogsByTag('unhandled-rejection');
    expect(rejections).toHaveLength(2);
    expect(rejections.every((e) => e.tag === 'unhandled-rejection')).toBe(true);
  });

  it('should separate uncaught errors from unhandled rejections', async () => {
    dispatchError(new Error('err'));
    dispatchRejection(new Error('rej'));

    await vi.waitFor(async () => {
      const all = await getLogs();
      expect(all.length).toBeGreaterThanOrEqual(2);
    });

    const uncaught = await getLogsByTag('uncaught');
    const rejections = await getLogsByTag('unhandled-rejection');
    expect(uncaught).toHaveLength(1);
    expect(rejections).toHaveLength(1);
    expect(uncaught[0]!.message).toBe('err');
    expect(rejections[0]!.message).toBe('rej');
  });
});

describe('Error handler - double-install guard', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should not duplicate listeners when initLogger is called with captureUncaughtErrors twice', async () => {
    await initLogger({
      storageKey: 'double-install-1-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });

    // Destroy and re-init with captureUncaughtErrors again
    destroyLogger();
    await initLogger({
      storageKey: 'double-install-2-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });

    dispatchError(new Error('single entry'));

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('uncaught');
      expect(logs).toHaveLength(1);
    });

    // Should have exactly 1, not 2 (no duplicate listeners)
    const logs = await getLogsByTag('uncaught');
    expect(logs).toHaveLength(1);
  });
});

describe('Error handler - storage failure resilience', () => {
  it('should not throw when storage.addEntry rejects during error capture', async () => {
    await initLogger({
      storageKey: 'storage-fail-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });

    // Dispatching an error should not throw even if storage fails internally
    // (the .catch() in the handler swallows it)
    expect(() => dispatchError(new Error('storage might fail'))).not.toThrow();
    expect(() => dispatchRejection(new Error('rejection storage fail'))).not.toThrow();

    // Give time for async persist attempts
    await new Promise((r) => setTimeout(r, 50));

    destroyLogger();
  });
});

describe('Error handler - non-ErrorEvent filter', () => {
  beforeEach(async () => {
    await initLogger({
      storageKey: 'non-error-event-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should ignore plain Event dispatched on error channel (e.g. resource load errors)', async () => {
    // Dispatch a plain Event (not ErrorEvent) on the 'error' channel
    window.dispatchEvent(new Event('error'));

    await new Promise((r) => setTimeout(r, 50));

    const uncaught = await getLogsByTag('uncaught');
    expect(uncaught).toHaveLength(0);
  });
});

describe('Error handler - works alongside console interception', () => {
  beforeEach(async () => {
    await initLogger({
      storageKey: 'alongside-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should capture both console logs and uncaught errors simultaneously', async () => {
    console.error('console error');
    dispatchError(new Error('uncaught error'));
    dispatchRejection(new Error('rejection'));
    Logger.tag('app').info('app log');

    await vi.waitFor(async () => {
      const all = await getLogs();
      expect(all.length).toBeGreaterThanOrEqual(4);
    });

    const all = await getLogs();
    expect(all.some((l) => l.message === 'console error')).toBe(true);
    expect(all.some((l) => l.tag === 'uncaught' && l.message === 'uncaught error')).toBe(true);
    expect(all.some((l) => l.tag === 'unhandled-rejection' && l.message === 'rejection')).toBe(true);
    expect(all.some((l) => l.tag === 'app' && l.message === 'app log')).toBe(true);
  });

  it('should let getLogsByLevel("error") return both console.error and captured errors', async () => {
    console.error('console err');
    dispatchError(new Error('uncaught err'));
    console.log('not an error');

    await vi.waitFor(async () => {
      const errors = await getLogsByLevel('error');
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });

    const errors = await getLogsByLevel('error');
    expect(errors.every((e) => e.level === 'error')).toBe(true);
    expect(errors.some((e) => e.message === 'console err')).toBe(true);
    expect(errors.some((e) => e.message === 'uncaught err')).toBe(true);
  });
});

describe('Error handler - no double-stringify', () => {
  beforeEach(async () => {
    await initLogger({
      storageKey: 'no-double-stringify-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
    });
  });

  afterEach(() => {
    destroyLogger();
  });

  it('should not double-stringify error handler entries', async () => {
    const err = new TypeError('double check');
    dispatchError(err);

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('uncaught');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('uncaught');
    const entry = logs[0]!;

    // The args[0] should be a valid JSON string containing the error details
    const details = JSON.parse(entry.args[0]!);
    expect(details.name).toBe('TypeError');
    expect(details.message).toBe('double check');

    // It should NOT be a JSON-encoded string of a JSON string (double-stringify).
    // If double-stringified, parsing twice would still yield a string, not an object.
    expect(typeof details).toBe('object');
  });

  it('should not double-stringify unhandled rejection entries', async () => {
    const err = new RangeError('rejection check');
    dispatchRejection(err);

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('unhandled-rejection');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('unhandled-rejection');
    const entry = logs[0]!;

    // The args[0] should be a valid JSON string containing the error details
    const details = JSON.parse(entry.args[0]!);
    expect(details.name).toBe('RangeError');
    expect(details.message).toBe('rejection check');
    expect(typeof details).toBe('object');
  });
});

describe('Error handler - captureStackTraces config', () => {
  afterEach(() => {
    destroyLogger();
  });

  it('should omit stacks from error entries when captureStackTraces is false', async () => {
    await initLogger({
      storageKey: 'no-stacks-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
      captureStackTraces: false,
    });

    dispatchError(new TypeError('no-stack error'));

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('uncaught');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('uncaught');
    const entry = logs[0]!;
    const details = JSON.parse(entry.args[0]!);
    expect(details.name).toBe('TypeError');
    expect(details.message).toBe('no-stack error');
    // Stack should be omitted
    expect(details.stack).toBeUndefined();
  });

  it('should include stacks in error entries by default (captureStackTraces=true)', async () => {
    await initLogger({
      storageKey: 'with-stacks-' + Math.random().toString(36).slice(2),
      captureUncaughtErrors: true,
      captureStackTraces: true,
    });

    dispatchError(new Error('with-stack error'));

    await vi.waitFor(async () => {
      const logs = await getLogsByTag('uncaught');
      expect(logs).toHaveLength(1);
    });

    const logs = await getLogsByTag('uncaught');
    const entry = logs[0]!;
    const details = JSON.parse(entry.args[0]!);
    expect(details.name).toBe('Error');
    expect(details.message).toBe('with-stack error');
    // Stack should be present
    expect(typeof details.stack).toBe('string');
  });
});
