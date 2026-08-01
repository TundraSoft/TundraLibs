/**
 * @module
 *
 * `snapshot()` — the LOGICAL DDL-facts export: a deterministic,
 * human-readable view of what a registry declares (docs, debugging,
 * golden tests). It is NOT the migration wire format — the Migrator
 * uses `migrations/snapshot.ts`'s PHYSICAL projection (encrypted
 * columns → TEXT, FK targets resolved to physical tables, hint
 * bookkeeping, FNV hash). The two must agree on WHICH facts are
 * DDL-relevant — `migrations.test.ts` pins them in sync — but this
 * one keeps logical types and comments; that one is what executes.
 *
 * Not a serialization format either: definitions are never rebuilt
 * from it.
 *
 * Deliberately EXCLUDED (runtime-only, no DDL footprint):
 * - defaults — system-generated at write time (the generated Guardian
 *   supplies them via `.optional()`), never `DEFAULT` clauses;
 * - transforms, hooks — callbacks;
 * - validators (`lov`/`pattern`/`min`/…) — enforced by the generated
 *   Guardian, not by CHECK constraints;
 * - read/write scoping (`project`/`filterable`/`disableInsert`/…);
 * - QUERY entities entirely — client-side, no DDL.
 *
 * FK targets remain ENTITY KEYS in the snapshot: renaming a table or
 * database schema diffs as an ALTER of the target entity, while the
 * linkage itself stays stable.
 *
 * @since 1.0.0
 */

import type { ColumnSpec } from './Column.ts';
import {
  entitiesOf,
  type RegistryInput as SnapshotInput,
} from './registry-view.ts';

/** One column as migrations see it. */
export type ColumnSnapshot = {
  readonly type: string;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly nullable?: true;
  readonly encrypt?: true;
  readonly hash?: true;
  /** Digest column (`Column.hash(algo)`) — algorithm drives the
   * physical length, so changing it IS a schema change. */
  readonly hashed?: string;
  /** COLUMN rename hint (DDL-relevant for the diff). */
  readonly renamedFrom?: string;
  readonly comment?: string;
};

/** One entity as migrations see it (TABLE or VIEW — never QUERY). */
export type EntitySnapshot = {
  readonly kind: 'TABLE' | 'VIEW';
  readonly name: string;
  readonly dbSchema?: string;
  readonly comment?: string;
  readonly columns: Record<string, ColumnSnapshot>;
  readonly primaryKeys?: readonly string[];
  readonly foreignKeys?: Record<
    string,
    {
      readonly model: string;
      readonly on: Record<string, string>;
      readonly onDelete?: string;
      readonly onUpdate?: string;
    }
  >;
  readonly indexes?: Record<string, readonly string[]>;
  readonly uniques?: Record<string, readonly string[]>;
  /** TABLE rename hint (DDL-relevant for the diff). */
  readonly renamedFrom?: string;
  readonly query?: unknown;
  /** VIEW: created MATERIALIZED. */
  readonly materialized?: true;
};

/** The whole registry, DDL facts only, deterministically ordered. */
export type Snapshot = {
  readonly entities: Record<string, EntitySnapshot>;
};

function sortedKeys<T>(rec: Record<string, T>): string[] {
  return Object.keys(rec).sort();
}

function columnSnapshot(spec: ColumnSpec): ColumnSnapshot {
  return {
    type: spec.type,
    ...(spec.length !== undefined ? { length: spec.length } : {}),
    ...(spec.precision !== undefined ? { precision: spec.precision } : {}),
    ...(spec.scale !== undefined ? { scale: spec.scale } : {}),
    ...(spec.nullable === true ? { nullable: true } : {}),
    ...(spec.encrypt === true ? { encrypt: true } : {}),
    ...(spec.hash === true ? { hash: true } : {}),
    ...(spec.hashed !== undefined ? { hashed: spec.hashed } : {}),
    ...(spec.renamedFrom !== undefined
      ? { renamedFrom: spec.renamedFrom }
      : {}),
    ...(spec.comment !== undefined ? { comment: spec.comment } : {}),
  };
}

/**
 * Reduce a schema value or composed registry to its migration
 * snapshot. Stable output: entity, column, FK, and index keys are
 * sorted, so equal definitions always produce byte-equal JSON.
 */
export function snapshot(input: SnapshotInput): Snapshot {
  const entities = entitiesOf(input);
  const out: Record<string, EntitySnapshot> = {};

  for (const key of sortedKeys(entities)) {
    const def = entities[key]!;
    if (def.type === 'QUERY') continue; // no DDL footprint

    const columns: Record<string, ColumnSnapshot> = {};
    const specMap = def.columns as Record<string, ColumnSpec>;
    for (const col of sortedKeys(specMap)) {
      if (specMap[col]!.masked !== undefined) continue; // virtual — no DDL
      columns[col] = columnSnapshot(specMap[col]!);
    }

    const dbSchema = (def as { dbSchema?: string }).dbSchema;
    const comment = (def as { comment?: string }).comment;
    const base = {
      kind: def.type,
      name: def.name,
      ...(dbSchema !== undefined ? { dbSchema } : {}),
      ...(comment !== undefined ? { comment } : {}),
      columns,
    };

    if (def.type === 'VIEW') {
      out[key] = {
        ...base,
        kind: 'VIEW',
        query: def.query,
        ...((def as { materialized?: true }).materialized === true
          ? { materialized: true }
          : {}),
      };
      continue;
    }

    const fks = def.foreignKeys as
      | Record<string, { model: string; on: Record<string, string> }>
      | undefined;
    const foreignKeys = fks === undefined ? undefined : Object.fromEntries(
      sortedKeys(fks).map((alias) => [alias, {
        model: fks[alias]!.model,
        on: Object.fromEntries(
          sortedKeys(fks[alias]!.on).map((l) => [l, fks[alias]!.on[l]!]),
        ),
        ...((fks[alias] as { onDelete?: string }).onDelete !== undefined
          ? { onDelete: (fks[alias] as { onDelete?: string }).onDelete }
          : {}),
        ...((fks[alias] as { onUpdate?: string }).onUpdate !== undefined
          ? { onUpdate: (fks[alias] as { onUpdate?: string }).onUpdate }
          : {}),
      }]),
    );
    const idx = def.indexes as Record<string, readonly string[]> | undefined;
    const indexes = idx === undefined ? undefined : Object.fromEntries(
      sortedKeys(idx).map((n) => [n, [...idx[n]!]]),
    );
    const unq = (def as { uniques?: Record<string, readonly string[]> })
      .uniques;
    const uniques = unq === undefined ? undefined : Object.fromEntries(
      sortedKeys(unq).map((n) => [n, [...unq[n]!]]),
    );
    const renamedFrom = (def as { renamedFrom?: string }).renamedFrom;

    out[key] = {
      ...base,
      kind: 'TABLE',
      primaryKeys: [...(def.primaryKeys as readonly string[])],
      ...(foreignKeys !== undefined ? { foreignKeys } : {}),
      ...(indexes !== undefined ? { indexes } : {}),
      ...(uniques !== undefined ? { uniques } : {}),
      ...(renamedFrom !== undefined ? { renamedFrom } : {}),
    };
  }

  return { entities: out };
}
