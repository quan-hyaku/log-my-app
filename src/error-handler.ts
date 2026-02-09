import type { LogEntry, StorageAdapter } from './types.js';

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) {
    return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

let errorHandler: ((event: Event) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

export function installErrorHandlers(storage: StorageAdapter): void {
  if (errorHandler) return;

  errorHandler = (event: Event) => {
    // Filter out resource loading errors (e.g., broken <img> src).
    // Those fire as plain Event, not ErrorEvent.
    if (!(event instanceof ErrorEvent)) return;

    const details: Record<string, unknown> = {};
    if (event.error instanceof Error) {
      details.name = event.error.name;
      details.message = event.error.message;
      details.stack = event.error.stack;
    } else {
      details.value = safeStringify(event.error);
    }
    if (event.filename) details.filename = event.filename;
    if (event.lineno !== undefined) details.lineno = event.lineno;
    if (event.colno !== undefined) details.colno = event.colno;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: event.error instanceof Error ? event.error.message : String(event.message),
      args: [JSON.stringify(details)],
      tag: 'uncaught',
    };

    storage.addEntry(entry).catch(() => {
      // Persist failures should never break the app
    });
  };

  rejectionHandler = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    let message: string;
    let details: string;

    if (reason instanceof Error) {
      message = reason.message;
      details = JSON.stringify({ name: reason.name, message: reason.message, stack: reason.stack });
    } else {
      message = safeStringify(reason);
      details = message;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message,
      args: [details],
      tag: 'unhandled-rejection',
    };

    storage.addEntry(entry).catch(() => {
      // Persist failures should never break the app
    });
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);
}

export function uninstallErrorHandlers(): void {
  if (errorHandler) {
    window.removeEventListener('error', errorHandler);
    errorHandler = null;
  }
  if (rejectionHandler) {
    window.removeEventListener('unhandledrejection', rejectionHandler);
    rejectionHandler = null;
  }
}
