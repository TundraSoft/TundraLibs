/**
 * @fileoverview Error raised when one or more handlers fail during
 * `Slogger.finalize()`.
 *
 * @module
 */

import { SloggerError } from './Base.ts';

/**
 * One handler's failure recorded during `Slogger.finalize()`.
 */
export type SloggerFinalizeFailure = {
  /** Name of the handler whose `finalize()` rejected. */
  handler: string;
  /** The rejection reason (usually an `Error`). */
  error: unknown;
};

/**
 * Thrown by `Slogger.finalize()` after ALL handlers have been
 * finalized, when at least one of them rejected. Finalization never
 * aborts at the first failure — every handler gets its flush/close
 * attempt — and the collected failures are surfaced together here.
 *
 * `context.failures` (also exposed as the {@link failures} getter)
 * lists each failing handler with its rejection reason; `cause` is
 * the first failure's error (when it is an `Error`) for quick
 * top-of-chain inspection.
 */
export class SloggerFinalizeError
  extends SloggerError<{ failures: SloggerFinalizeFailure[] }> {
  /**
   * Summarises the failing handler names into the message and chains the
   * first failure as `cause`.
   *
   * @param failures - Per-handler failures collected while finalizing
   *   every handler; must be non-empty.
   */
  constructor(failures: SloggerFinalizeFailure[]) {
    const names = failures.map((f) => `'${f.handler}'`).join(', ');
    super(
      `finalize() failed for ${failures.length} handler(s): ${names}`,
      { failures },
      failures[0]?.error instanceof Error ? failures[0].error : undefined,
    );
  }

  /**
   * The collected per-handler failures (same array as
   * `context.failures`).
   */
  public get failures(): SloggerFinalizeFailure[] {
    return this.context.failures;
  }
}
