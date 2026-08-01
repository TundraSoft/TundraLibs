/**
 * @fileoverview Error thrown when a metric is constructed with options
 * that fail validation.
 *
 * @module
 */

import { MetroManError } from './Base.ts';

/**
 * Structured context for {@link InvalidMetricOptionsError}.
 *
 * `field` is the offending option key; `metricType` is the expected
 * type literal for the specific metric class (`'COUNTER'`,
 * `'GAUGE'`, etc.) when the failure relates to type discrimination.
 */
export type InvalidMetricOptionsContext = {
  field: string;
  metricType?: string;
};

/**
 * Thrown when a metric constructor receives an options object that
 * fails validation — missing `name`, wrong `type`, malformed
 * `buckets`/`quantiles`, out-of-range `window`, etc.
 *
 * Callers use the public `context.field` to disambiguate which option
 * tripped the validator without parsing the message.
 */
export class InvalidMetricOptionsError extends MetroManError<
  InvalidMetricOptionsContext
> {}
