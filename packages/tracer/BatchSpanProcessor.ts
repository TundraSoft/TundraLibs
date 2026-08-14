/**
 * @fileoverview {@link BatchSpanProcessor} — buffers finished spans and flushes
 * them in batches.
 *
 * Without it every ending span costs one export call, which is fine for the
 * console but means one HTTP round-trip per span against a collector. This
 * queues spans and flushes on whichever comes first: a full batch, or a timer.
 *
 * It is itself a {@link SpanExporter} wrapping another one, so it drops into
 * `new Tracer({ exporter })` with no special support from the tracer.
 *
 * @author TundraSoft
 *
 * @module
 *
 * @example
 * ```typescript
 * import { BatchSpanProcessor, Tracer } from '@tundralibs/tracer';
 * import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';
 *
 * const baseURL = 'http://localhost:4318';
 *
 * new Tracer({
 *   serviceName: 'orders',
 *   exporter: new BatchSpanProcessor(new OTLPExporter({ baseURL }), {
 *     maxExportBatchSize: 512,
 *     scheduledDelayMs: 5000,
 *   }),
 * });
 * ```
 */

import type { SpanData, SpanExporter } from './types/mod.ts';

/** Options for {@link BatchSpanProcessor}. */
export type BatchSpanProcessorOptions = {
  /**
   * Spans buffered before the oldest are dropped. The queue is bounded on
   * purpose: an unreachable collector must cost bounded memory, not grow until
   * the process dies.
   *
   * @default 2048
   */
  maxQueueSize?: number;
  /**
   * Spans per export call. Reaching it flushes immediately rather than waiting
   * for the timer.
   *
   * @default 512
   */
  maxExportBatchSize?: number;
  /**
   * Milliseconds a partial batch waits before being flushed anyway, so a
   * low-traffic service still reports promptly.
   *
   * @default 5000
   */
  scheduledDelayMs?: number;
  /**
   * Called when spans are dropped on overflow, with the number dropped. Silent
   * otherwise — dropping is the designed response to backpressure, but a
   * caller may want to alarm on it.
   */
  onDrop?: (dropped: number) => void;
};

const DEFAULT_MAX_QUEUE = 2048;
const DEFAULT_BATCH_SIZE = 512;
const DEFAULT_DELAY_MS = 5000;

/**
 * Buffers spans and flushes them in batches to a wrapped exporter.
 *
 * The flush timer is armed only while spans are queued and cleared as soon as
 * the queue drains, so an idle tracer holds no pending timer and cannot keep a
 * short-lived process (a CLI, a serverless invocation) alive.
 */
export class BatchSpanProcessor implements SpanExporter {
  private readonly __exporter: SpanExporter;
  private readonly __maxQueue: number;
  private readonly __batchSize: number;
  private readonly __delayMs: number;
  private readonly __onDrop?: (dropped: number) => void;

  private readonly __queue: SpanData[] = [];
  private __timer: ReturnType<typeof setTimeout> | undefined;
  /** In-flight flushes, awaited by {@link BatchSpanProcessor.shutdown}. */
  private readonly __inFlight: Set<Promise<void>> = new Set();
  private __shuttingDown = false;

  /**
   * Wrap an exporter in a bounded queue. Nothing is queued or scheduled until
   * the first span ends, so constructing one is free.
   *
   * @param exporter - The exporter that receives each batch.
   * @param options - See {@link BatchSpanProcessorOptions}.
   */
  constructor(
    exporter: SpanExporter,
    options: BatchSpanProcessorOptions = {},
  ) {
    this.__exporter = exporter;
    this.__maxQueue = options.maxQueueSize ?? DEFAULT_MAX_QUEUE;
    this.__batchSize = options.maxExportBatchSize ?? DEFAULT_BATCH_SIZE;
    this.__delayMs = options.scheduledDelayMs ?? DEFAULT_DELAY_MS;
    this.__onDrop = options.onDrop;
  }

  /**
   * Queue spans for the next batch. Returns immediately — the actual export
   * happens on a full batch or on the timer, so ending a span never waits on
   * the network.
   *
   * @param spans - Finished spans to queue.
   */
  public export(spans: SpanData[]): Promise<void> {
    if (this.__shuttingDown) return Promise.resolve();

    this.__queue.push(...spans);

    // Bounded queue: drop the OLDEST spans on overflow. Newer spans are the
    // more useful ones to keep when a collector is failing.
    if (this.__queue.length > this.__maxQueue) {
      const dropped = this.__queue.length - this.__maxQueue;
      this.__queue.splice(0, dropped);
      this.__onDrop?.(dropped);
    }

    if (this.__queue.length >= this.__batchSize) {
      this.__flush();
    } else {
      this.__scheduleFlush();
    }
    return Promise.resolve();
  }

  /**
   * Export everything queued right now and wait for it to complete. Useful
   * before asserting on spans in a test, or at a natural checkpoint.
   */
  public async forceFlush(): Promise<void> {
    while (this.__queue.length > 0) this.__flush();
    await Promise.allSettled(this.__inFlight);
  }

  /**
   * Flush the queue, wait for in-flight exports, then shut the wrapped
   * exporter down. Spans queued after this are dropped.
   */
  public async shutdown(): Promise<void> {
    this.__shuttingDown = true;
    this.__clearTimer();
    while (this.__queue.length > 0) this.__flush();
    await Promise.allSettled(this.__inFlight);
    await this.__exporter.shutdown?.();
  }

  /** Arm the flush timer, unless one is already pending. */
  private __scheduleFlush(): void {
    if (this.__timer !== undefined) return;
    this.__timer = setTimeout(() => {
      this.__timer = undefined;
      if (this.__queue.length > 0) this.__flush();
    }, this.__delayMs);
  }

  /** Disarm the flush timer, if one is pending. */
  private __clearTimer(): void {
    if (this.__timer === undefined) return;
    clearTimeout(this.__timer);
    this.__timer = undefined;
  }

  /**
   * Hand one batch to the wrapped exporter. Errors are swallowed — the
   * exporter owns its own error reporting, and a failed export must not
   * propagate into whoever happened to end the span that triggered the flush.
   */
  private __flush(): void {
    // Every call site checks the queue first (the size threshold in `export`,
    // the `length > 0` guards in the timer / forceFlush / shutdown loops), so
    // the batch is never empty here — `SpanExporter.export` is documented as
    // never receiving an empty array, and that is upheld by the callers rather
    // than by an unreachable guard.
    const batch = this.__queue.splice(0, this.__batchSize);
    // Nothing left to wait for — don't keep a timer armed on an idle process.
    if (this.__queue.length === 0) this.__clearTimer();

    let promise: Promise<void>;
    // Same shape as Tracer.__export, same reasoning: `.catch()` absorbs a
    // REJECTED export, while the try absorbs a SYNCHRONOUS throw from a
    // misbehaving exporter — which happens before a promise exists and so can
    // never reach `.catch()`. BatchSpanProcessor.test.ts covers that path
    // ("survives an exporter that throws synchronously"). S4822 reads the
    // `.catch()` and concludes the try is redundant; it is not.
    try { //NOSONAR - guards a sync throw, which .catch() cannot see
      promise = this.__exporter.export(batch).catch(() => {});
    } catch {
      return;
    }
    this.__inFlight.add(promise);
    void promise.finally(() => this.__inFlight.delete(promise));
  }
}
