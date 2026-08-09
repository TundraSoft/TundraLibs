/**
 * @fileoverview `@tundralibs/tracer/otlp` — OTLP/HTTP JSON export.
 *
 * A separate subpath so the tracer core stays dependency-light: importing
 * `@tundralibs/tracer` never pulls in an HTTP client or a schema validator.
 * Only code that actually ships spans to a collector pays for them.
 *
 * @module
 */

export { OTLPExporter, type OTLPExporterOptions } from './OTLPExporter.ts';
export {
  encodeSpans,
  type OtlpKeyValue,
  type OtlpSpanPayload,
  type OtlpTraceRequest,
  toAnyValue,
  toKeyValues,
} from './encode.ts';
