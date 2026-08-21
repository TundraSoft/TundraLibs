/**
 * @fileoverview Per-series payload shape emitted by a Summary.
 *
 * @module
 */

/**
 * Per-series payload carried by a Summary.
 */
export type SummarySeries = {
  quantile: Record<number, number>;
  count: number;
  sum: number;
};
