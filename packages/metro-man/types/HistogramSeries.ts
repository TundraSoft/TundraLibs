/**
 * @fileoverview Per-series payload shape emitted by a Histogram.
 *
 * @module
 */

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
