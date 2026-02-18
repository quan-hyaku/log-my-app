import type { LogEntry, LogLevel, LoggerConfig, StorageAdapter } from './types.js';
import { DEFAULT_MAX_LOG_COUNT, DEFAULT_STORAGE_KEY } from './types.js';
import { createStorage } from './storage.js';
import { ConsoleInterceptor } from './interceptor.js';
import { bindLogger, unbindLogger } from './custom-logger.js';
import { installErrorHandlers, uninstallErrorHandlers } from './error-handler.js';

let storage: StorageAdapter | null = null;
let interceptor: ConsoleInterceptor | null = null;

export async function initLogger(config?: LoggerConfig): Promise<void> {
  if (interceptor?.isInstalled()) {
    throw new Error('Logger is already initialized. Call destroyLogger() first.');
  }

  const maxLogCount = config?.maxLogCount ?? DEFAULT_MAX_LOG_COUNT;
  const storageKey = config?.storageKey ?? DEFAULT_STORAGE_KEY;
  const maxDepth = config?.maxDepth ?? 2;
  const captureStackTraces = config?.captureStackTraces ?? true;

  storage = await createStorage(storageKey, maxLogCount);
  interceptor = new ConsoleInterceptor(storage, maxLogCount, maxDepth, captureStackTraces);
  interceptor.install();
  bindLogger(storage, maxLogCount, maxDepth, captureStackTraces);

  if (config?.captureUncaughtErrors === true) {
    installErrorHandlers(storage, maxDepth, captureStackTraces);
  }
}

export function destroyLogger(): void {
  uninstallErrorHandlers();
  unbindLogger();
  if (interceptor) {
    interceptor.uninstall();
    interceptor = null;
  }
  if (storage) {
    storage.close();
    storage = null;
  }
}

export async function getLogs(): Promise<LogEntry[]> {
  ensureInitialized(storage);
  return storage.getAll();
}

export async function getLogsByLevel(level: LogLevel): Promise<LogEntry[]> {
  ensureInitialized(storage);
  return storage.getByLevel(level);
}

export async function getLogsByTag(tag: string): Promise<LogEntry[]> {
  ensureInitialized(storage);
  return storage.getByTag(tag);
}

export async function clearLogs(): Promise<void> {
  ensureInitialized(storage);
  return storage.clear();
}

export async function downloadLogs(format: 'json' | 'txt' = 'json'): Promise<void> {
  ensureInitialized(storage);
  const logs = await storage.getAll();

  let content: string;
  let filename: string;
  let mimeType: string;

  if (format === 'json') {
    content = JSON.stringify(logs, null, 2);
    filename = 'logs.json';
    mimeType = 'application/json;charset=utf-8';
  } else {
    content = logs.map(formatLogLine).join('\n');
    filename = 'logs.txt';
    mimeType = 'text/plain;charset=utf-8';
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatLogLine(entry: LogEntry): string {
  const args = entry.args.length > 0 ? ' ' + entry.args.join(' ') : '';
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] ${entry.message}${args}`;
}

function ensureInitialized(
  s: StorageAdapter | null,
): asserts s is StorageAdapter {
  if (!s) {
    throw new Error('Logger is not initialized. Call initLogger() first.');
  }
}
