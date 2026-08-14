/**
 * @fileoverview Histogram metric — bucketed distribution of observed values.
 *
 * @module
 */

import { BaseMetric } from './BaseMetric.ts';
import { InvalidLabelError, InvalidMetricOptionsError } from './errors/mod.ts';
import type { HistogramOptions } from './types/mod.ts';

const DEFAULT_BUCKETS: ReadonlyArray<number> = [1, 1.5, 2, 5, 10];
const RESERVED_LABEL = 'le';

/**
 * Per-series payload carried by a Histogram. `buckets` is ordered by
 * ascending upper bound (`le`) — a plain numeric-keyed record cannot
 * hold that order (JS lists integer keys before decimal keys), so an
 * ordered array keeps every output format in ascending-bound order.
 * `count` tracks every observation (including those above the largest
 * finite bucket) so `_count` and the `+Inf` bucket are correct even
 * when observations exceed the configured ladder.
 */
export type HistogramSeries = {
  buckets: Array<{ le: number; count: number }>;
  sum: number;
  count: number;
};

/**
 * Bucketed distribution of observed values. Each `observe(v)`
 * increments every bucket whose upper bound is `>= v`, adds `v` to
 * the running sum, and increments the total observation count.
 *
 * Use for latency distributions and similar "what's the spread"
 * questions. For exact quantiles (rather than bucketed approximations),
 * use {@link Summary} instead.
 *
 * @example
 * ```typescript
 * const latency = new Histogram({
 *   name: 'http_request_seconds',
 *   buckets: [0.1, 0.5, 1, 2, 5],
 * });
 * latency.observe(0.3, { route: '/users' });
 * ```
 */
export class Histogram extends BaseMetric<HistogramSeries, HistogramOptions> {
  /**
   * Configured bucket upper bounds, de-duplicated and sorted ascending.
   * The `+Inf` bucket is added at render time and is not stored here.
   */
  protected _buckets: number[];

  /**
   * Create a histogram. `buckets` defaults to `[1, 1.5, 2, 5, 10]`;
   * `type` is injected automatically.
   *
   * @throws {@link InvalidMetricOptionsError} When `buckets` is
   *   present but isn't an array of numbers, or contains a non-finite
   *   bound (`NaN`, `±Infinity`) — a non-finite `le` renders exposition
   *   Prometheus rejects, and `+Inf` is already appended automatically.
   */
  constructor(opt: Omit<HistogramOptions, 'type'> & { type?: 'HISTOGRAM' }) {
    const buckets = opt.buckets ?? [...DEFAULT_BUCKETS];
    if (!Array.isArray(buckets) || buckets.some((b) => typeof b !== 'number')) {
      throw new InvalidMetricOptionsError(
        'Histogram buckets must be an array of numbers',
        { field: 'buckets', metricType: 'HISTOGRAM' },
      );
    }
    if (buckets.some((b) => !Number.isFinite(b))) {
      throw new InvalidMetricOptionsError(
        'Histogram buckets must be finite numbers',
        { field: 'buckets', metricType: 'HISTOGRAM' },
      );
    }
    super({ ...opt, buckets, type: 'HISTOGRAM' });
    // De-duplicate before sorting: a repeated bound (easy to hit when
    // bucket lists are concatenated from overlapping config groups)
    // would otherwise render the same `le="..."` series twice — a
    // duplicate series a strict Prometheus scraper rejects, aborting the
    // whole scrape. `Set` also canonicalizes `-0`/`0` to one bound.
    this._buckets = [...new Set(buckets)].sort((a, b) => a - b);
  }

  /**
   * Record a single observation. Every bucket whose upper bound is
   * `>= value` is incremented, `value` is added to the series'
   * running sum, and the series' `count` increments by 1.
   *
   * @throws {@link InvalidMetricOptionsError} When `value` is
   *   non-finite (`NaN`, `±Infinity`) — it would render exposition
   *   most scrapers reject.
   * @throws {@link InvalidLabelError} When `labels` contains the
   *   reserved name `'le'` (collides with Prometheus bucket labels),
   *   or a label name that isn't a legal Prometheus label name.
   */
  public observe(value: number, labels?: Record<string, string>): void {
    if (!Number.isFinite(value)) {
      throw new InvalidMetricOptionsError(
        `Histogram observation must be a finite number, got ${value}`,
        { field: 'value' },
      );
    }
    if (labels && RESERVED_LABEL in labels) {
      throw new InvalidLabelError(
        `'${RESERVED_LABEL}' is a reserved label name on histograms`,
        {
          label: RESERVED_LABEL,
          reason: 'reserved',
          metricType: 'HISTOGRAM',
        },
      );
    }
    const entry = this._entry(labels, () => ({
      buckets: this._buckets.map((le) => ({ le, count: 0 })),
      sum: 0,
      count: 0,
    }));
    entry.data.sum += value;
    entry.data.count += 1;
    for (const bucket of entry.data.buckets) {
      if (value <= bucket.le) bucket.count++;
    }
  }

  /**
   * Prometheus exposition for the histogram family: one cumulative
   * `_bucket{le="…"}` line per configured bound, then `le="+Inf"`,
   * `_sum`, and `_count`. A histogram with no observations renders
   * just its `# HELP` / `# TYPE` header lines.
   */
  public override toPrometheus(): string {
    // Assemble a flat line list — the two header lines first, then each
    // series' rendered block — and join with a single line feed, adding
    // exactly one trailing `\n`. This is the same construction as
    // BaseMetric.toPrometheus, and using it (rather than concatenating a
    // header string that already ends in `\n` with a possibly-empty data
    // string) keeps the output spec-valid when there are no series yet: an
    // unobserved histogram renders just its two header lines and still ends
    // in a single `\n`, never a trailing blank line (`\n\n`). See
    // BaseMetric.toPrometheus for the text-exposition line-feed contract.
    const lines: string[] = [
      `# HELP ${this.name} ${BaseMetric._escapeHelp(this.help)}`,
      `# TYPE ${this.name} ${BaseMetric._promType(this.type)}`,
    ];
    for (const [k, entry] of this._data) {
      lines.push(this.__renderSeries(k === 'no_label' ? [] : [k], entry.data));
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Render one series' `_bucket`/`_sum`/`_count` lines, with no
   * trailing line feed — the caller joins and terminates the document.
   *
   * @param labels - Pre-rendered label segments, empty for the
   *   unlabelled series.
   */
  private __renderSeries(labels: string[], v: HistogramSeries): string {
    const labelStr = labels.join(',');
    const lines: string[] = v.buckets.map((b) => {
      const inner = [...labels, `le="${b.le}"`].join(',');
      return `${this.name}_bucket{${inner}} ${b.count}`;
    });
    const infInner = [...labels, 'le="+Inf"'].join(',');
    lines.push(
      `${this.name}_bucket{${infInner}} ${v.count}`,
      `${this.name}_sum{${labelStr}} ${v.sum}`,
      `${this.name}_count{${labelStr}} ${v.count}`,
    );
    return lines.join('\n');
  }
}
