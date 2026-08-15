/**
 * Record formatters for `@tundralibs/slogger` — JSON, logfmt, OTEL,
 * RFC 5424 syslog, masking, and the human-readable text layouts used by
 * handlers to serialize a log record.
 *
 * @module
 */
export { jsonFormatter, prettyJsonFormatter } from './jsonFormatter.ts';
export { logfmtFormatter, type LogfmtOptions } from './logfmt.ts';
export { otelLogFormatter, type OtelLogOptions } from './otel.ts';
export { rfc5424Formatter, type Rfc5424Options } from './rfc5424.ts';
export {
  defaultMaskingFormatter,
  maskingFormatter,
  type MaskingFormatterOptions,
  MaskingStrategy,
} from './maskingFormatter.ts';
export {
  compactFormat,
  detailedFormat,
  keyValueFormat,
  minimalistFormat,
  simpleFormatter,
  standardFormat,
} from './string.ts';
