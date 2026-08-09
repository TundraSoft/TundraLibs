/**
 * @fileoverview {@link SpanExporter} — the pluggable destination for finished
 * spans.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { SpanData } from './SpanData.ts';

/**
 * Receives finished spans and sends them somewhere — the console, an in-memory
 * buffer (tests), or an OTLP collector.
 *
 * Implementations must never throw into the caller: a failed export is an
 * observability problem, not an application problem, so errors are swallowed
 * or reported out-of-band by the tracer.
 */
export type SpanExporter = {
  /**
   * Export a batch of finished spans.
   *
   * @param spans - The spans to export. Never empty.
   */
  export(spans: SpanData[]): Promise<void>;

  /**
   * Flush anything buffered and release resources. Called by
   * `Tracer.shutdown()`.
   */
  shutdown?(): Promise<void>;
};
