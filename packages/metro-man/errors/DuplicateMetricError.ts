/**
 * @fileoverview Error thrown when registering a metric under a name
 * that's already in use.
 *
 * @module
 */

import { MetroManError } from './Base.ts';

/**
 * Structured context for {@link DuplicateMetricError}.
 *
 * `name` is the normalised lookup key (trimmed, lower-cased) of the
 * already-registered metric.
 */
export type DuplicateMetricContext = {
  name: string;
};

/**
 * Thrown by `MetroMan.register` (and the factory methods) when a
 * metric is already registered under the same case-insensitive name.
 * Catch this if you intend to deduplicate; otherwise let it surface
 * — duplicate registration is almost always a setup bug.
 */
export class DuplicateMetricError
  extends MetroManError<DuplicateMetricContext> {}
