/**
 * @module
 *
 * `REBUILD_TABLE` — the composite migration action for changes no
 * in-place ALTER can express: crypto-marker flips (decrypt/re-encrypt
 * data rewrite, every dialect) and, on dialects without in-place
 * column/constraint ALTERs (SQLite), type/nullability/PK/FK changes.
 *
 * The Migrator executes it as: drop old indexes → rename the table
 * aside (`<name>__pre_migrate`) → create the new shape (+ indexes) →
 * copy rows (single `INSERT … SELECT` when structural; streamed
 * decrypt/re-encrypt/digest-backfill when crypto changes) → verify
 * row counts → drop the aside table.
 *
 * NOT crash-safe on MariaDB (DDL implicitly commits); a failed run
 * leaves `<name>__pre_migrate` behind for manual recovery — the next
 * apply refuses on the rename collision rather than guessing.
 *
 * @since 1.0.0
 */

import type { Query } from '@tundralibs/oql/types';
import type { DdlQuery } from '../executor.ts';
import type { SnapEntity } from './snapshot.ts';
import {
  createTableAction,
  indexActions,
  indexName,
  uniqueIndexName,
} from './diff.ts';

/** Composite rebuild — executed by the Migrator, not the executor. */
export type RebuildTable = {
  readonly kind: 'REBUILD_TABLE';
  readonly entityKey: string;
  /** Physical shape the table has NOW (pre-version). */
  readonly from: SnapEntity;
  /** Target shape. */
  readonly to: SnapEntity;
  /** Copy mapping: `[toColumn, fromColumn]` (renames resolved).
   * Synthesized `_hash` siblings are handled separately. */
  readonly pairs: ReadonlyArray<readonly [string, string]>;
  /** Rows need per-row JS work (crypto flips / sibling backfill) —
   * otherwise a single INSERT…SELECT copies everything. */
  readonly transform: boolean;
};

/** What a migration step may execute. */
export type MigrationAction = DdlQuery | RebuildTable;

/** Narrow a {@link MigrationAction} to a full table rebuild (vs. a
 * plain DDL query). */
export function isRebuild(a: MigrationAction): a is RebuildTable {
  return (a as RebuildTable).kind === 'REBUILD_TABLE';
}

/** The DDL around a rebuild's copy step — THE single spelling of the
 * sequence, consumed by the Migrator's executor loop AND the stored
 * plan-artifact renderer (they must never drift). */
export type RebuildPlan = {
  readonly aside: string;
  /** Drop old indexes (names embed the OLD table name) → rename the
   * table aside → create the new shape → create its indexes. */
  readonly preCopy: DdlQuery[];
  /** Single INSERT…SELECT for structural rebuilds; null when the
   * copy needs per-row JS (crypto transform). */
  readonly structuralCopy: Query<'INSERT_FROM_QUERY'> | null;
  /** Drop the aside table (runs AFTER row-count verification). */
  readonly postCopy: DdlQuery[];
};

/** Expand a rebuild into its ordered DDL: rename the old table aside,
 * create the new shape, copy, then drop the aside. The single spelling
 * shared by the executor loop and the stored plan artifact. */
export function rebuildDdlPlan(r: RebuildTable): RebuildPlan {
  const aside = `${r.to.name}__pre_migrate`;
  const schema = r.from.dbSchema !== undefined
    ? { schema: r.from.dbSchema }
    : {};
  const preCopy: DdlQuery[] = [];
  for (
    const [kind, namer] of [
      ['indexes', indexName],
      ['uniques', uniqueIndexName],
    ] as const
  ) {
    for (const key of Object.keys(r.from[kind] ?? {})) {
      preCopy.push({
        type: 'DROP_INDEX',
        index: namer(r.from.name, key),
        table: r.from.name,
        ...schema,
        ifExists: true,
      });
    }
  }
  preCopy.push({
    type: 'ALTER_TABLE',
    table: r.from.name,
    ...schema,
    renameTo: aside,
  });
  preCopy.push(createTableAction(r.to));
  preCopy.push(...indexActions(r.to));

  let structuralCopy: Query<'INSERT_FROM_QUERY'> | null = null;
  if (!r.transform) {
    const projection: Record<`@${string}`, true> = {};
    for (const [, prev] of r.pairs) projection[`@${prev}`] = true;
    structuralCopy = {
      type: 'INSERT_FROM_QUERY',
      table: r.to.name,
      ...(r.to.dbSchema !== undefined ? { schema: r.to.dbSchema } : {}),
      columns: r.pairs.map(([cur]) => cur),
      query: {
        type: 'SELECT',
        table: aside,
        ...schema,
        columns: r.pairs.map(([, prev]) => prev),
        projection,
      },
    };
  }

  const postCopy: DdlQuery[] = [{
    type: 'DROP_TABLE',
    table: aside,
    ...schema,
  }];
  return { aside, preCopy, structuralCopy, postCopy };
}
