import type { LogEntry, LogLevel, StorageAdapter } from './types.js';
import { LOG_LEVELS, TRIM_CHECK_INTERVAL } from './types.js';
import { safeStringify } from './utils.js';
import { warnInternal } from './internal-warn.js';
import type { WriteCounter } from './write-counter.js';

type ConsoleMethod = (...args: unknown[]) => void;

interface OriginalMethods {
  log: ConsoleMethod;
  warn: ConsoleMethod;
  error: ConsoleMethod;
  info: ConsoleMethod;
  debug: ConsoleMethod;
}

// Capture pristine console references at module load time,
// before any third-party code can monkey-patch them.
const nativeLog: ConsoleMethod =
  typeof console !== 'undefined' ? console.log.bind(console) : () => {};
const nativeWarn: ConsoleMethod =
  typeof console !== 'undefined' ? console.warn.bind(console) : () => {};
const nativeError: ConsoleMethod =
  typeof console !== 'undefined' ? console.error.bind(console) : () => {};
const nativeInfo: ConsoleMethod =
  typeof console !== 'undefined' ? console.info.bind(console) : () => {};
const nativeDebug: ConsoleMethod =
  typeof console !== 'undefined' ? console.debug.bind(console) : () => {};

export const nativeMethods: Readonly<OriginalMethods> = {
  log: nativeLog,
  warn: nativeWarn,
  error: nativeError,
  info: nativeInfo,
  debug: nativeDebug,
};

function createLogEntry(
  level: LogLevel,
  args: unknown[],
  maxDepth: number,
  captureStackTraces: boolean,
): LogEntry {
  const [first, ...rest] = args;
  return {
    timestamp: new Date().toISOString(),
    level,
    message:
      first !== undefined
        ? safeStringify(first, maxDepth, undefined, captureStackTraces)
        : '',
    args: rest.map((a) =>
      safeStringify(a, maxDepth, undefined, captureStackTraces),
    ),
  };
}

export class ConsoleInterceptor {
  private originals: OriginalMethods | null = null;
  private storage: StorageAdapter;
  private maxLogCount: number;
  private maxDepth: number;
  private captureStackTraces: boolean;
  private counter: WriteCounter;
  private installed = false;

  constructor(
    storage: StorageAdapter,
    maxLogCount: number,
    counter: WriteCounter,
    maxDepth: number = 2,
    captureStackTraces: boolean = true,
  ) {
    this.storage = storage;
    this.maxLogCount = maxLogCount;
    this.counter = counter;
    this.maxDepth = maxDepth;
    this.captureStackTraces = captureStackTraces;
  }

  install(): void {
    if (this.installed) return;
    if (typeof console === 'undefined') return;

    // Use the pristine module-level references so we always call the
    // real console methods, even if another library patched console
    // between module load and install() time.
    this.originals = { ...nativeMethods };

    for (const level of LOG_LEVELS) {
      const original = this.originals[level];
      console[level] = (...args: unknown[]) => {
        original(...args);
        this.persist(level, args);
      };
    }

    this.installed = true;
  }

  uninstall(): void {
    if (!this.installed || !this.originals) return;

    for (const level of LOG_LEVELS) {
      console[level] = this.originals[level];
    }

    this.originals = null;
    this.installed = false;
  }

  isInstalled(): boolean {
    return this.installed;
  }

  private persist(level: LogLevel, args: unknown[]): void {
    const entry = createLogEntry(
      level,
      args,
      this.maxDepth,
      this.captureStackTraces,
    );
    this.storage
      .addEntry(entry)
      .then(() => {
        const count = this.counter.increment();
        if (count >= TRIM_CHECK_INTERVAL) {
          this.counter.reset();
          this.storage.trim(this.maxLogCount).catch((err: unknown) => {
            warnInternal('[log-my-app] trim failed:', err);
          });
        }
      })
      .catch((err: unknown) => {
        warnInternal('[log-my-app] persist failed:', err);
      });
  }
}
