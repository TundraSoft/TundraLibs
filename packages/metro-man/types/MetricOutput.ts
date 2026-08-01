/**
 * @fileoverview JSON shape emitted by `toJSON()` / `dump('JSON')`.
 *
 * @module
 */

/**
 * Serialised form of a metric, returned by every metric's `toJSON()`.
 *
 * `data` is keyed by the canonical label string (`'no_label'` for
 * unlabelled series, or `name="value"` segments joined with `,`).
 * `T` is the per-series payload — `number` for counters/gauges, an
 * ordered bucket list for histograms, a quantile record for
 * summaries.
 */
export type MetricOutput<T> = {
  name: string;
  help: string;
  type: string;
  labels: Array<string>;
  data: Record<string, T>;
};
