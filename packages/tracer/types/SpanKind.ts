/**
 * @fileoverview {@link SpanKind} — the span's role in a trace. Values match the
 * OTLP `SpanKind` enum exactly, so they serialise without a lookup table.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * The span's role in a trace. The numeric values are OTLP-defined and are
 * emitted verbatim by the OTLP exporter — do not renumber.
 */
export enum SpanKind {
  /** Internal work with no remote counterpart. The default. */
  INTERNAL = 1,
  /** Handling an inbound request — the server side of a remote call. */
  SERVER = 2,
  /** Making an outbound request — the client side of a remote call. */
  CLIENT = 3,
  /** Producing a message for asynchronous consumption. */
  PRODUCER = 4,
  /** Consuming an asynchronously produced message. */
  CONSUMER = 5,
}
