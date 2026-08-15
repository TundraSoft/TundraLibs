/**
 * @module
 *
 * `NormMigrationError` — thrown by the migration subsystem: snapshot
 * drift/tampering, plan-time dialect refusals (SQLite cannot alter
 * columns/constraints in place), lock contention, invalid rollback
 * targets.
 *
 * @since 1.0.0
 */

import { NormError } from './Base.ts';
import type { NormErrorCode } from './NormErrorCodes.ts';

/** Metadata carried by {@link NormMigrationError}. */
export type MigrationErrorMeta = {
  /** Migrations directory the operation ran against. */
  dir?: string;
  /** Migration version involved, when applicable. */
  version?: number;
  /** Entity / file / action the failure points at. */
  subject?: string;
  /** Stable machine-readable code identifying the failure mode — read
   * it as `error.code`. */
  code?: NormErrorCode;
};

/** A migration operation failed or was refused. */
export class NormMigrationError extends NormError<MigrationErrorMeta> {
  /** @param meta Migration context (dir, version, subject, code). */
  constructor(message: string, meta: MigrationErrorMeta = {}, cause?: Error) {
    super(message, meta, cause);
  }
}
