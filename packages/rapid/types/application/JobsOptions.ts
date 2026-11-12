/**
 * @fileoverview {@link RapidApplicationJobsOptions} — scheduled-job execution gate for this
 * replica.
 *
 * @module
 */

/**
 * Scheduled-job execution configuration. Job DEFINITIONS live in code
 * (`app.job(name, cron, handler)`); this only gates whether THIS
 * replica arms the scheduler.
 */
export type RapidApplicationJobsOptions = {
  /**
   * Whether this replica runs registered jobs.
   * @default true
   */
  enabled?: boolean;
  /**
   * IANA time zone (`'Asia/Kolkata'`, `'UTC'`) every job's schedule is
   * read in, unless the job names its own. Omitted, schedules follow the
   * server's local clock.
   */
  timezone?: string;
};
