import type { LogEntry, StorageAdapter } from './types.js';
import { safeStringify } from './utils.js';

let errorHandler: ((event: Event) => void) | null = null;
let rejectionHandler: ((event: PromiseRejectionEvent) => void) | null = null;

export function installErrorHandlers(
  storage: StorageAdapter,
  maxDepth: number = 2,
  captureStackTraces: boolean = true,
): void {
  if (errorHandler) return;

  errorHandler = (event: Event) => {
    // Filter out resource loading errors (e.g., broken <img> src).
    // Those fire as plain Event, not ErrorEvent.
    if (!(event instanceof ErrorEvent)) return;

    const details: Record<string, unknown> = {};
    if (event.error instanceof Error) {
      details.name = event.error.name;
      details.message = event.error.message;
      if (captureStackTraces) {
        details.stack = event.error.stack;
      }
    } else {
      details.value = safeStringify(
        event.error,
        maxDepth,
        undefined,
        captureStackTraces,
      );
    }
    if (event.filename) details.filename = event.filename;
    if (event.lineno !== undefined) details.lineno = event.lineno;
    if (event.colno !== undefined) details.colno = event.colno;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      message: event.error instanceof Error ? event.error.message : String(event.message),
      args: [safeStringify(details, maxDepth, undefined, captureStackTraces)],
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
      const obj: Record<string, unknown> = {
        name: reason.name,
        message: reason.message,
      };
      if (captureStackTraces) {
        obj.stack = reason.stack;
      }
      details = safeStringify(obj, maxDepth, undefined, captureStackTraces);
    } else {
      message = safeStringify(reason, maxDepth, undefined, captureStackTraces);
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
