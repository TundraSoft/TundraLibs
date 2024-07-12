import { BaseMetric } from './Base.ts';
import type { HistogramOptions } from './types/mod.ts';

/**
 * Represents a Histogram metric.
 */
export class Histogram
  extends BaseMetric<{ buckets: Record<number, number>; sum: number }> {
  protected _buckets: number[];

  /**
   * Creates an instance of Histogram.
   * @param opt - The metric options.
   * @param buckets - The bucket values for the histogram.
   */
  constructor(
    opt: HistogramOptions,
  ) {
    const opts = {
      ...{ type: 'HISTOGRAM', buckets: [1, 1.5, 2, 5, 10] },
      ...opt,
    };
    if (
      !opts.buckets || !Array.isArray(opts.buckets) ||
      opts.buckets.length === 0 ||
      opts.buckets.some((b) => typeof b !== 'number')
    ) {
      throw new Error('Histogram metric requires buckets to be defined');
    }
    super(opts);
    this._buckets = opts.buckets.toSorted((a, b) => a - b);
  }

  /**
   * Observes a value and updates the histogram.
   *
   * @param value - The value to observe.
   * @param labels - Optional labels for the observation.
   */
  observe(value: number, labels?: Record<string, string>) {
    // Calculate the bucket
    const key = (!labels)
      ? 'no_label'
      : Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    if (this._data.has(key) === false) {
      const rec: Record<number, number> = {};
      this._buckets.forEach((b) => rec[b] = 0);
      this._data.set(key, { buckets: rec, sum: 0 });
    }
    const data = this._data.get(key)!;
    data.sum += value;
    for (const bucket of this._buckets) {
      if (value <= bucket) {
        data.buckets[bucket]++;
      }
    }
  }

  /**
   * Converts the histogram to a Prometheus formatted string.
   *
   * @returns The Prometheus formatted string.
   */
  toPrometheus(): string {
    const header =
      `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} ${this.type}\n`;
    const data = Array.from(this._data).map(([k, v]) => {
      const labels = k === 'no_label' ? [] : k.split(',').map((v) => v.trim());
      const count = v.buckets[this._buckets[this._buckets.length - 1]];
      const lines: string[] = this._buckets.map((b) =>
        `${this.name}_bucket{${[...labels, 'le="' + b + '"'].join(',')}} ${
          v.buckets[b]
        }`
      );
      lines.push(
        `${this.name}_bucket{${[...labels, 'le="+Inf"'].join(',')}} ${count}`,
      );
      lines.push(`${this.name}_sum{${labels.join(',')}} ${v.sum}`);
      lines.push(`${this.name}_count{${labels.join(',')}} ${count}`);
      return lines.join('\n');
    }).join('\n');
    return header + data;
  }
}
