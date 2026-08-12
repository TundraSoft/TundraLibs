/**
 * @fileoverview `@tundralibs/slogger` — cross-runtime structured
 * logging (Deno, Bun, Node) that fans a single log record out to many
 * destinations in-process: console, JSON, logfmt, syslog (RFC 5424),
 * file, HTTP, and TCP handlers, each with its own format, level
 * threshold, and masking. A `contextProvider` stamps every record with
 * ambient correlation data (request ids, trace ids) without threading
 * loggers through call stacks.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { ConsoleHandler, Slogger } from '@tundralibs/slogger';
 *
 * const log = new Slogger({
 *   appName: 'api',
 *   handlers: [new ConsoleHandler({ level: 'INFO' })],
 * });
 * log.info('server started', { port: 8080 });
 * ```
 */

export {
  compactFormat,
  defaultMaskingFormatter,
  detailedFormat,
  jsonFormatter,
  keyValueFormat,
  logfmtFormatter,
  type LogfmtOptions,
  maskingFormatter,
  type MaskingFormatterOptions,
  MaskingStrategy,
  minimalistFormat,
  otelLogFormatter,
  type OtelLogOptions,
  prettyJsonFormatter,
  rfc5424Formatter,
  type Rfc5424Options,
  simpleFormatter,
  standardFormat,
} from './formatters/mod.ts';

export {
  AbstractHandler,
  BlackholeHandler,
  type BlackholeHandlerOptions,
  ConsoleHandler,
  type ConsoleHandlerOptions,
  FileHandler,
  type FileHandlerOptions,
  type HandlerOptions,
  HTTPHandler,
  type HTTPHandlerOptions,
  MemoryHandler,
  type MemoryHandlerOptions,
  StreamHandler,
  type StreamHandlerOptions,
  SyslogHandler,
  type SyslogHandlerOptions,
  type SyslogTransport,
  TCPHandler,
  type TCPHandlerOptions,
} from './handlers/mod.ts';

export {
  SloggerConfigError,
  SloggerError,
  SloggerFinalizeError,
  type SloggerFinalizeFailure,
  SloggerHandlerError,
  type SloggerHandlerErrorContext,
} from './errors/mod.ts';

export type { SloggerFormatter, SlogObject } from './types/mod.ts';

export {
  type HandlerConfig,
  type LogContext,
  Slogger,
  type SloggerOptions,
} from './Slogger.ts';

export { LogManager } from './LogManager.ts';

// Re-export SyslogSeverities from utils for convenience
export { SyslogSeverities, type SyslogSeverity } from '@tundralibs/utils';
