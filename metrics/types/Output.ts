/**
 * Represents the output of a metric.
 */
export type MetricOutput<T> = {
  name: string; // The name
  help: string; // The help text
  type: string; // The metric type
  labels: Array<string>; // The labels
  data: Record<string, T>; // The metric data
};