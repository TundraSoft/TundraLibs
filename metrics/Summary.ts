import { BaseMetric } from './Base.ts';
import type { MetricOutput, SummaryOptions } from './types/mod.ts';

/**
 * Represents a Summary metric that calculates quantiles, count, and sum of observed values.
 * Extends the BaseMetric class.
 */
export class Summary extends BaseMetric<
  { quantile: Record<number, number>; count: number; sum: number }
> {
  protected _quantiles: Array<number>;
  protected _window?: number;
  protected _rawData: Map<
    string,
    { data: Record<number, Array<number>>; sum: number; count: number }
  > = new Map();

  /**
   * Creates a new instance of the Summary class.
   * @param opt - The metric options.
   * @param quantiles - The quantiles to calculate.
   * @param window - The time window in seconds to purge old records.
   */
  constructor(
    opt: SummaryOptions,
  ) {
    const opts = {
      ...{ type: 'SUMMARY', quantiles: [0.5, 0.9, 0.99] },
      ...opt,
    };
    if (
      !opts.quantiles || !Array.isArray(opts.quantiles) ||
      opts.quantiles.length === 0 ||
      opts.quantiles.some((b) => typeof b !== 'number')
    ) {
      throw new Error('Summary metric requires quantiles to be defined');
    }

    if (opts.window !== undefined) {
      if (opts.window < 1 || opts.window > 600) {
        throw new Error(
          'Summary metric window must be between 1 and 600 seconds',
        );
      }
    }

    super(opts);
    this._window = opts.window; // In seconds
    this._quantiles = opts.quantiles.toSorted((a, b) => a - b);
  }

  /**
   * Observes a value and records it in the summary metric.
   * @param value - The value to observe.
   * @param labels - Optional labels associated with the value.
   */
  observe(value: number, labels?: Record<string, string>) {
    const key = (!labels)
      ? 'no_label'
      : Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    let data = this._rawData.get(key);
    if (!data) {
      data = { data: {}, sum: 0, count: 0 };
      this._rawData.set(key, data);
    }
    const now = Math.floor(Date.now() / 1000);
    data.sum += value;
    data.count++;
    if (!data.data[now]) {
      data.data[now] = [value];
    } else {
      data.data[now].push(value);
    }
    if (this._window) {
      if (now % this._window === 0) {
        this._purge();
      }
    }
  }

  /**
   * Calculates the quantiles, count, and sum of the observed values.
   * @private
   */
  private _calculate() {
    this._purge(); // Delete all records older than the window

    const obj: Record<
      string,
      { quantile: Record<number, number>; count: number; sum: number }
    > = {};
    this._rawData.forEach((v, k) => {
      const sorted = Object.values(v.data).flatMap((v) => v).sort((a, b) =>
        a - b
      );
      const qnR: Record<number, number> = {};

      this._quantiles.forEach((q) => {
        const pos = (sorted.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        qnR[q] = parseFloat(
          (sorted[base] + rest * (sorted[base + 1] || sorted[base])).toFixed(2),
        );
      });

      obj[k] = {
        quantile: qnR,
        count: v.count,
        sum: v.sum,
      };
    });
    this._data = new Map(Object.entries(obj));
  }

  /**
   * Purges all records older than the specified time window.
   * @private
   */
  protected _purge() {
    if (this._window === undefined) {
      return;
    }
    const min = Math.floor(Date.now() / 1000) - this._window;
    this._rawData.forEach((v, k) => {
      const data = Object.fromEntries(
        Object.entries(v.data).filter(([k, _v]) => parseInt(k) >= min),
      );
      const fm = Object.values(data).flatMap((v) => v);
      const sum = fm.reduce((a, b) => a + b, 0);
      const count = fm.length;
      this._rawData.set(k, { data, sum, count });
    });
  }

  /**
   * Converts the summary metric to a JSON object.
   * @returns The JSON representation of the summary metric.
   */
  toJSON(): MetricOutput<
    { quantile: Record<number, number>; count: number; sum: number }
  > {
    this._calculate();
    return super.toJSON();
  }

  /**
   * Converts the summary metric to a Prometheus formatted string.
   * @returns The Prometheus formatted string representation of the summary metric.
   */
  toPrometheus(): string {
    this._calculate();
    const header =
      `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} ${this.type}\n`;
    const data = Array.from(this._data).map(([k, v]) => {
      const labels = k === 'no_label' ? [] : k.split(',').map((v) => v.trim());
      const lines: string[] = this._quantiles.map((b) =>
        `${this.name}{${[...labels, 'quantile="' + b + '"'].join(',')}} ${
          v.quantile[b]
        }`
      );
      lines.push(`${this.name}_sum{${labels.join(',')}} ${v.sum}`);
      lines.push(`${this.name}_count{${labels.join(',')}} ${v.count}`);
      return lines.join('\n');
    }).join('\n');
    return header + data;
  }

  /**
   * Converts the summary metric to a string.
   * @returns The string representation of the summary metric.
   */
  toString(): string {
    this._calculate();
    return super.toString();
  }
}
