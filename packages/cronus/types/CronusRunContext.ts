/**
 * @fileoverview {@link CronusRunContext} — per-run metadata handed to a
 * job action.
 *
 * @module
 */

/**
 * The context handed to a job action on each run — enough to log,
 * correlate, and measure without reaching back into the scheduler.
 */
export type CronusRunContext = {
  /** Unique id for THIS run (not the job) — a fresh UUID per firing. */
  runId: string;
  /** The job's registered name. */
  name: string;
  /**
   * The minute boundary this run fired for (a scheduled tick), or the
   * call time for a run started via `trigger()`.
   */
  scheduledAt: Date;
  /** Nth run of this job since registration (1-based; a manual trigger counts). */
  runCount: number;
  /** `true` when this run came from `trigger()` rather than the schedule. */
  triggered: boolean;
};
