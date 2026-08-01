/**
 * @module
 *
 * `_norm_migrations` — the applied-migrations bookkeeping table. Its
 * own schema is FIXED and never migrates; do not register a model
 * under the reserved name.
 *
 * @since 1.0.0
 */

import type { Query } from '@tundralibs/oql/types';

/** Reserved physical table name. */
export const HISTORY_TABLE_NAME = '_norm_migrations';

/** One applied migration. */
export type HistoryRow = {
  version: number;
  hash: string;
  appliedAt: string;
  appliedBy: string | null;
  durationMs: number | null;
};

/** Idempotent CREATE for the history table. */
export function historyCreateQuery(): Query<'CREATE_TABLE'> {
  return {
    type: 'CREATE_TABLE',
    table: HISTORY_TABLE_NAME,
    columns: {
      version: { type: 'INTEGER', nullable: false },
      hash: { type: 'VARCHAR', length: 16, nullable: false },
      appliedAt: { type: 'VARCHAR', length: 32, nullable: false },
      appliedBy: { type: 'VARCHAR', length: 255, nullable: true },
      durationMs: { type: 'INTEGER', nullable: true },
    },
    primaryKey: ['version'],
    ifNotExists: true,
  };
}
