/**
 * @fileoverview Literal union of supported Prometheus metric types.
 *
 * @module
 */

/**
 * One of the four Prometheus metric kinds supported by MetroMan.
 *
 * Used as the `type` discriminator on {@link MetricOptions} and as the
 * `type` literal carried on every {@link MetricOutput}.
 */
export type MetricType = 'COUNTER' | 'GAUGE' | 'HISTOGRAM' | 'SUMMARY';
