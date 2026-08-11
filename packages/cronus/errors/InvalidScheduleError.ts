/**
 * @fileoverview Error thrown when a cron expression cannot be parsed.
 *
 * @module
 */

import { CronusError } from './Base.ts';

/**
 * Structured context for {@link InvalidScheduleError}.
 *
 * `expression` is the offending schedule, `field` the cron field that
 * failed (when the failure is field-specific), and `reason` the
 * human-readable cause.
 */
export type InvalidScheduleContext = {
  expression: string;
  field?: string;
  reason: string;
};

/**
 * Thrown by `parseSchedule` (and therefore `Cronus.add`) when a cron
 * expression is malformed — wrong field count, a value outside its
 * range, a malformed range/step, or an unknown month/day name.
 */
export class InvalidScheduleError extends CronusError<InvalidScheduleContext> {}
