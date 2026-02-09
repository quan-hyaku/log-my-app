# @quan-hyaku/log-my-app

Browser logging library that intercepts `console.log`, `console.warn`, `console.error`, `console.info`, and `console.debug`, persisting all output to IndexedDB (with automatic localStorage fallback). Retrieve, filter, or download your logs at any time.

Includes a custom `Logger` API with tag-based grouping for structured logging alongside automatic console interception.

Zero external dependencies.

## Installation

```bash
npm install @quan-hyaku/log-my-app
```

## Usage

### Console interception

```ts
import { initLogger, getLogs, getLogsByLevel, clearLogs, downloadLogs, destroyLogger } from '@quan-hyaku/log-my-app';

// Start intercepting console methods
await initLogger();

// Use console as normal — all output is automatically persisted
console.log('App started');
console.warn('Disk space low');
console.error('Failed to fetch', { status: 500 });

// Retrieve all persisted logs
const logs = await getLogs();

// Filter by level
const errors = await getLogsByLevel('error');

// Download logs as a file
await downloadLogs('json'); // or 'txt'

// Clear all stored logs
await clearLogs();

// Stop intercepting and clean up
destroyLogger();
```

### Custom Logger with tags

```ts
import { initLogger, Logger, getLogsByTag, destroyLogger } from '@quan-hyaku/log-my-app';

await initLogger();

// Log without a tag (writes directly to storage, no console output)
Logger.info('App started');
Logger.error('Unexpected failure', { code: 500 });

// Log with a tag for grouping/filtering
Logger.tag('auth').info('User logged in', { userId: 42 });
Logger.tag('auth').warn('Session expiring soon');
Logger.tag('network').error('Request timeout', { url: '/api/data' });

// Retrieve logs by tag
const authLogs = await getLogsByTag('auth');
const networkLogs = await getLogsByTag('network');

destroyLogger();
```

The `Logger` writes directly to storage without producing console output. Console interception and the `Logger` API work independently -- use both together or either one alone.

## Configuration

Pass options to `initLogger()`:

```ts
await initLogger({
  maxLogCount: 10000,       // Maximum log entries to keep (default: 5000)
  storageKey: 'my-app-logs' // Storage key name (default: 'log-my-app')
});
```

### Storage behavior

- **IndexedDB** is used by default when available
- **localStorage** is used automatically as a fallback (e.g., Firefox Private Browsing, restricted environments)
- localStorage mode caps entries at 1000 regardless of `maxLogCount` to stay within browser storage limits
- Log rotation happens periodically — oldest entries are trimmed when the cap is exceeded

## API Reference

### `initLogger(config?: LoggerConfig): Promise<void>`

Initializes the logger, sets up storage, and patches console methods. Throws if called while already initialized.

### `destroyLogger(): void`

Restores original console methods and closes the storage connection.

### `getLogs(): Promise<LogEntry[]>`

Returns all stored log entries, oldest first.

### `getLogsByLevel(level: LogLevel): Promise<LogEntry[]>`

Returns log entries filtered by level. Valid levels: `'log'`, `'warn'`, `'error'`, `'info'`, `'debug'`.

### `getLogsByTag(tag: string): Promise<LogEntry[]>`

Returns log entries that match the given tag.

### `clearLogs(): Promise<void>`

Deletes all stored log entries.

### `downloadLogs(format?: 'json' | 'txt'): Promise<void>`

Triggers a file download of all stored logs.

- `'json'` (default) — prettified JSON array of `LogEntry` objects
- `'txt'` — human-readable format: `[timestamp] [LEVEL] message args`

### `Logger`

A singleton object for structured logging that writes directly to storage (no console output). Must be used after `initLogger()` has been called.

- `Logger.log(message, ...args)` — log at `'log'` level
- `Logger.info(message, ...args)` — log at `'info'` level
- `Logger.warn(message, ...args)` — log at `'warn'` level
- `Logger.error(message, ...args)` — log at `'error'` level
- `Logger.debug(message, ...args)` — log at `'debug'` level
- `Logger.tag(name)` — returns a `TaggedLogger` that attaches the given tag to every entry

### `TaggedLogger`

Returned by `Logger.tag(name)`. Has the same five methods (`log`, `info`, `warn`, `error`, `debug`) but every entry is tagged with the name passed to `.tag()`.

```ts
const auth = Logger.tag('auth');
auth.info('login succeeded');  // entry.tag === 'auth'
auth.error('token expired');   // entry.tag === 'auth'
```

## Types

```ts
type LogLevel = 'log' | 'warn' | 'error' | 'info' | 'debug';

interface LogEntry {
  timestamp: string;  // ISO 8601 UTC
  level: LogLevel;
  message: string;    // First console argument, stringified
  args: string[];     // Remaining arguments, each stringified
  tag?: string;       // Optional tag for grouping (set via Logger.tag())
}

interface LoggerConfig {
  maxLogCount?: number;   // default: 5000
  storageKey?: string;    // default: 'log-my-app'
}
```

## License

MIT
