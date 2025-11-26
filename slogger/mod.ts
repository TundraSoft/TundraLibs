export {
  compactFormat,
  defaultMaskingFormatter,
  detailedFormat,
  jsonFormatter,
  keyValueFormat,
  type MaskingConfig,
  maskingFormatter,
  MaskingStrategy,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
} from './formatters/mod.ts';

export {
  AbstractHandler,
  BlackholeHandler,
  ConsoleHandler,
  type ConsoleHandlerOptions,
  FileHandler,
  type FileHandlerOptions,
  type HandlerOptions,
  HTTPHandler,
  type HTTPHandlerOptions,
} from './handlers/mod.ts';

export type { SloggerFormatter, SlogObject } from './types/mod.ts';

export {
  type HandlerConfig,
  Slogger,
  type SloggerHandlerOption,
  type SloggerOptions,
} from './Slogger.ts';

export { LogManager } from './LogManager.ts';

// Re-export SyslogSeverities from utils for convenience
export { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
