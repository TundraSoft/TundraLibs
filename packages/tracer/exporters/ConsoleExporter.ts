/**
 * @fileoverview {@link ConsoleExporter} — prints spans for local development.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { SpanData, SpanExporter } from '../types/mod.ts';
import { SpanStatusCode } from '../types/mod.ts';

/** Options for {@link ConsoleExporter}. */
export type ConsoleExporterOptions = {
  /**
   * Emit each span as a single JSON line instead of the human-readable
   * summary. Defaults to `false`.
   */
  json?: boolean;
};

/**
 * Writes finished spans to the console — a readable one-line summary by
 * default, or newline-delimited JSON with `{ json: true }`.
 *
 * For local development only; use the OTLP exporter for real backends.
 *
 * @example
 * ```text
 * [trace 4bf92f35…] GET /orders/:id  12.4ms  OK
 * ```
 */
export class ConsoleExporter implements SpanExporter {
  private readonly __json: boolean;

  /**
   * @param options - See {@link ConsoleExporterOptions}.
   */
  constructor(options: ConsoleExporterOptions = {}) {
    this.__json = options.json === true;
  }

  /**
   * Print `spans`.
   *
   * @param spans - Finished spans to print.
   */
  public export(spans: SpanData[]): Promise<void> {
    for (const span of spans) {
      console.log(this.__json ? JSON.stringify(span) : this.__format(span));
    }
    return Promise.resolve();
  }

  /** Render a span's outcome, appending the message when there is one. */
  private __status(span: SpanData): string {
    if (span.status.code !== SpanStatusCode.ERROR) return 'OK';
    if (span.status.message === undefined) return 'ERROR';
    return `ERROR (${span.status.message})`;
  }

  /** One-line human-readable summary of a span. */
  private __format(span: SpanData): string {
    const ms = span.endTime.getTime() - span.startTime.getTime();
    const trace = span.context.traceId.slice(0, 8);
    return `[trace ${trace}…] ${span.name}  ${ms}ms  ${this.__status(span)}`;
  }
}
