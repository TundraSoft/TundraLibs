/**
 * @fileoverview `@tundralibs/cronus` — a cross-runtime, minute-resolution
 * cron scheduler (Deno, Bun, Node). Tick-and-match: never computes a
 * next-run, so impossible expressions never fire rather than crashing;
 * per-job overlap prevention; cron, run-once, and run-now triggers.
 *
 * @module
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
