/**
 * @fileoverview {@link SpanStatusCode} — a span's outcome. Values match the
 * OTLP `Status.StatusCode` enum.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * A span's outcome. Numeric values are OTLP-defined and emitted verbatim.
 *
 * `UNSET` is the default and means "no explicit judgement" — it is *not* a
 * failure. Only set `ERROR` for genuine failures, so backends can compute
 * meaningful error rates.
 */
export enum SpanStatusCode {
  /** No explicit status — the default. */
  UNSET = 0,
  /** Explicitly successful. Rarely needed; `UNSET` already implies no error. */
  OK = 1,
  /** The operation failed. */
  ERROR = 2,
}
