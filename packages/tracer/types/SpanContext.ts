/**
 * @fileoverview The {@link SpanContext} — the immutable, propagated identity
 * of a span. This is the part that crosses process boundaries via the W3C
 * `traceparent` header.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * The immutable identity of a span: which trace it belongs to, its own id, and
 * the sampling decision. Everything here is serialisable — it is exactly what a
 * W3C `traceparent` header carries.
 */
export type SpanContext = {
  /** Trace identifier — 32 lowercase hex characters, never all-zero. */
  traceId: string;
  /** Span identifier — 16 lowercase hex characters, never all-zero. */
  spanId: string;
  /**
   * W3C trace flags bitfield. Bit 0 (`0x01`) is the sampled flag; when unset,
   * the span is not recorded or exported.
   */
  traceFlags: number;
  /**
   * `true` when this context was extracted from an inbound `traceparent`
   * (i.e. it identifies a span in another process), `false`/absent when it was
   * created locally.
   */
  remote?: boolean;
};
