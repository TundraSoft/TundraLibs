/**
 * @fileoverview W3C Trace Context propagation — turning a `traceparent` header
 * into a {@link SpanContext} and back. This is what makes a trace span process
 * boundaries.
 *
 * Header format (version `00`):
 * `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`
 * `version-traceId-spanId-traceFlags`
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { extract, inject } from '@tundralibs/tracer';
 *
 * const parent = extract(request.headers);          // inbound: join the trace
 * headers.set('traceparent', inject(span.context)); // outbound: continue it
 * ```
 */

import type { HeadersLike, SpanContext } from './types/mod.ts';

/** The W3C header carrying trace identity. */
export const TRACEPARENT_HEADER = 'traceparent';

/** Trace-flags bit 0 — the span was sampled. */
export const FLAG_SAMPLED = 0x01;

/** Version `00` traceparent: `00-<32hex>-<16hex>-<2hex>`. */
const TRACEPARENT_PATTERN =
  /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

/**
 * Read a header case-insensitively from either a `Headers`-like object or a
 * plain record.
 */
const readHeader = (
  headers: HeadersLike,
  name: string,
): string | undefined => {
  const getter = (headers as { get?: unknown }).get;
  if (typeof getter === 'function') {
    const value = (headers as { get(n: string): string | null | undefined })
      .get(name);
    return value ?? undefined;
  }
  const record = headers as Record<string, string | string[] | undefined>;
  // Node lowercases inbound headers; scan case-insensitively for everything else.
  let value = record[name] ?? record[name.toLowerCase()];
  if (value === undefined) {
    const match = Object.keys(record).find(
      (key) => key.toLowerCase() === name.toLowerCase(),
    );
    if (match !== undefined) value = record[match];
  }
  return Array.isArray(value) ? value[0] : value;
};

/**
 * Parse an inbound `traceparent` into a {@link SpanContext}.
 *
 * Never throws: a missing, malformed, or forbidden header yields `undefined`,
 * meaning "no parent — start a new trace". A broken upstream header must not be
 * able to break this service.
 *
 * @param headers - Inbound headers. See {@link HeadersLike}.
 * @returns The parent {@link SpanContext} (with `remote: true`), or `undefined`.
 */
export function extract(headers: HeadersLike): SpanContext | undefined {
  const header = readHeader(headers, TRACEPARENT_HEADER);
  if (header === undefined) return undefined;

  const parts = TRACEPARENT_PATTERN.exec(header.trim());
  if (parts === null) return undefined;

  const [, version, traceId, spanId, flags] = parts as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  // `ff` is reserved as invalid by the spec. Future versions stay parseable
  // because the pattern reads the first four fields positionally.
  if (version === 'ff') return undefined;
  // All-zero ids are invalid per spec.
  if (/^0+$/.test(traceId) || /^0+$/.test(spanId)) return undefined;

  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
    remote: true,
  };
}

/**
 * Format a {@link SpanContext} as a `traceparent` header value, for attaching
 * to an outbound request so the callee joins this trace.
 *
 * @param context - The context to serialise — normally `span.context`.
 * @returns A version-`00` traceparent header value.
 */
export function inject(context: SpanContext): string {
  const flags = (context.traceFlags & 0xff).toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}
