/**
 * @fileoverview {@link TracerConfigError} — invalid {@link Tracer}
 * configuration.
 *
 * @author TundraSoft
 *
 * @module
 */

import { TracerError } from './Base.ts';

/** Metadata carried by a {@link TracerConfigError}. */
export type TracerConfigErrorMeta = {
  /** The offending option key. */
  key: string;
  /** The rejected value, when it is safe and useful to surface. */
  value?: unknown;
};

/**
 * Thrown at construction when an option is missing or invalid — an empty
 * `serviceName`, a non-function `sampler`, or an `idGenerator` whose output
 * does not match the W3C format.
 *
 * Config problems throw; nothing at span-recording time ever does. Tracing is
 * observability, and observability must not be able to break the application
 * it observes.
 */
export class TracerConfigError extends TracerError<TracerConfigErrorMeta> {}
