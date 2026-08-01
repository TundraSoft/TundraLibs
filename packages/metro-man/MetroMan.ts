/**
 * @fileoverview Registry — central place to create, store, and
 * collect metrics produced by this package.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any

import { BaseMetric } from './BaseMetric.ts';
import { Counter } from './Counter.ts';
import { Gauge } from './Gauge.ts';
import { Histogram } from './Histogram.ts';
import { Summary } from './Summary.ts';
import { DuplicateMetricError, MetricNotFoundError } from './errors/mod.ts';
import type {
  CounterOptions,
  GaugeOptions,
  HistogramOptions,
  SummaryOptions,
} from './types/mod.ts';

/**
 * Central registry for {@link BaseMetric} instances.
 *
 * Two ways to populate it:
 *
 * 1. Factory methods (`counter`, `gauge`, `histogram`, `summary`)
 *    create the metric *and* register it in a single call.
 * 2. Construct a metric directly and pass it to {@link register}.
 *
 * Names are stored case-insensitively (lower-cased and trimmed), so
 * `get('Foo')` and `get('FOO')` resolve to the same instance.
 * Duplicate registration throws {@link DuplicateMetricError} —
 * remove the old one with {@link remove} (or {@link clear} the
 * whole registry) before registering again.
 *
 * @example
 * ```typescript
 * const m = new MetroMan();
 * const requests = m.counter({ name: 'http_requests' });
 * requests.inc();
 *
 * console.log(m.collect('PROMETHEUS'));
 * ```
 */
export class MetroMan {
  protected _instances: Map<string, BaseMetric<unknown, any>> = new Map();

  /**
   * Create and register a {@link Counter}.
   *
   * @throws {@link DuplicateMetricError} When a metric is already
   *   registered under `options.name`.
   */
  public counter(
    options: Omit<CounterOptions, 'type'> & { type?: 'COUNTER' },
  ): Counter {
    const counter = new Counter(options);
    this.register(counter);
    return counter;
  }

  /**
   * Create and register a {@link Gauge}.
   *
   * @throws {@link DuplicateMetricError} When a metric is already
   *   registered under `options.name`.
   */
  public gauge(
    options: Omit<GaugeOptions, 'type'> & { type?: 'GAUGE' },
  ): Gauge {
    const gauge = new Gauge(options);
    this.register(gauge);
    return gauge;
  }

  /**
   * Create and register a {@link Histogram}.
   *
   * @throws {@link DuplicateMetricError} When a metric is already
   *   registered under `options.name`.
   */
  public histogram(
    options: Omit<HistogramOptions, 'type'> & { type?: 'HISTOGRAM' },
  ): Histogram {
    const histogram = new Histogram(options);
    this.register(histogram);
    return histogram;
  }

  /**
   * Create and register a {@link Summary}.
   *
   * @throws {@link DuplicateMetricError} When a metric is already
   *   registered under `options.name`.
   */
  public summary(
    options: Omit<SummaryOptions, 'type'> & { type?: 'SUMMARY' },
  ): Summary {
    const summary = new Summary(options);
    this.register(summary);
    return summary;
  }

  /**
   * Register one or more pre-built metric instances.
   *
   * @throws {@link DuplicateMetricError} When any instance's name is
   *   already taken — by a previously registered metric or by another
   *   instance in the same call. Registration is all-or-nothing: if
   *   any name conflicts, no instances are stored.
   */
  public register(...instances: BaseMetric<any, any>[]): void {
    const normalized = instances.map((i) => this.__normalize(i.name));
    const seen = new Set<string>();
    for (const name of normalized) {
      if (this._instances.has(name) || seen.has(name)) {
        throw new DuplicateMetricError(
          `Metric '${name}' is already registered`,
          { name },
        );
      }
      seen.add(name);
    }
    for (let i = 0; i < instances.length; i++) {
      this._instances.set(normalized[i]!, instances[i]!);
    }
  }

  /** Check whether a metric is registered under `name` (case-insensitive). */
  public has(name: string): boolean {
    return this._instances.has(this.__normalize(name));
  }

  /**
   * Retrieve a metric by name.
   *
   * @typeParam T - Concrete metric type to cast to. Defaults to
   *   `BaseMetric<any, any>` so the caller can decide.
   * @throws {@link MetricNotFoundError} When no metric is registered
   *   under `name`.
   */
  public get<T extends BaseMetric<any, any> = BaseMetric<any, any>>(
    name: string,
  ): T {
    const normalized = this.__normalize(name);
    const instance = this._instances.get(normalized);
    if (!instance) {
      throw new MetricNotFoundError(`Metric '${normalized}' not found`, {
        name: normalized,
      });
    }
    return instance as T;
  }

