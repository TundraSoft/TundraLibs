/**
 * @fileoverview Error thrown when a lookup or mutation targets a job
 * name that is not registered.
 *
 * @module
 */

import { CronusError } from './Base.ts';

/**
 * Structured context for {@link JobNotFoundError}.
 *
 * `name` is the name that resolved to nothing.
 */
export type JobNotFoundContext = {
  name: string;
};

/**
 * Thrown by `Cronus.get`/`remove`/`enable`/`disable`/`isRunning`/
 * `trigger` when no job is registered under the given name.
 */
export class JobNotFoundError extends CronusError<JobNotFoundContext> {}
