/**
 * @fileoverview Error thrown when registering a job under a name that is
 * already in use.
 *
 * @module
 */

import { CronusError } from './Base.ts';

/**
 * Structured context for {@link DuplicateJobError}.
 *
 * `name` is the already-registered job name.
 */
export type DuplicateJobContext = {
  name: string;
};

/**
 * Thrown by `Cronus.add`/`Cronus.addOnce` when a job is already
 * registered under the same name. Catch this to deduplicate;
 * otherwise let it surface — duplicate registration is almost always
 * a setup bug.
 */
export class DuplicateJobError extends CronusError<DuplicateJobContext> {}
