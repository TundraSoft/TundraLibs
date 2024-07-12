import { BaseMetric } from './Base.ts';
import type { GaugeOptions } from './types/mod.ts';

/**
 * Represents a gauge metric that tracks a numeric value.
 */
export class Gauge extends BaseMetric<number> {
  constructor(opt: GaugeOptions) {
    const opts = { type: 'GAUGE', ...opt };
    super(opts);
  }
  /**
   * Sets the value of the gauge metric.
   * @param value - The value to set.
   * @param labels - Optional labels to associate with the value.
   */
  set(value: number, labels?: Record<string, string>) {
    const key = (!labels)
      ? 'no_label'
      : Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    this._data.set(key, (this._data.get(key) || 0) + value);
  }

  /**
   * Increments the value of the gauge metric by 1.
   * @param labels - Optional labels to associate with the value.
   */
  inc(labels?: Record<string, string>) {
    const key = (!labels)
      ? 'no_label'
      : Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    this._data.set(key, (this._data.get(key) || 0) + 1);
  }

  /**
   * Decrements the value of the gauge metric by 1.
   * @param labels - Optional labels to associate with the value.
   */
  dec(labels?: Record<string, string>) {
    const key = (!labels)
      ? 'no_label'
      : Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    this._data.set(key, (this._data.get(key) || 0) - 1);
  }
}
