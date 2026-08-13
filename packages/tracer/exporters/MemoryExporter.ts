/**
 * @fileoverview {@link MemoryExporter} — buffers spans in memory. The exporter
 * to use in tests.
 *
 * @author TundraSoft
 *
 * @module
 */

import type { SpanData, SpanExporter } from '../types/mod.ts';

/**
 * Collects finished spans in an array instead of sending them anywhere.
 * Intended for tests and local assertions.
 *
 * @example
 * ```typescript
 * import { MemoryExporter, Tracer } from '@tundralibs/tracer';
 *
 * const exporter = new MemoryExporter();
 * const tracer = new Tracer({ serviceName: 'test', exporter });
 *
 * tracer.startActiveSpan('work', () => {});
 *
 * exporter.spans[0]?.name; // 'work'
 * ```
 */
export class MemoryExporter implements SpanExporter {
  private readonly __spans: SpanData[] = [];

  /** Every span exported so far, in completion order. */
  public get spans(): SpanData[] {
    return this.__spans;
  }

  /**
   * Buffer `spans`.
   *
   * @param spans - Finished spans to record.
   */
  public export(spans: SpanData[]): Promise<void> {
    this.__spans.push(...spans);
    return Promise.resolve();
  }

  /** Discard everything buffered — call between test cases. */
  public reset(): void {
    this.__spans.length = 0;
  }

  /** Finds the first buffered span named `name`, for concise assertions. */
  public find(name: string): SpanData | undefined {
    return this.__spans.find((span) => span.name === name);
  }
}
