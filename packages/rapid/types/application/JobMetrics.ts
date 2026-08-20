/**
 * @fileoverview {@link RapidApplicationJobMetrics} — cron/job scheduler
 * statistics surfaced on the Application.
 *
 * @module
 */

import type { CronusJobInfo } from '@tundralibs/cronus';

/**
 * Cron scheduler statistics — a summary plus each job's public snapshot
 * (run count, last-run time, whether it is executing right now).
 * `undefined` on the Application when the job transport is not running.
 */
export type RapidApplicationJobMetrics = {
  /** Registered jobs. */
  total: number;
  /** Jobs whose action is executing right now. */
  running: number;
  /** Per-job snapshots (name, schedule, runCount, lastRun, …). */
  jobs: readonly CronusJobInfo[];
};
