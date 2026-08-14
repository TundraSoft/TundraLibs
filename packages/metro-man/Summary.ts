/**
 * @fileoverview Summary metric — cumulative `_sum`/`_count` with
 * quantile estimates computed over a sliding window.
 *
 * @module
 */

import { BaseMetric } from './BaseMetric.ts';
import { InvalidLabelError, InvalidMetricOptionsError } from './errors/mod.ts';
import type { MetricOutput, SummaryOptions } from './types/mod.ts';

const DEFAULT_QUANTILES: ReadonlyArray<number> = [0.5, 0.9, 0.99];
const MIN_WINDOW_SECONDS = 1;
const MAX_WINDOW_SECONDS = 600;
const DEFAULT_WINDOW_SECONDS = MAX_WINDOW_SECONDS;
const RESERVED_LABEL = 'quantile';

/**
 * Per-series payload carried by a Summary.
 */
export type SummarySeries = {
  quantile: Record<number, number>;
  count: number;
  sum: number;
};

/**
 * Quantile-based distribution metric. Each observation feeds two
 * things: the per-series **cumulative** `_sum`/`_count` (lifetime
 * totals that only ever grow) and a windowed buffer of raw samples
 * used for the quantile estimates. The windowed samples are dropped
 * once they fall outside the sliding `window` (default `600` seconds —
 * the maximum), so memory stays bounded even for a summary that is
 * written but never read; `_sum`/`_count` are never purged. Purges run
 * at read time (`_calculate()`) and, once `window` seconds have
 * elapsed since the last purge, at observe time.
 *
 * This matches Prometheus/client_golang summary semantics: `_sum` and
 * `_count` are cumulative for the process lifetime (safe to scrape
 * with `rate()`/`increase()` — they never spuriously decrease as
 * samples age out), while only the reported quantiles slide over the
 * window.
 *
 * Quantiles use linear interpolation between the two nearest ranked
 * samples: `value = sorted[base] + frac * (sorted[base+1] - sorted[base])`.
 *
 * For pre-bucketed distributions (cheaper to aggregate across
 * instances), reach for {@link Histogram} instead.
 *
 * @example
 * ```typescript
 * const latency = new Summary({
 *   name: 'http_request_seconds',
 *   quantiles: [0.5, 0.9, 0.99],
 *   window: 60,
 * });
 * latency.observe(0.42, { route: '/users' });
 * latency.toPrometheus();
 * ```
 */
export class Summary extends BaseMetric<SummarySeries, SummaryOptions> {
  /** Requested quantiles, de-duplicated and sorted ascending. */
  protected _quantiles: Array<number>;

  /** Sliding retention window for the quantile samples, in seconds. */
  protected _window: number;

  /**
   * Per-series state. `data` is the windowed sample buffer (second →
   * observations) that feeds the quantile estimates and is pruned by
   * `_purge()`; `sum`/`count` are the cumulative lifetime totals that
   * `observe()` increments and `_purge()` never touches.
   */
  protected _rawData: Map<
    string,
    { data: Record<number, Array<number>>; sum: number; count: number }
  > = new Map();
  /**
   * Epoch second of the last observe-time purge. Read-time purges
   * deliberately leave it alone — see {@link _purge}.
   */
  protected _lastPurge: number;

