import type { LogEntry, LogLevel, StorageAdapter } from './types.js';

export interface TaggedLogger {
  log(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function buildLogEntry(
  level: LogLevel,
  message: string,
  args: unknown[],
  tag?: string,
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    args: args.map(safeStringify),
  };
  if (tag !== undefined) {
    entry.tag = tag;
  }
  return entry;
}

let storageRef: StorageAdapter | null = null;

export function bindLogger(storage: StorageAdapter): void {
  storageRef = storage;
}

export function unbindLogger(): void {
  storageRef = null;
}

function getStorage(): StorageAdapter {
  if (!storageRef) {
    throw new Error('Logger is not initialized. Call initLogger() first.');
  }
  return storageRef;
}

function persist(level: LogLevel, tag: string | undefined, message: string, args: unknown[]): void {
  const storage = getStorage();
  const entry = buildLogEntry(level, message, args, tag);
  storage.addEntry(entry).catch(() => {
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
