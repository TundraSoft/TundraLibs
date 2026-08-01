/**
 * @fileoverview Gauge metric — a value that can move up or down.
 *
 * @module
 */

import { BaseMetric } from './BaseMetric.ts';
import { InvalidMetricOptionsError } from './errors/mod.ts';
import { parseAmountArgs } from './parseAmountArgs.ts';
import type { GaugeOptions } from './types/mod.ts';

/**
 * A point-in-time value that can rise or fall — queue depth, active
 * connections, memory in use, temperature. For monotonically
 * increasing counts, reach for {@link Counter} instead.
 *
 * @example
 * ```typescript
 * const queue = new Gauge({ name: 'queue_depth' });
 * queue.set(42);
 * queue.inc({ priority: 'high' });
 * queue.inc(3, { priority: 'low' });
 * queue.dec({ priority: 'high' });
 * ```
 */
export class Gauge extends BaseMetric<number, GaugeOptions> {
  constructor(opt: Omit<GaugeOptions, 'type'> & { type?: 'GAUGE' }) {
    super({ ...opt, type: 'GAUGE' });
  }

  /**
   * Set the gauge to `value`, replacing any previous value for the series.
   *
   * @throws {@link InvalidMetricOptionsError} When `value` is
   *   non-finite (`NaN`, `±Infinity`) — it would render exposition
   *   most scrapers reject.
   * @throws {@link InvalidLabelError} When `labels` contains a name
   *   that isn't a legal Prometheus label name.
   */
  public set(value: number, labels?: Record<string, string>): void {
    if (!Number.isFinite(value)) {
      throw new InvalidMetricOptionsError(
        `Gauge value must be a finite number, got ${value}`,
        { field: 'value' },
      );
    }
    const entry = this._entry(labels, () => 0);
    entry.data = value;
  }

  /**
   * Increment the named series.
   *
   * Overloads:
   * - `inc()` — increment unlabelled by 1
   * - `inc(labels)` — increment labelled by 1
   * - `inc(amount)` — increment unlabelled by `amount`
   * - `inc(amount, labels)` — increment labelled by `amount`
   *
   * @throws {@link InvalidMetricOptionsError} When `amount` is non-finite.
   * @throws {@link InvalidLabelError} When `labels` contains a name
   *   that isn't a legal Prometheus label name.
   */
  public inc(): void;
  public inc(labels: Record<string, string>): void;
  public inc(amount: number): void;
  public inc(amount: number, labels: Record<string, string>): void;
  public inc(
    amountOrLabels?: number | Record<string, string>,
    maybeLabels?: Record<string, string>,
  ): void {
    const { amount, labels } = parseAmountArgs(amountOrLabels, maybeLabels);
    if (!Number.isFinite(amount)) {
      throw new InvalidMetricOptionsError(
        `Gauge delta must be a finite number, got ${amount}`,
        { field: 'amount' },
      );
    }
    const entry = this._entry(labels, () => 0);
    entry.data += amount;
  }

  /**
   * Decrement the named series. Same overloads as {@link inc}.
   *
   * @throws {@link InvalidMetricOptionsError} When `amount` is non-finite.
   * @throws {@link InvalidLabelError} When `labels` contains a name
   *   that isn't a legal Prometheus label name.
   */
  public dec(): void;
  public dec(labels: Record<string, string>): void;
  public dec(amount: number): void;
  public dec(amount: number, labels: Record<string, string>): void;
  public dec(
    amountOrLabels?: number | Record<string, string>,
    maybeLabels?: Record<string, string>,
  ): void {
    const { amount, labels } = parseAmountArgs(amountOrLabels, maybeLabels);
    if (!Number.isFinite(amount)) {
      throw new InvalidMetricOptionsError(
        `Gauge delta must be a finite number, got ${amount}`,
        { field: 'amount' },
      );
    }
    const entry = this._entry(labels, () => 0);
    entry.data -= amount;
  }
}
