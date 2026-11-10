/**
 * @fileoverview Error thrown when a time zone name is not one the
 * runtime knows.
 *
 * @module
 */

import { CronusError } from './Base.ts';

/**
 * Structured context for {@link InvalidTimezoneError}.
 *
 * `timezone` is the rejected name.
 */
export type InvalidTimezoneContext = {
  timezone: string;
};

/**
 * Thrown by `new Cronus`, `Cronus.add` and `matches` when a `timezone`
 * is not an IANA zone name the runtime's `Intl` data recognises. The
 * runtime's own `RangeError` is preserved as `cause`.
 */
export class InvalidTimezoneError extends CronusError<InvalidTimezoneContext> {}
