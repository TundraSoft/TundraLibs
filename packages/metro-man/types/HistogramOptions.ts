/**
 * @fileoverview Options shape for the Histogram metric.
 *
 * @module
 */

import type { MetricOptions } from './MetricOptions.ts';

/**
 * Options accepted by `new Histogram(...)`. `type` is fixed to
 * `'HISTOGRAM'`. `buckets` defaults to `[1, 1.5, 2, 5, 10]` when
 * omitted; each bound must be a finite number and they are sorted
 * ascending internally.
 */
export type HistogramOptions = MetricOptions & {
  type: 'HISTOGRAM';
  buckets?: number[];
};
