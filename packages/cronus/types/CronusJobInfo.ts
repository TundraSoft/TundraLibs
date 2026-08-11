/**
 * @fileoverview {@link CronusJobInfo} — the public, read-only view of a
 * job.
 *
 * @module
 */

/**
 * Public snapshot of a job (returned by `get`/`list`). Mutating a
 * snapshot never affects the scheduler.
 */
export type CronusJobInfo = {
  name: string;
  schedule: string;
  once: boolean;
  enabled: boolean;
  /** `true` while the job's action is currently executing. */
  running: boolean;
  /**
   * Runs STARTED since registration — includes runs that failed and
   * manual `trigger()` runs.
   */
  runCount: number;
  /**
   * When the most recent run STARTED (not completed); `null` before
   * the first run.
   */
  lastRun: Date | null;
};
