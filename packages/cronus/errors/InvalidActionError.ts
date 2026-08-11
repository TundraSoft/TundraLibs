/**
 * @fileoverview Error thrown when a job's action is not callable.
 *
 * @module
 */

import { CronusError } from './Base.ts';

/**
 * Structured context for {@link InvalidActionError}.
 *
 * `name` is the job whose action failed validation.
 */
export type InvalidActionContext = {
  name: string;
};

/** Thrown by `Cronus.add` when the supplied action is not a function. */
export class InvalidActionError extends CronusError<InvalidActionContext> {}
