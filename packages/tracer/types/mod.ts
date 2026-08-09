/**
 * @fileoverview Re-exports the public type surface of `@tundralibs/tracer`.
 *
 * @module
 */

// Enums are values as well as types, so they are exported as values.
export { SpanKind } from './SpanKind.ts';
export { SpanStatusCode } from './SpanStatusCode.ts';

export type { AttributeValue } from './AttributeValue.ts';
export type { Attributes } from './Attributes.ts';
export type { HeadersLike } from './HeadersLike.ts';
export type { IdGenerator } from './IdGenerator.ts';
export type { Sampler } from './Sampler.ts';
export type { SamplingInput } from './SamplingInput.ts';
export type { SpanContext } from './SpanContext.ts';
export type { SpanData } from './SpanData.ts';
export type { SpanEvent } from './SpanEvent.ts';
export type { SpanExporter } from './SpanExporter.ts';
export type { SpanOptions } from './SpanOptions.ts';
export type { SpanStatus } from './SpanStatus.ts';
export type { TracerOptions } from './TracerOptions.ts';
