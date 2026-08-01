/**
 * @fileoverview Options shape for the Gauge metric.
 *
 * @module
 */

import type { MetricOptions } from './MetricOptions.ts';

/**
 * Options accepted by `new Gauge(...)`. `type` is fixed to `'GAUGE'`
 * — the class injects it automatically.
 */
export type GaugeOptions = MetricOptions & { type: 'GAUGE' };
