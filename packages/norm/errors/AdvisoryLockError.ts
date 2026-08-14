/**
 * @module
 *
 * `NormAdvisoryLockError` — thrown by the executor seam when a
 * server-side advisory lock (`pg_advisory_lock` / `GET_LOCK`) cannot be
 * acquired within its timeout. Distinct from a failure INSIDE the
 * locked critical section, so the migration layer can map it to a
 * `LOCK_TIMEOUT` {@link NormMigrationError} while letting the guarded
 * work's own errors propagate untouched.
 *
 * @since 1.0.0
 */

import { NormError } from './Base.ts';

/** Metadata for {@link NormAdvisoryLockError}. */
export type AdvisoryLockErrorMeta = {
  /** The advisory-lock name that could not be taken. */
  key: string;
  /** The wait budget, in milliseconds, that elapsed. */
  timeoutMs: number;
  /** Engine dialect that owns the lock, when known. */
  dialect?: string;
} & Record<string, unknown>;

/**
 * A server-side advisory lock could not be acquired in time — another
 * process almost certainly holds it. Carries the stable
 * `LOCK_TIMEOUT` code.
 *
 * @example
 * ```ts ignore
 * try {
 *   await ex.withAdvisoryLock('norm:migrator', 30_000, run);
 * } catch (e) {
 *   if (e instanceof NormAdvisoryLockError) {
 *     console.error(`Lock '${e.context.key}' is held elsewhere.`);
 *   }
 * }
 * ```
 */
export class NormAdvisoryLockError extends NormError<AdvisoryLockErrorMeta> {
  /**
   * Always carries `code: 'LOCK_TIMEOUT'` — the code on `meta` is
   * overwritten, since a timeout is the only way to get here.
   */
  constructor(meta: AdvisoryLockErrorMeta, cause?: Error) {
    super(
      `advisory lock '${meta.key}' not acquired within ${meta.timeoutMs}ms`,
      { ...meta, code: 'LOCK_TIMEOUT' },
      cause,
    );
  }
}
