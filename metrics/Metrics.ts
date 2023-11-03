import { singleton } from '../utils/mod.ts';

import { MetricData } from './types/mod.ts';

@singleton
export class Metrics {
  protected _metrics: Map<string, MetricData> = new Map();
  protected _running: Map<string, number> = new Map();

  /**
   * Starts or Stops the metrictracking. If the metric is already running, it will stop it and calculate the time difference.
   * If the metric is not running, it will start it.
   *
   * @param name The name of the metric
   */
  mark(name: string) {
    name = name.trim().toLowerCase();
    const mark = performance.now();
    if (!this._metrics.has(name)) {
      this._metrics.set(name, {
        count: 0,
        timing: {
          min: 0,
          max: 0,
          average: 0,
          last: 0,
        },
      });
    }

    if (this._running.has(name)) {
      const diff = Number((mark - this._running.get(name)!).toFixed(2));
      this._running.delete(name);
      // Update metrics
      const metric = this._metrics.get(name)!;
      this._metrics.set(name, {
        count: (metric.count as number) + 1,
        timing: {
          min: metric.timing.min === 0
            ? diff
            : Math.min(metric.timing.min, diff),
          max: metric.timing.max === 0
            ? diff
            : Math.max(metric.timing.max, diff),
          average: metric.timing.average === 0
            ? diff
            : (metric.timing.average * metric.count + diff) /
              (metric.count + 1),
          last: diff,
        },
      });
    } else {
      this._running.set(name, mark);
    }
  }

  /**
   * Gets the metric information if available
   *
   * @typedef MetricData
   * @param name The name of the metric
   * @returns MetricData The metric information if available
   */
  stats(name: string): MetricData | undefined {
    name = name.trim().toLowerCase();
    return this._metrics.get(name);
  }

  /**
   * Gets the number of times the metric was calculated. 0 if not found or still running
   *
   * @param name The name of the metric
   * @returns number The number of times the metric was calculated. 0 if not found
   */
  count(name: string): number {
    name = name.trim().toLowerCase();
    return this._metrics.get(name)?.count || 0 as number;
  }

  /**
   * Gets all metrics calculated so far.
   *
   * @returns Record<string, MetricData> All metrics
   */
  all(): Record<string, MetricData> {
    return Object.fromEntries(this._metrics.entries());
  }

  /**
   * Gets running metrics names
   *
   * @returns string[] All running metrics names
   */
  running(): string[] {
    return [...this._running.keys()];
  }

  /**
   * Clears all metrics
   */
  purge() {
    this._metrics.clear();
    this._running.clear();
  }

  // export(filePath: string, pretty = false) {
  //   Deno.writeTextFileSync(filePath, JSON.stringify(this.all(), null, pretty ? 2 : undefined));
  // }
}
