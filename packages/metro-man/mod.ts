/**
 * @fileoverview `@tundralibs/metro-man` — Prometheus-compatible
 * in-process metrics for Deno, Bun, and Node: the four standard metric
 * types (`Counter`, `Gauge`, `Histogram`, `Summary`) and a registry
 * (`MetroMan`) with bulk collection in JSON, debug-string, or the
 * Prometheus text exposition format via one `dump(mode)` call.
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
  HistogramSeries,
  MetricOptions,
  MetricOutput,
  MetricType,
  SummaryOptions,
  SummarySeries,
} from './types/mod.ts';
