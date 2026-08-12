/**
 * @fileoverview The event surface — metadata only, never the action's
 * arguments or return payloads beyond what a monitor needs.
 *
 * @module
 */

import type { CronusError } from '../errors/mod.ts';

/**
 * Cronus lifecycle events.
 *
 * Listeners are ISOLATED per listener (inherited from `Events`): a
 * sync throw or an async rejection is caught and reported via
 * `console.error` — it never affects the run, the job's state, other
 * listeners, the ticker, or the process. `off(event, callback)` also
 * removes `once` listeners by their original callback.
 */
export type CronusEvents = {
  /** A run started. */
  run: (runId: string, name: string, scheduledAt: Date) => void;
  /** A run completed without throwing; `result` is the action's return. */
  success: (
    runId: string,
    name: string,
    scheduledAt: Date,
    elapsed: number,
    result: unknown,
  ) => void;
  /** A run threw; `error` is normalised to a {@link CronusError}. */
  error: (
    runId: string,
    name: string,
    scheduledAt: Date,
    elapsed: number,
    error: CronusError,
  ) => void;
  /** A run settled (success OR error) — the place for always-run teardown. */
  finish: (
    runId: string,
    name: string,
    scheduledAt: Date,
    elapsed: number,
  ) => void;
  /** A scheduled tick matched but the job was already running (skipped). */
  skip: (name: string, scheduledAt: Date) => void;
};
