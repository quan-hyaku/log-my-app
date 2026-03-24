# Changelog

## v0.1.0 — Initial Release

Zero-dependency browser logging library.

- **Console interception** — Automatically intercepts `console.log`, `console.warn`, `console.error`, `console.info`, and `console.debug`
- **IndexedDB storage** with automatic **localStorage fallback**
- **Log retrieval** — `getLogs()`, `getLogsByLevel()`
- **Log download** — `downloadLogs('json')` or `downloadLogs('txt')`
- **Log cleanup** — `clearLogs()` with automatic log rotation
- **Lifecycle management** — `initLogger(config?)` / `destroyLogger()`
- TypeScript strict mode, ESM + CJS dual output

## v0.1.1 — Package Metadata

- Renamed package to `@quan-hyaku/log-my-app`
- Added GitHub repository, homepage, and bugs URLs to `package.json`
- Updated README install commands and imports to reflect scoped package name

## v0.1.2 — Tags, Custom Logger, and Uncaught Error Capture

### New Features

- **Tag-based grouping** — `LogEntry` now supports an optional `tag` field for filtering logs beyond just level
- **Custom Logger API** — Direct logging to storage without console output
  ```ts
  Logger.info("app started")
  Logger.tag("auth").info("user signed in")
  Logger.tag("network").error("request timeout")
  ```
- **`getLogsByTag(tag)`** — Filter logs by tag
- **Uncaught error capture** — Opt-in via `initLogger({ captureUncaughtErrors: true })`
  - Captures uncaught exceptions (tagged `'uncaught'`)
  - Captures unhandled Promise rejections (tagged `'unhandled-rejection'`)
  - Includes full error details: name, message, stack, filename, line, column

### Bug Fixes

- **Error serialization** — `Error` objects now correctly serialize with `name`, `message`, and `stack` instead of producing empty `"{}"`

## v0.1.3 — Logger.tag() Trim Fix

### Bug Fixes

- **Logger.tag() now triggers trimming** — `Logger.tag().info()` and other custom logger methods were missing write counting and trim logic, causing unbounded log growth when using the custom Logger API. Added `writeCount` tracking with `TRIM_CHECK_INTERVAL` to match the console interceptor's trim behavior.

## v0.1.4 — Persistent Write Counter

### Bug Fixes

- **Write counter persists across page refreshes** — `writeCount` previously reset to 0 on every browser refresh, meaning short sessions (< 100 writes) never triggered trimming. Introduced a shared `WriteCounter` class that persists the counter to localStorage, so cumulative writes across sessions are tracked correctly.
- **Shared counter** — Both the console interceptor and `Logger.tag()` paths now share a single `WriteCounter` instance for accurate tracking.
- **Counter auto-persists** every 20 increments and on reset, minimizing localStorage writes while limiting worst-case loss to 19 writes on a crash.
- **`clearLogs()` resets the counter** — Clearing logs now properly resets the write counter to 0.

## v0.1.5 — Trim Reliability and Error Visibility

### Bug Fixes

- **Fixed race condition in IndexedDB trim** — `trim()` now flushes pending buffered entries before counting, ensuring the IDB count reflects reality. Previously, trim could see a stale count and skip deletion.
- **Added missing IDB error handlers** — `countReq.onerror` and `cursorReq.onerror` in `trim()` now properly reject the promise instead of leaving it hanging.
- **Fixed double-resolve** in trim when entry count was already within limits.

### Improvements

- **Error visibility** — Replaced all silent `.catch(() => {})` blocks with internal warnings via a pristine `console.warn` reference. Trim, persist, and flush failures are now surfaced in the console without creating feedback loops with the interceptor.