  /**
   * Create a summary. `quantiles` defaults to `[0.5, 0.9, 0.99]` and
   * `window` to `600` seconds; `type` is injected automatically.
   *
   * @throws {@link InvalidMetricOptionsError} When `quantiles` is not
   *   an array of finite numbers in the range `[0, 1]`, or `window`
   *   is not a finite number in the range `[1, 600]` (`NaN` and
   *   `±Infinity` are rejected — an unbounded window would defeat the
   *   purge that keeps memory bounded).
   */
  constructor(opt: Omit<SummaryOptions, 'type'> & { type?: 'SUMMARY' }) {
    const quantiles = opt.quantiles ?? [...DEFAULT_QUANTILES];
    if (
      !Array.isArray(quantiles) ||
      quantiles.some((q) => typeof q !== 'number')
    ) {
      throw new InvalidMetricOptionsError(
        'Summary quantiles must be an array of numbers',
        { field: 'quantiles', metricType: 'SUMMARY' },
      );
    }
    if (quantiles.some((q) => !Number.isFinite(q) || q < 0 || q > 1)) {
      throw new InvalidMetricOptionsError(
        'Summary quantiles must be finite numbers between 0 and 1',
        { field: 'quantiles', metricType: 'SUMMARY' },
      );
    }
    if (opt.window !== undefined) {
      if (typeof opt.window !== 'number') {
        throw new InvalidMetricOptionsError('Invalid summary window', {
          field: 'window',
          metricType: 'SUMMARY',
        });
      }
      if (
        !Number.isFinite(opt.window) ||
        opt.window < MIN_WINDOW_SECONDS || opt.window > MAX_WINDOW_SECONDS
      ) {
        throw new InvalidMetricOptionsError(
          `Summary window must be between ${MIN_WINDOW_SECONDS} and ${MAX_WINDOW_SECONDS} seconds`,
          { field: 'window', metricType: 'SUMMARY' },
        );
      }
    }
    super({ ...opt, quantiles, type: 'SUMMARY' });
    this._window = opt.window ?? DEFAULT_WINDOW_SECONDS;
    // De-duplicate before sorting: a repeated quantile (easy to hit when
    // quantile lists are concatenated from overlapping config groups)
    // would otherwise render the same `quantile="..."` series twice — a
    // duplicate series a strict Prometheus scraper rejects, aborting the
    // whole scrape.
    this._quantiles = [...new Set(quantiles)].sort((a, b) => a - b);
    this._lastPurge = this._now();
  }

  /**
   * Record a single observation. The value is added to the per-series
   * cumulative `sum`/`count` (lifetime totals that never decrease) and
   * also bucketed by the current epoch second so `_purge()` can drop it
   * from the windowed quantile buffer once it falls outside `window`.
   *
   * @throws {@link InvalidMetricOptionsError} When `value` is
   *   non-finite (`NaN`, `±Infinity`) — it would render exposition
   *   most scrapers reject.
   * @throws {@link InvalidLabelError} When `labels` contains the
   *   reserved name `'quantile'` (collides with Prometheus quantile
   *   labels), or a label name that isn't a legal Prometheus label
   *   name.
   */
  public observe(value: number, labels?: Record<string, string>): void {
    if (!Number.isFinite(value)) {
      throw new InvalidMetricOptionsError(
        `Summary observation must be a finite number, got ${value}`,
        { field: 'value' },
      );
    }
    if (labels && RESERVED_LABEL in labels) {
      throw new InvalidLabelError(
        `'${RESERVED_LABEL}' is a reserved label name on summaries`,
        { label: RESERVED_LABEL, reason: 'reserved', metricType: 'SUMMARY' },
      );
    }
    const key = this._labelKey(labels);
    let raw = this._rawData.get(key);
    if (!raw) {
      raw = { data: {}, sum: 0, count: 0 };
      this._rawData.set(key, raw);
      // Mirror in `_data` so `__extractLabels` and the label list see
      // this series even before `_calculate()` runs.
      this._entry(labels, () => ({ quantile: {}, count: 0, sum: 0 }));
    }
    const now = this._now();
    raw.sum += value;
    raw.count++;
    const slot = raw.data[now];
    if (slot) slot.push(value);
    else raw.data[now] = [value];
    if (now - this._lastPurge >= this._window) {
      this._purge();
    }
  }

  /**
   * Drop every series, including the cumulative `sum`/`count` totals —
   * a full reset starts lifetime accounting over from zero.
   */
  public override reset(): void {
    super.reset();
    this._rawData.clear();
    this._lastPurge = this._now();
  }

  /**
   * Drop the series matching `labels`, discarding both its windowed
   * quantile buffer and its cumulative `sum`/`count` totals.
   */
  public override remove(labels?: Record<string, string>): boolean {
    const key = this._labelKey(labels);
    this._rawData.delete(key);
    return super.remove(labels);
  }

  /**
   * Snapshot with the quantiles recomputed first, so they reflect only
   * the samples still inside the window. `count` and `sum` are the
   * cumulative lifetime totals.
   */
  public override toJSON(): MetricOutput<SummarySeries> {
    this._calculate();
    return super.toJSON();
  }

