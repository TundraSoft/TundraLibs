import type { MetricType } from './Type.ts';

/**
 * Represents the options of a metric.
 */
export type MetricOptions = {
  name: string; // The name of the metric
  help?: string; // The help text
  type: MetricType; // The metric type
};

export type CounterOptions = MetricOptions & {
  type: 'COUNTER'; // The metric type
};

export type GaugeOptions = MetricOptions & {
  type: 'GAUGE'; // The metric type
};

export type HistogramOptions = MetricOptions & {
  type: 'HISTOGRAM'; // The metric type
  buckets?: number[]; // The bucket values
};

export type SummaryOptions = MetricOptions & {
  type: 'SUMMARY'; // The metric type
  quantiles?: number[]; // The quantile values
  window?: number; // The time window
};
