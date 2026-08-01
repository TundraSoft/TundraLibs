/**
 * @fileoverview Public entry point — re-exports every class, type,
 * and error the package exposes.
 *
 * @module
 */

export { BaseMetric } from './BaseMetric.ts';
export { Counter } from './Counter.ts';
export { Gauge } from './Gauge.ts';
export { Histogram } from './Histogram.ts';
export { MetroMan } from './MetroMan.ts';
export { Summary } from './Summary.ts';

export {
  type DuplicateMetricContext,
  DuplicateMetricError,
  type InvalidLabelContext,
  InvalidLabelError,
  type InvalidMetricOptionsContext,
  InvalidMetricOptionsError,
  type MetricNotFoundContext,
  MetricNotFoundError,
  MetroManError,
} from './errors/mod.ts';

export type {
  CounterOptions,
  GaugeOptions,
  HistogramOptions,
  MetricOptions,
  MetricOutput,
  MetricType,
  SummaryOptions,
} from './types/mod.ts';
