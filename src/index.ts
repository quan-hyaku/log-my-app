export type { LogEntry, LogLevel, LoggerConfig } from './types.js';
export type { TaggedLogger } from './custom-logger.js';
export { LOG_LEVELS } from './types.js';
export {
  initLogger,
  destroyLogger,
  getLogs,
  getLogsByLevel,
  getLogsByTag,
  clearLogs,
  downloadLogs,
} from './logger.js';
export { Logger } from './custom-logger.js';
