import type { LogEntry, LogLevel, StorageAdapter } from './types.js';
import { LOG_LEVELS, TRIM_CHECK_INTERVAL } from './types.js';

type ConsoleMethod = (...args: unknown[]) => void;

interface OriginalMethods {
  log: ConsoleMethod;
  warn: ConsoleMethod;
  error: ConsoleMethod;
  info: ConsoleMethod;
  debug: ConsoleMethod;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function createLogEntry(level: LogLevel, args: unknown[]): LogEntry {
  const [first, ...rest] = args;
  return {
    timestamp: new Date().toISOString(),
    level,
    message: first !== undefined ? safeStringify(first) : '',
    args: rest.map(safeStringify),
  };
}

export class ConsoleInterceptor {
  private originals: OriginalMethods | null = null;
  private storage: StorageAdapter;
  private maxLogCount: number;
  private writeCount = 0;
  private installed = false;

  constructor(storage: StorageAdapter, maxLogCount: number) {
    this.storage = storage;
    this.maxLogCount = maxLogCount;
  }

  install(): void {
    if (this.installed) return;
    if (typeof console === 'undefined') return;

    this.originals = {
      log: console.log.bind(console),
      warn: console.warn.bind(console),
      error: console.error.bind(console),
      info: console.info.bind(console),
      debug: console.debug.bind(console),
    };

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
    const entry = createLogEntry(level, args);
    this.storage.addEntry(entry).then(() => {
      this.writeCount++;
      if (this.writeCount >= TRIM_CHECK_INTERVAL) {
        this.writeCount = 0;
        this.storage.trim(this.maxLogCount).catch(() => {
          // Trim failures are non-critical
        });
      }
    }).catch(() => {
      // Persist failures should never break the app
    });
  }
}
