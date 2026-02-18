import type { LogEntry, LogLevel, StorageAdapter } from './types.js';
import { TRIM_CHECK_INTERVAL } from './types.js';
import { safeStringify } from './utils.js';

export interface TaggedLogger {
  log(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

interface StringifyConfig {
  maxDepth: number;
  captureStackTraces: boolean;
}

function buildLogEntry(
  level: LogLevel,
  message: string,
  args: unknown[],
  config: StringifyConfig,
  tag?: string,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    args: args.map((a) =>
      safeStringify(a, config.maxDepth, undefined, config.captureStackTraces),
    ),
  };
  if (tag !== undefined) {
    entry.tag = tag;
  }
  return entry;
}

let storageRef: StorageAdapter | null = null;
let configRef: StringifyConfig = { maxDepth: 2, captureStackTraces: true };
let maxLogCountRef = 0;
let writeCount = 0;

export function bindLogger(
  storage: StorageAdapter,
  maxLogCount: number,
  maxDepth: number = 2,
  captureStackTraces: boolean = true,
): void {
  storageRef = storage;
  maxLogCountRef = maxLogCount;
  configRef = { maxDepth, captureStackTraces };
  writeCount = 0;
}

export function unbindLogger(): void {
  storageRef = null;
  configRef = { maxDepth: 2, captureStackTraces: true };
  maxLogCountRef = 0;
  writeCount = 0;
}

function getStorage(): StorageAdapter {
  if (!storageRef) {
    throw new Error('Logger is not initialized. Call initLogger() first.');
  }
  return storageRef;
}

function persist(level: LogLevel, tag: string | undefined, message: string, args: unknown[]): void {
  const storage = getStorage();
  const entry = buildLogEntry(level, message, args, configRef, tag);
  storage
    .addEntry(entry)
    .then(() => {
      writeCount++;
      if (writeCount >= TRIM_CHECK_INTERVAL) {
        writeCount = 0;
        storage.trim(maxLogCountRef).catch(() => {
          // Trim failures are non-critical
        });
      }
    })
    .catch(() => {
      // Persist failures should never break the app
    });
}

function createTaggedLogger(tag: string): TaggedLogger {
  return {
    log(message: string, ...args: unknown[]) {
      persist('log', tag, message, args);
    },
    info(message: string, ...args: unknown[]) {
      persist('info', tag, message, args);
    },
    warn(message: string, ...args: unknown[]) {
      persist('warn', tag, message, args);
    },
    error(message: string, ...args: unknown[]) {
      persist('error', tag, message, args);
    },
    debug(message: string, ...args: unknown[]) {
      persist('debug', tag, message, args);
    },
  };
}

export const Logger = {
  log(message: string, ...args: unknown[]): void {
    persist('log', undefined, message, args);
  },
  info(message: string, ...args: unknown[]): void {
    persist('info', undefined, message, args);
  },
  warn(message: string, ...args: unknown[]): void {
    persist('warn', undefined, message, args);
  },
  error(message: string, ...args: unknown[]): void {
    persist('error', undefined, message, args);
  },
  debug(message: string, ...args: unknown[]): void {
    persist('debug', undefined, message, args);
  },
  tag(name: string): TaggedLogger {
    getStorage(); // Validate initialization eagerly
    return createTaggedLogger(name);
  },
};
