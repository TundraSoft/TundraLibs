/**
 * @fileoverview Options shape for the Summary metric.
 *
 * @module
 */

import type { MetricOptions } from './MetricOptions.ts';

/**
 * Options accepted by `new Summary(...)`. `type` is fixed to
 * `'SUMMARY'`. `quantiles` defaults to `[0.5, 0.9, 0.99]` when
 * omitted; each value must be a finite number in `[0, 1]`. `window`
 * is the sliding retention window in seconds — older observations
 * are purged at read and observe time. Defaults to `600` (the
 * maximum) when omitted, so retention is always bounded; constrained
 * to a finite `[1, 600]` seconds when provided (`NaN`/`Infinity` are
 * rejected).
 */
export type SummaryOptions = MetricOptions & {
  type: 'SUMMARY';
  quantiles?: number[];
  window?: number;
};
