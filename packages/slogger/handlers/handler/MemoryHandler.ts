/**
 * @fileoverview {@link MemoryHandler} — ring buffer that keeps the
 * last N `SlogObject` records in memory. Zero I/O, zero policy.
 *
 * Use cases this primitive enables (none can be assembled inline
 * without a real handler instance):
 *
 * - **Test assertions**: register a MemoryHandler in a test logger,
 *   exercise code, then inspect the buffer.
 * - **Dev tooling / debug pages**: expose the last N logs over an
 *   admin endpoint (`/admin/recent-logs`).
 * - **Panic replay**: route normal traffic to disk at WARN+; install
 *   a MemoryHandler at DEBUG capturing the last 500 records. On
 *   EMERGENCY / ALERT, flush the buffer as a postmortem dump.
 *
 * @module
 */

import { AbstractHandler, type HandlerOptions } from '../AbstractHandler.ts';
import type { SlogObject } from '../../types/SlogObject.ts';
import { SloggerConfigError } from '../../errors/mod.ts';

/**
 * Options for {@link MemoryHandler}.
 */
export type MemoryHandlerOptions = HandlerOptions & {
  /**
   * Maximum number of records to retain. When the buffer is full,
   * the oldest record is evicted on each new push (FIFO).
   *
   * @default 100
   */
  capacity?: number;
};

/**
 * Append-only ring buffer over `SlogObject`. Stores the structured
 * record (not the formatted string), so callers can re-format or
 * inspect specific fields.
 */
export class MemoryHandler extends AbstractHandler {
  public readonly mode = 'memory';
  private readonly __capacity: number;
  private readonly __buffer: SlogObject[];
  /** Logical head index — wraps around at `__capacity`. */
  private __head = 0;
  /** Total records ever pushed; min(this, capacity) = current length. */
  private __count = 0;

  /**
   * @param name - Handler name identifier
   * @param options - Configuration options for the handler
   * @throws {SloggerConfigError} When `capacity` is not a positive
   *   integer.
   */
  constructor(name: string, options: MemoryHandlerOptions) {
    super(name, options);
    const capacity = options.capacity ?? 100;
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new SloggerConfigError(
        'MemoryHandler capacity must be a positive integer',
        { key: 'capacity', value: options.capacity },
      );
    }
    this.__capacity = capacity;
    this.__buffer = new Array(capacity);
  }

  /**
   * Bypass the formatter pipeline: we want the structured record,
   * not a string. Level + sampling filters are still applied.
   */
  public override async handle(log: SlogObject): Promise<void> {
    if (log.level > this.level) return;
    // Sampling — replicate AbstractHandler's gate without going
    // through `_format()`/`_handle()`. Math.random() on purpose:
    // sampling is a statistical throughput control, not a security
    // decision, and a CSPRNG would cost an allocation per log here.
    if (this._sampleRate < 1 && log.level > this._bypassSamplingLevel) {
      if (Math.random() > this._sampleRate) return;
    }
    this.__buffer[this.__head] = log;
    this.__head = (this.__head + 1) % this.__capacity;
    if (this.__count < this.__capacity) this.__count++;
    await Promise.resolve();
  }

  /** Required by AbstractHandler. Unused — `handle()` is overridden. */
  protected _handle(_message: string): void {
    /* unused */
  }

  /**
   * Snapshot the buffer in chronological (oldest-first) order.
   * Returns a fresh array; mutations don't affect the underlying
   * ring buffer.
   */
  public getLogs(): SlogObject[] {
    if (this.__count === 0) return [];
    if (this.__count < this.__capacity) {
      return this.__buffer.slice(0, this.__count);
    }
    // Full ring — read from `__head` (oldest) wrapping around.
    return [
      ...this.__buffer.slice(this.__head),
      ...this.__buffer.slice(0, this.__head),
    ];
  }

  /** Current number of records held (0..capacity). */
  public get size(): number {
    return this.__count;
  }

  /** Configured maximum capacity. */
  public get capacity(): number {
    return this.__capacity;
  }

  /** Drop all stored records. */
  public clear(): void {
    this.__head = 0;
    this.__count = 0;
    for (let i = 0; i < this.__capacity; i++) {
      this.__buffer[i] = undefined as unknown as SlogObject;
    }
  }
}