  /**
   * Remove the metric registered under `name`. Returns `true` if a
   * metric was actually removed, `false` if there was nothing to
   * remove.
   */
  public remove(name: string): boolean {
    return this._instances.delete(this.__normalize(name));
  }

  /** Remove every registered metric. */
  public clear(): void {
    this._instances.clear();
  }

  /**
   * Dump some or all registered metrics in the requested format.
   *
   * Defaults to `'JSON'`. When `metrics` is supplied, names that
   * aren't registered are skipped silently — wrap calls in
   * {@link has} if you need to detect missing names.
   *
   * The selection list is a filter: an **empty** list (`[]`) selects
   * nothing and yields empty output (`{}` for JSON, `''` for the string
   * formats), the same as a list whose names all fail to match. Only an
   * **omitted** selection (`undefined`) dumps every registered metric.
   */
  public collect(type: 'STRING', metrics?: string[]): string;
  public collect(type: 'JSON', metrics?: string[]): Record<string, unknown>;
  public collect(type: 'PROMETHEUS', metrics?: string[]): string;
  public collect(metrics?: string[]): Record<string, unknown>;
  public collect(
    typeOrMetrics?: 'STRING' | 'JSON' | 'PROMETHEUS' | string[],
    metrics?: string[],
  ): string | Record<string, unknown> {
    let type: 'STRING' | 'JSON' | 'PROMETHEUS' = 'JSON';
    let metricNames: string[] | undefined;
    if (typeof typeOrMetrics === 'string') {
      type = typeOrMetrics;
      metricNames = metrics;
    } else if (Array.isArray(typeOrMetrics)) {
      metricNames = typeOrMetrics;
    }

    const instances: BaseMetric<any, any>[] = [];
    if (metricNames) {
      // A selection was supplied (even an empty one). Filter to the
      // named metrics; an empty list selects nothing, mirroring a list
      // whose names all fail to match. Only an *omitted* selection
      // (`undefined`) dumps the whole registry.
      //
      // De-duplicate on the normalized name, keeping first-occurrence
      // order: a name repeated in the selection (easy to hit when the
      // list is concatenated from overlapping config groups) must render
      // its family once, not once per repeat. A duplicated family is
      // fatal to the PROMETHEUS/STRING outputs, which concatenate each
      // instance's block — a repeated `# HELP`/`# TYPE` makes a real
      // scraper reject the whole exposition ("second HELP line for metric
      // name ..."). The JSON path is idempotent (object-key write) but is
      // de-duplicated here too for a single, consistent selection set.
      const seen = new Set<string>();
      for (const name of metricNames) {
        const normalized = this.__normalize(name);
        if (seen.has(normalized)) continue;
        const instance = this._instances.get(normalized);
        if (instance) {
          seen.add(normalized);
          instances.push(instance);
        }
      }
    } else {
      instances.push(...this._instances.values());
    }

    if (type === 'PROMETHEUS') {
      // Each metric's PROMETHEUS block is well-formed on its own: it ends
      // in exactly one line feed and contains no blank line, even when the
      // metric is header-only (a histogram/summary registered but not yet
      // observed renders just its `# HELP`/`# TYPE` lines). So concatenate
      // directly: adjacent families stay single-LF-separated and the whole
      // document ends with exactly one line feed, as the text-exposition
      // format requires ("The last line must end with a line feed
      // character"). Joining with `\n` here would instead inject a blank
      // line between families. An empty registry yields `''`.
      return instances.map((instance) => instance.dump('PROMETHEUS')).join('');
    }
    if (type === 'STRING') {
      return instances.map((instance) => instance.dump('STRING')).join('\n');
    }
    const result: Record<string, unknown> = {};
    for (const instance of instances) {
      result[this.__normalize(instance.name)] = instance.dump('JSON');
    }
    return result;
  }

  /** All registered metric names (lower-cased). */
  public get names(): string[] {
    return Array.from(this._instances.keys());
  }

  /** Canonicalise a name for storage and lookup. */
  private __normalize(name: string): string {
    return name.trim().toLowerCase();
  }
}
