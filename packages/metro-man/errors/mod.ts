/**
 * Error surface for `@tundralibs/metro-man` — the base
 * {@link MetroManError} and the typed errors raised on duplicate or
 * misconfigured metric registration.
 *
 * @module
 */
export { MetroManError } from './Base.ts';
export {
  type DuplicateMetricContext,
  DuplicateMetricError,
} from './DuplicateMetricError.ts';
export {
  type InvalidLabelContext,
  InvalidLabelError,
} from './InvalidLabelError.ts';
export {
  type InvalidMetricOptionsContext,
  InvalidMetricOptionsError,
} from './InvalidMetricOptionsError.ts';
export {
  type MetricNotFoundContext,
  MetricNotFoundError,
} from './MetricNotFoundError.ts';
