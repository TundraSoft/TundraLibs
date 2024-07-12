type BaseMetricOptions = {
  name: string;
  help?: string;
};

/**
 * Represents the options of a metric.
 */
export type MetricOptions = BaseMetricOptions & {
  type: string; // The metric type
};

export type CounterOptions = BaseMetricOptions;

export type GaugeOptions = BaseMetricOptions;

export type HistogramOptions = BaseMetricOptions & {
  buckets?: number[]; // The bucket values
};

export type SummaryOptions = BaseMetricOptions & {
  quantiles?: number[]; // The quantile values
  window?: number; // The time window
};
