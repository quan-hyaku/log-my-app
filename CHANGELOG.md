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
