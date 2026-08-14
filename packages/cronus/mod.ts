/**
 * @fileoverview `@tundralibs/cronus` — a cross-runtime, minute-resolution
 * cron scheduler for Deno, Bun, and Node.
 *
 * Built on a **tick-and-match** architecture: a self-correcting timer
 * fires at each minute boundary and runs every job whose 5-field cron
 * expression matches the current time. It never computes a "next run",
 * so an impossible expression (`0 0 30 2 *`) simply never fires instead
 * of crashing, and there is no far-future timer to overflow.
 *
 * - Standard cron syntax with ranges, steps, lists, and `JAN`/`MON`
 *   names; day-of-week accepts 0 and 7 for Sunday; POSIX/Vixie
 *   day-of-month/day-of-week OR semantics
 * - **Per-job overlap prevention** — a matching tick on a still-running
 *   job is skipped, so a 5-minute job on a per-minute schedule resumes
 *   on the 6th minute, never overlapping itself
 * - Run-once (`addOnce` — auto-removes after its single run) and
 *   run-now (`trigger()` — bypasses the schedule, respects the guard)
 * - Isolated `run`/`success`/`error`/`finish`/`skip` events — a
 *   throwing or rejecting listener can never wedge a job or the ticker
 *
 * @module
 *
 * @example
 * ```typescript
 * import { Cronus } from '@tundralibs/cronus';
 *
 * declare function purgeExpired(): Promise<void>;
 * declare function runMigration(): Promise<void>;
 *
 * const cron = new Cronus();
 * cron.on('error', (_id, name, _at, _ms, err) =>
 *   console.error(`job ${name} failed:`, err.message));
 *
 * cron.add('hourly-cleanup', '0 * * * *', async () => {
 *   await purgeExpired();
 * });
 * cron.addOnce('migrate', '0 3 * * *', runMigration);
 * cron.start();
 * ```
 */

export { Cronus } from './Cronus.ts';
export { isValidSchedule, matches, parseSchedule } from './schedule.ts';
export {
  CronusError,
  type DuplicateJobContext,
  DuplicateJobError,
  type InvalidActionContext,
  InvalidActionError,
  type InvalidScheduleContext,
  InvalidScheduleError,
  type JobNotFoundContext,
  JobNotFoundError,
} from './errors/mod.ts';
export type {
  CronusAction,
  CronusEvents,
  CronusJobInfo,
  CronusJobOptions,
  CronusOptions,
  CronusRunContext,
  ParsedSchedule,
} from './types/mod.ts';
