/**
 * @fileoverview Monotonic counter metric — values only ever increase.
 *
 * @module
 */

import { BaseMetric } from './BaseMetric.ts';
import { InvalidMetricOptionsError } from './errors/mod.ts';
import { parseAmountArgs } from './parseAmountArgs.ts';
import type { CounterOptions } from './types/mod.ts';

/**
 * Monotonic counter — a value that only ever increases.
 *
 * Use a counter for things you count cumulatively (requests served,
 * errors raised, bytes written). For a value that can go up or down,
 * reach for {@link Gauge} instead.
 *
 * @example
 * ```typescript
 * const requests = new Counter({ name: 'http_requests_total' });
 * requests.inc();
 * requests.inc({ status: '200', method: 'GET' });
 * requests.inc(5, { status: '200', method: 'POST' });
 * ```
 */
export class Counter extends BaseMetric<number, CounterOptions> {
  constructor(opt: Omit<CounterOptions, 'type'> & { type?: 'COUNTER' }) {
    super({ ...opt, type: 'COUNTER' });
  }

  /**
   * Increment the named series.
   *
   * Overloads:
   * - `inc()` — increment unlabelled by 1
   * - `inc(labels)` — increment labelled series by 1
   * - `inc(amount)` — increment unlabelled by `amount`
   * - `inc(amount, labels)` — increment labelled series by `amount`
   *
   * @throws {@link InvalidMetricOptionsError} When `amount` is
   *   negative or non-finite — counters cannot decrease.
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
    if (!Number.isFinite(amount) || amount < 0) {
      throw new InvalidMetricOptionsError(
        `Counter increment must be a non-negative finite number, got ${amount}`,
        { field: 'amount' },
      );
    }
    const entry = this._entry(labels, () => 0);
    entry.data += amount;
  }
}
