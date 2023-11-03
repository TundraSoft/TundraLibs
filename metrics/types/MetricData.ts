export type MetricData = {
  count: number; // total number of times the metric was marked
  timing: {
    min: number;
    max: number;
    average: number;
    last: number;
  };
};
