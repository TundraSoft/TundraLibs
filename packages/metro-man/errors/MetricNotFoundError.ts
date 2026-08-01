/**
 * @fileoverview Error thrown when `MetroMan.get(name)` cannot find a
 * registered metric.
 *
 * @module
 */

import { MetroManError } from './Base.ts';

/**
 * Structured context for {@link MetricNotFoundError}.
 *
 * `name` is the lookup string as the caller passed it (lower-cased
 * to match the registry's case-insensitive storage).
 */
export type MetricNotFoundContext = {
  name: string;
};

/**
 * Thrown by `MetroMan.get(name)` when no metric is registered under
 * the requested name. `MetroMan.has()` returning `false` and this
 * error are the two sides of the same check.
 */
export class MetricNotFoundError extends MetroManError<MetricNotFoundContext> {}
