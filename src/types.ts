export type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  args: string[];
  tag?: string;
}

export interface LoggerConfig {
  maxLogCount?: number;
  storageKey?: string;
  captureUncaughtErrors?: boolean;
  maxDepth?: number;
  captureStackTraces?: boolean;
}

export interface StorageAdapter {
  init(): Promise<void>;
  addEntry(entry: LogEntry): Promise<void>;
  getAll(): Promise<LogEntry[]>;
  getByLevel(level: LogLevel): Promise<LogEntry[]>;
  getByTag(tag: string): Promise<LogEntry[]>;
  clear(): Promise<void>;
  count(): Promise<number>;
  trim(maxCount: number): Promise<void>;
  flush(): Promise<void>;
  close(): void;
}

export const LOG_LEVELS: readonly LogLevel[] = ['log', 'warn', 'error', 'info', 'debug'] as const;

export const DEFAULT_MAX_LOG_COUNT = 5000;
export const DEFAULT_STORAGE_KEY = 'log-my-app';
export const LOCALSTORAGE_MAX_LOG_COUNT = 1000;
export const TRIM_CHECK_INTERVAL = 100;
