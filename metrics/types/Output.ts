import type { MetricType } from './Type.ts';

/**
 * Represents the output of a metric.
 */
export type MetricOutput<T> = {
  name: string; // The name
  help: string; // The help text
  type: MetricType; // The metric type
  labels: Array<string>; // The labels
  data: Record<string, T>; // The metric data
};
