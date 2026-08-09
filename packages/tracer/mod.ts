/**
 * @fileoverview `@tundralibs/tracer` — distributed tracing that completes the
 * observability triad with `slogger` (logs) and `metro-man` (metrics).
 *
 * Spans nest automatically: a span opened inside another becomes its child at
 * any call depth and across every `await`, because the active span lives in an
 * `ambient` async context rather than being threaded through signatures. W3C
 * `traceparent` propagation carries the trace across process boundaries.
 *
 * - {@link Tracer} — creates spans, samples, exports.
 * - {@link Span} — one unit of work.
 * - {@link extract} / {@link inject} — W3C Trace Context propagation.
 * - `ConsoleExporter` / `MemoryExporter` — built-in destinations.
 *
 * @author TundraSoft
 *
 * @module
 */

export { Tracer } from './Tracer.ts';
export { Span, type SpanInit } from './Span.ts';
export {
  BatchSpanProcessor,
  type BatchSpanProcessorOptions,
} from './BatchSpanProcessor.ts';
export { SemConv, type SemConvKey } from './semconv.ts';
export { activeSpan } from './activeSpan.ts';
export {
  createRandomIdGenerator,
  type RandomBytes,
  randomIdGenerator,
} from './ids.ts';
export {
  extract,
  FLAG_SAMPLED,
  inject,
  TRACEPARENT_HEADER,
} from './propagation.ts';
export { alwaysOffSampler, alwaysOnSampler, ratioSampler } from './samplers.ts';
export {
  ConsoleExporter,
  type ConsoleExporterOptions,
  MemoryExporter,
} from './exporters/mod.ts';
export { SpanKind, SpanStatusCode } from './types/mod.ts';
export type {
  Attributes,
  AttributeValue,
  HeadersLike,
  IdGenerator,
  Sampler,
  SamplingInput,
  SpanContext,
  SpanData,
  SpanEvent,
  SpanExporter,
  SpanOptions,
  SpanStatus,
  TracerOptions,
} from './types/mod.ts';
export {
  TracerConfigError,
  type TracerConfigErrorMeta,
  TracerError,
} from './errors/mod.ts';
