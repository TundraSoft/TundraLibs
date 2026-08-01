/**
 * @fileoverview The {@link RequestContext} shape — the blessed, request-scoped
 * bag the TundraLibs suite (slogger correlation, tracer spans, rpc) agrees to
 * read and write via `ambient`.
 *
 * @author TundraSoft
 *
 * @module
 */

/**
 * The request-scoped context carried by `ambient`. The well-known fields are
 * the interoperability contract every consumer can rely on; arbitrary
 * application fields ride alongside via the index signature.
 *
 * The bag is **mutable** for the lifetime of an `ambient.run` scope — e.g. a
 * tracer stamping `spanId` as it enters a child span — so consumers observe a
 * live view rather than a snapshot.
 */
export type RequestContext = {
  /** Correlates every log line / span / outbound call of one logical request. */
  correlationId?: string;
  /** The active distributed-trace id (W3C `trace-id`), when tracing is on. */
  traceId?: string;
  /** The active span id within {@link RequestContext.traceId}. */
  spanId?: string;
  /** Arbitrary application-defined request-scoped fields. */
  [key: string]: unknown;
};