  /**
   * Prometheus exposition for the summary family: one
   * `{quantile="…"}` line per configured quantile, then `_sum` and
   * `_count`. Quantiles are recomputed over the current window first;
   * `_sum`/`_count` stay cumulative. A summary with no observations
   * renders just its `# HELP` / `# TYPE` header lines.
   */
  public override toPrometheus(): string {
    this._calculate();
    // Assemble a flat line list — the two header lines first, then each
    // series' rendered block — and join with a single line feed, adding
    // exactly one trailing `\n`. This is the same construction as
    // BaseMetric.toPrometheus, and using it (rather than concatenating a
    // header string that already ends in `\n` with a possibly-empty data
    // string) keeps the output spec-valid when there are no series yet: an
    // unobserved summary renders just its two header lines and still ends
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
   * Debug dump with the quantiles recomputed over the current window
   * first.
   */
  public override toString(): string {
    this._calculate();
    return super.toString();
  }

  /**
   * Materialise quantile/count/sum into `_data`. The `quantile`
   * estimates are recomputed from the freshly-purged windowed samples,
   * so they reflect only the recent `window`. The `count`/`sum`
   * published are the per-series **cumulative lifetime totals** — they
   * are never purged, matching Prometheus/client_golang summary
   * semantics so `rate()`/`increase()` over a scraped `_count`/`_sum`
   * see a monotonic series rather than a spurious counter reset when
   * old samples age out. Called at read time so reads always see a
   * freshly-purged quantile view.
   *
   * The read-time purge does NOT advance `_lastPurge`: reads more
   * frequent than `window` would otherwise keep resetting the marker
   * and starve the observe-time purge, letting the windowed sample
   * buffer grow unbounded on a write-heavy series that is also scraped
   * often.
   */
  protected _calculate(): void {
    this._purge(false);
    for (const [k, raw] of this._rawData) {
      const sorted = Object.values(raw.data).flat().sort((a, b) => a - b);
      const qnR: Record<number, number> = {};
      for (const q of this._quantiles) {
        qnR[q] = interpolateQuantile(sorted, q);
      }
      // `observe()` mirrors every `_rawData` series into `_data`, and
      // `remove()`/`reset()` clear both maps together, so the matching
      // entry always exists here — reuse it to preserve its `labels`
      // record (needed by `__extractLabels()` for the JSON label list).
      // Publish the windowed quantiles alongside the cumulative
      // (never-purged) sum/count.
      const existing = this._data.get(k)!;
      existing.data = { quantile: qnR, count: raw.count, sum: raw.sum };
    }
  }

  /**
   * Drop the windowed quantile samples older than the configured
   * `window`. Only the second-bucketed `data` (which feeds the
   * quantile estimates) is pruned; the cumulative `sum`/`count` are
   * lifetime totals and are deliberately left untouched so scraped
   * `_sum`/`_count` stay monotonic (Prometheus semantics — see
   * {@link observe} and {@link _calculate}).
   *
   * @param advanceMarker - When `true` (observe-time path), reset the
   *   `_lastPurge` marker so the next observe-time purge fires a full
   *   `window` later. Read-time purges pass `false` so frequent reads
   *   don't reset the observe-time schedule.
   */
  protected _purge(advanceMarker = true): void {
    const now = this._now();
    const min = now - this._window;
    for (const raw of this._rawData.values()) {
      for (const sec of Object.keys(raw.data)) {
        if (Number.parseInt(sec, 10) < min) delete raw.data[Number(sec)];
      }
    }
    if (advanceMarker) this._lastPurge = now;
  }

  /**
   * Current epoch time in whole seconds. Every window calculation
   * (observation bucketing, purge scheduling, purge cut-off) reads
   * the clock through this seam so tests can subclass and drive time
   * deterministically instead of sleeping.
   */
  protected _now(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Render one series' quantile, `_sum`, and `_count` lines, with no
   * trailing line feed — the caller joins and terminates the document.
   *
   * @param labels - Pre-rendered label segments, empty for the
   *   unlabelled series.
   */
  private __renderSeries(labels: string[], v: SummarySeries): string {
    const labelStr = labels.join(',');
    const lines: string[] = this._quantiles.map((q) => {
      const inner = [...labels, `quantile="${q}"`].join(',');
      return `${this.name}{${inner}} ${v.quantile[q]}`;
    });
    lines.push(
      `${this.name}_sum{${labelStr}} ${v.sum}`,
      `${this.name}_count{${labelStr}} ${v.count}`,
    );
    return lines.join('\n');
  }
}

/**
 * Linear interpolation between the two nearest ranks. Returns `0`
 * for an empty array (e.g. after a full window purge) so the rendered
 * exposition stays a finite number — many scrapers reject `NaN`.
 */
function interpolateQuantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const rank = (sorted.length - 1) * q;
  const base = Math.floor(rank);
  const frac = rank - base;
  const lower = sorted[base]!;
  const upper = sorted[base + 1];
  if (upper === undefined) return lower;
  return lower + frac * (upper - lower);
}
