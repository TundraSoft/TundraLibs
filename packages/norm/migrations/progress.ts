/**
 * @module
 *
 * `_norm_migration_progress` — the resume checkpoint for engines whose
 * DDL does NOT roll back (MariaDB/MySQL implicitly COMMIT on every DDL
 * statement; Mongo has no transaction surface at all).
 *
 * On those engines a version's plan cannot be applied atomically, so the
 * Migrator makes the RETRY safe instead: after each action succeeds it
 * records how far the version got, and a later `apply()` resumes from
 * that point rather than re-emitting statements that already landed
 * (`ADD COLUMN` / `ADD CONSTRAINT` are not emitted with `IF NOT
 * EXISTS`, so re-emitting them fails with "already exists").
 *
 * The row is deleted the moment the version is recorded in
 * `_norm_migrations`, so the table is empty on a healthy database. Its
 * own schema is FIXED and never migrates; do not register a model under
 * the reserved name.
 *
 * @since 1.0.0
 */

import type { Query } from '@tundralibs/oql/types';

/** Reserved physical table name. */
export const PROGRESS_TABLE_NAME = '_norm_migration_progress';

/** How far one version got before it failed. */
export type ProgressRow = {
  version: number;
  /** Hash of the action list that produced `completed` — a resume is
   * only safe against the SAME plan. */
  planHash: string;
  /** Number of leading actions that completed. */
  completed: number;
  updatedAt: string;
};

/** Idempotent CREATE for the checkpoint table. */
export function progressCreateQuery(): Query<'CREATE_TABLE'> {
  return {
    type: 'CREATE_TABLE',
    table: PROGRESS_TABLE_NAME,
    columns: {
      version: { type: 'INTEGER', nullable: false },
      planHash: { type: 'VARCHAR', length: 16, nullable: false },
      completed: { type: 'INTEGER', nullable: false },
      updatedAt: { type: 'VARCHAR', length: 32, nullable: false },
    },
    primaryKey: ['version'],
    ifNotExists: true,
  };
}
