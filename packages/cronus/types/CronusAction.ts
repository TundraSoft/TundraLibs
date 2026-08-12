/**
 * @fileoverview {@link CronusAction} — the callable a job runs.
 *
 * @module
 */

import type { CronusRunContext } from './CronusRunContext.ts';

/**
 * A job's action — sync or async; receives a {@link CronusRunContext}
 * and its return value is surfaced on the `success` event.
 */
export type CronusAction = (
  context: CronusRunContext,
) => unknown | Promise<unknown>;
