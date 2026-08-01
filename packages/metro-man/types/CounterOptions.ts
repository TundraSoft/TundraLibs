/**
 * @fileoverview Options shape for the Counter metric.
 *
 * @module
 */

import type { MetricOptions } from './MetricOptions.ts';

/**
 * Options accepted by `new Counter(...)`. `type` is fixed to
 * `'COUNTER'` — the class injects it automatically, so callers
 * normally pass only `name` and `help`.
 */
export type CounterOptions = MetricOptions & { type: 'COUNTER' };
