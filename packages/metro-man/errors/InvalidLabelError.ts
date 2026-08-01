/**
 * @fileoverview Error thrown when a labels record uses a reserved or
 * invalid name.
 *
 * @module
 */

import { MetroManError } from './Base.ts';

/**
 * Structured context for {@link InvalidLabelError}.
 *
 * `label` is the offending label name; `reason` describes why it's
 * rejected — `'reserved'` for Prometheus-reserved names (`le` on
 * histograms, `quantile` on summaries), `'invalid'` for names outside
 * the legal Prometheus label pattern (`[a-zA-Z_][a-zA-Z0-9_]*`).
 */
export type InvalidLabelContext = {
  label: string;
  reason: 'reserved' | 'invalid';
  metricType: string;
};

/**
 * Thrown when a labels record is rejected: either the caller passed
 * a label whose name clashes with a Prometheus-reserved name the
 * renderer uses internally (`le` for histogram buckets, `quantile`
 * for summary quantiles), or a label name that would render
 * malformed exposition (a space, dash, quote, …).
 */
export class InvalidLabelError extends MetroManError<InvalidLabelContext> {}
