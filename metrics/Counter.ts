import { BaseMetric } from './Base.ts';
import type { CounterOptions } from './types/mod.ts';

/**
 * Represents a counter metric that tracks the number of occurrences of an event.
 */
export class Counter extends BaseMetric<number> {
  constructor(opt: CounterOptions) {
    const opts = { type: 'COUNTER', ...opt };
    super(opts);
  }

  /**
   * Increments the counter by 1.
   * @param labels - Optional labels to associate with the counter.
   */
  inc(labels?: Record<string, string>) {
    const key = (!labels)
      ? 'no_label'
      : Object.entries(labels).map(([k, v]) => `${k}="${v}"`).join(',');
    this._data.set(key, (this._data.get(key) || 0) + 1);
  }
}
