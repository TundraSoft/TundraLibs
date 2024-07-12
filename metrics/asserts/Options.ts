import type {
  CounterOptions,
  GaugeOptions,
  HistogramOptions,
  MetricOptions,
  SummaryOptions,
} from '../types/mod.ts';

export const assertMetricOptions = (x: unknown): x is MetricOptions => {
  return typeof x === 'object' && x !== null && 'name' in x &&
    typeof x.name === 'string' && 'type' in x && typeof x.type === 'string' &&
    ['COUNTER', 'GAUGE', 'HISTOGRAM', 'SUMMARY'].includes(x.type) &&
    ('help' in x ? typeof x.help === 'string' : true);
};

export const assertCounterOptions = (x: unknown): x is CounterOptions => {
  return assertMetricOptions(x) && x.type === 'COUNTER';
};

export const assertGaugeOptions = (x: unknown): x is GaugeOptions => {
  return assertMetricOptions(x) && x.type === 'GAUGE';
};

export const assertHistogramOptions = (x: unknown): x is HistogramOptions => {
  return assertMetricOptions(x) && x.type === 'HISTOGRAM' && 'buckets' in x &&
    Array.isArray(x.buckets) && x.buckets.every((v) => typeof v === 'number');
};

export const assertSummaryOptions = (x: unknown): x is SummaryOptions => {
  return assertMetricOptions(x) && x.type === 'SUMMARY' && 'quantiles' in x &&
    Array.isArray(x.quantiles) &&
    x.quantiles.every((v) => typeof v === 'number') &&
    ('window' in x
      ? (typeof x.window === 'number' && x.window > 0 && x.window <= 600)
      : true); // 10 minutes
};
