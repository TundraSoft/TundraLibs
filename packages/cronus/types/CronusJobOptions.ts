/**
 * @fileoverview {@link CronusJobOptions} — per-job registration options.
 *
 * @module
 */

/** Options accepted when registering a job. */
export type CronusJobOptions = {
  /**
   * Run exactly ONCE — at the next matching minute — then auto-remove.
   * @default false
   */
  once?: boolean;
  /**
   * Start enabled. A disabled job is skipped by the ticker but still
   * runnable via `trigger()`.
   * @default true
   */
  enabled?: boolean;
};
