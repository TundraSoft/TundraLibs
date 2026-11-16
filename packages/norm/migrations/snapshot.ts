/**
 * @module
 *
 * Migration snapshots — the PHYSICAL schema as JSON, built from a
 * compiled registry. One file per version; the diff between two
 * snapshots is the migration.
 *
 * Physical, not logical: encrypted columns project to `TEXT` (their
 * at-rest shape), lengths/precisions drop with them; digest columns
 * keep their derived VARCHAR. Logical concerns (validators, hooks,
 * defaults, scopes) never appear. `renamedFrom` hints are CARRIED in
 * the file (apply() consumes them) but EXCLUDED from the hash, so a
 * hinted snapshot and its steady-state equivalent hash identically.
 *
 * @since 1.0.0
 */

import type { AnyDefinition, ColumnSpec } from '../definition/mod.ts';
import { isDateText, readTimeOfDay, temporalCondition } from '../calendar.ts';
import { DATE_TYPES } from '../guardians.ts';

/** One physical column. */
export type SnapColumn = {
  readonly type: string;
  readonly length?: number;
  readonly precision?: number;
  readonly scale?: number;
  readonly nullable?: true;
  /** Marker: at-rest ciphertext (physical TEXT). */
  readonly encrypt?: true;
  /** Marker: `<col>_hash` sibling of an encrypted column. */
  readonly hash?: true;
  /** Marker: one-way digest column + its algorithm. */
  readonly hashed?: string;
  /** MIGRATION HINT — excluded from hashing. */
  readonly renamedFrom?: string;
};

/** One physical FK constraint (entity keys resolved to tables). */
export type SnapForeignKey = {
  readonly columns: readonly string[];
  readonly references: {
    readonly table: string;
    readonly schema?: string;
    readonly columns: readonly string[];
  };
  /** Referential actions — DDL-relevant, so hashed + diffed. */
  readonly onDelete?: string;
  readonly onUpdate?: string;
};

/** One entity, physical facts only. */
export type SnapEntity = {
  readonly kind: 'TABLE' | 'VIEW';
  readonly name: string;
  readonly dbSchema?: string;
  readonly columns: Record<string, SnapColumn>;
  readonly primaryKeys?: readonly string[];
  readonly foreignKeys?: Record<string, SnapForeignKey>;
  readonly indexes?: Record<string, readonly string[]>;
  readonly uniques?: Record<string, readonly string[]>;
  /** VIEW body: the stored OQL SELECT, its `where` as
   * {@linkcode viewQuery} leaves it. */
  readonly query?: unknown;
  /** VIEW: `query` compares a date column with a `Date`, which the
   * file holds as ISO text. A snapshot written before 1.13.0 has no
   * marker, and the MongoDB view made from it stored the text. */
  readonly typedDates?: true;
  /** VIEW: CREATE MATERIALIZED VIEW (DDL-relevant — hashed). */
  readonly materialized?: true;
  /** MIGRATION HINT — excluded from hashing. */
  readonly renamedFrom?: string;
  /** Registry key of the source TABLE this is a generated AUDIT
   * replica of; absent for every other entity. `diffSnapshots` reads
   * this to retire (never drop) a column the source removes — see
   * `retireAuditColumns`. A structural fact, not a hint: included in
   * the hash like any other. */
  readonly auditOf?: string;
};

/** A whole-schema snapshot file. */
export type MigrationSnapshot = {
  /** Snapshot FORMAT version (not the migration number). */
  readonly format: 1;
  readonly generatedAt: string;
  /** 16-hex FNV-1a rollup (hints excluded). */
  readonly hash: string;
  readonly entities: Record<string, SnapEntity>;
};

function sortedKeys<T>(rec: Record<string, T>): string[] {
  return Object.keys(rec).sort();
}

/** Project one column spec to its physical shape. */
function snapColumn(spec: ColumnSpec): SnapColumn {
  if (spec.encrypt === true) {
    // Ciphertext at rest — length/precision are logical fictions.
    return {
      type: 'TEXT',
      ...(spec.nullable === true ? { nullable: true } : {}),
      encrypt: true,
      ...(spec.hash === true ? { hash: true } : {}),
      ...(spec.renamedFrom !== undefined
        ? { renamedFrom: spec.renamedFrom }
        : {}),
    };
  }
  return {
    type: spec.type,
    ...(spec.length !== undefined ? { length: spec.length } : {}),
    ...(spec.precision !== undefined ? { precision: spec.precision } : {}),
    ...(spec.scale !== undefined ? { scale: spec.scale } : {}),
    ...(spec.nullable === true ? { nullable: true } : {}),
    ...(spec.hashed !== undefined ? { hashed: spec.hashed } : {}),
    ...(spec.renamedFrom !== undefined
      ? { renamedFrom: spec.renamedFrom }
      : {}),
  };
}

/** A table a query reads, as the query names it. */
type QuerySource = { readonly table: string; readonly schema?: string };

/** A copy of a filter condition. For a `TIME` column, ISO date-time
 * text becomes its UTC clock: a snapshot written before 1.13.0 holds a
 * `Date` there as that text. */
function copyCondition(v: unknown, time: boolean): unknown {
  if (typeof v === 'string') {
    return time && isDateText(v) ? readTimeOfDay(v) : v;
  }
  if (Array.isArray(v)) return v.map((item) => copyCondition(item, time));
  if (typeof v !== 'object' || v === null || v instanceof Date) return v;
  return Object.fromEntries(
    Object.entries(v).map(([k, item]) => [k, copyCondition(item, time)]),
  );
}

function holdsDate(v: unknown): boolean {
  return v instanceof Date ||
    (typeof v === 'object' && v !== null && Object.values(v).some(holdsDate));
}

/**
 * A VIEW's stored SELECT with the date and time values of its `where`
 * converted by column type, the way `find` converts a filter's: the
 * view then returns the rows `find` returns for the same condition,
 * whether a value arrives as a `Date` or as the ISO text a snapshot
 * file holds for one. Columns of the base table, of a joined table
 * (`'@Alias.@col'`) and of an `$exists` / `$nexists` table are
 * resolved against `entities`; a condition on any other key is left
 * as written.
 *
 * @param query - The view's SELECT. It is not modified.
 * @param entities - Every entity of the snapshot the view belongs to.
 * @returns The converted query, and whether a date column is compared
 *   with a `Date` ({@linkcode SnapEntity.typedDates}).
 * @throws {@link NormQueryError} `INVALID_DATE` when a string on a
 *   date column is not ISO 8601 or names a day or time no calendar
 *   has, as `find` throws for the same filter.
 */
export function viewQuery(
  query: unknown,
  entities: Record<string, SnapEntity>,
): { query: unknown; typedDates: boolean } {
  const q = query as QuerySource & {
    joins?: Record<string, QuerySource>;
    where?: unknown;
  };
  if (q?.where === undefined) return { query, typedDates: false };
  let typedDates = false;
  const walk = (
    node: unknown,
    base: QuerySource,
    joins: Record<string, QuerySource>,
  ): unknown => {
    if (Array.isArray(node)) return node.map((n) => walk(n, base, joins));
    if (typeof node !== 'object' || node === null || node instanceof Date) {
      return node;
    }
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === '$exists' || key === '$nexists') {
        const sub = value as QuerySource & { where?: unknown };
        out[key] = sub?.where === undefined
          ? value
          : { ...sub, where: walk(sub.where, sub, {}) };
        continue;
      }
      if (!key.startsWith('@')) {
        out[key] = walk(value, base, joins);
        continue;
      }
      const path = key.slice(1).split('.@');
      const source = path.length === 1
        ? base
        : path.length === 2 && Object.hasOwn(joins, path[0]!)
        ? joins[path[0]!]
        : undefined;
      const [entityKey, entity] = Object.entries(entities).find(([, e]) =>
        e.name === source?.table && e.dbSchema === source.schema
      ) ?? [];
      const col = path.at(-1)!;
      const plainType = entity?.columns[col]?.type;
      if (
        entityKey === undefined || plainType === undefined ||
        !(plainType === 'TIME' || DATE_TYPES.has(plainType))
      ) {
        out[key] = value;
        continue;
      }
      out[key] = temporalCondition(
        { entityKey, col, plainType },
        copyCondition(value, plainType === 'TIME'),
      );
      typedDates ||= plainType !== 'TIME' && holdsDate(out[key]);
    }
    return out;
  };
  return {
    query: { ...q, where: walk(q.where, q, q.joins ?? {}) },
    typedDates,
  };
}

/**
 * Build the physical snapshot of a compiled registry. QUERY entities
 * are client-side and skipped; FK entity keys resolve to the target's
 * PHYSICAL table (+dbSchema) so the file is DDL-ready. A VIEW's
 * `where` is stored as {@linkcode viewQuery} converts it.
 *
 * @throws {@link NormQueryError} `INVALID_DATE` from
 *   {@linkcode viewQuery}.
 */
export function buildSnapshot(
  registry: Record<string, AnyDefinition>,
  generatedAt: string,
): MigrationSnapshot {
  const entities: Record<string, SnapEntity> = {};
  for (const key of sortedKeys(registry)) {
    const def = registry[key]!;
    if (def.type === 'QUERY') continue;

    const columns: Record<string, SnapColumn> = {};
    for (const col of sortedKeys(def.columns)) {
      const spec = def.columns[col] as ColumnSpec;
      if (spec.masked !== undefined) continue; // virtual — no DDL
      columns[col] = snapColumn(spec);
    }

    if (def.type === 'VIEW') {
      entities[key] = {
        kind: 'VIEW',
        name: def.name,
        ...(def.dbSchema !== undefined ? { dbSchema: def.dbSchema } : {}),
        columns,
        query: (def as { query: unknown }).query,
        ...((def as { materialized?: true }).materialized === true
          ? { materialized: true }
          : {}),
      };
      continue;
    }

    const t = def as AnyDefinition & {
      dbSchema?: string;
      primaryKeys: readonly string[];
      foreignKeys?: Record<
        string,
        { model: string; on: Record<string, string> }
      >;
      indexes?: Record<string, readonly string[]>;
      uniques?: Record<string, readonly string[]>;
      renamedFrom?: string;
      auditOf?: string;
    };

    let foreignKeys: Record<string, SnapForeignKey> | undefined;
    if (t.foreignKeys !== undefined) {
      foreignKeys = {};
      for (const alias of sortedKeys(t.foreignKeys)) {
        const fk = t.foreignKeys[alias]!;
        const target = registry[fk.model];
        if (target === undefined) continue; // use() validated already
        foreignKeys[alias] = {
          columns: Object.keys(fk.on),
          references: {
            table: target.name,
            ...((target as { dbSchema?: string }).dbSchema !== undefined
              ? { schema: (target as { dbSchema?: string }).dbSchema }
              : {}),
            columns: Object.values(fk.on),
          },
          ...((fk as { onDelete?: string }).onDelete !== undefined
            ? { onDelete: (fk as { onDelete?: string }).onDelete }
            : {}),
          ...((fk as { onUpdate?: string }).onUpdate !== undefined
            ? { onUpdate: (fk as { onUpdate?: string }).onUpdate }
            : {}),
        };
      }
    }

    entities[key] = {
      kind: 'TABLE',
      name: t.name,
      ...(t.dbSchema !== undefined ? { dbSchema: t.dbSchema } : {}),
      columns,
      primaryKeys: [...t.primaryKeys],
      ...(foreignKeys !== undefined ? { foreignKeys } : {}),
      ...(t.indexes !== undefined
        ? {
          indexes: Object.fromEntries(
            sortedKeys(t.indexes).map((n) => [n, [...t.indexes![n]!]]),
          ),
        }
        : {}),
      ...(t.uniques !== undefined
        ? {
          uniques: Object.fromEntries(
            sortedKeys(t.uniques).map((n) => [n, [...t.uniques![n]!]]),
          ),
        }
        : {}),
      ...(t.renamedFrom !== undefined ? { renamedFrom: t.renamedFrom } : {}),
      ...(t.auditOf !== undefined ? { auditOf: t.auditOf } : {}),
    };
  }

  // A view's condition is converted once every entity's columns are
  // known: its base table may sort after it.
  for (const [key, e] of Object.entries(entities)) {
    if (e.kind !== 'VIEW') continue;
    const { query, typedDates } = viewQuery(e.query, entities);
    entities[key] = {
      ...e,
      query,
      ...(typedDates ? { typedDates: true as const } : {}),
    };
  }

  return {
    format: 1,
    generatedAt,
    hash: snapshotHash(entities),
    entities,
  };
}

// ─── Hashing (64-bit FNV-1a over canonical JSON, hints excluded) ─────

/** Strip `renamedFrom` hints (any depth-2 position they occur at). */
function stripHints(e: SnapEntity): unknown {
  const { renamedFrom: _r, ...rest } = e;
  const cols: Record<string, unknown> = {};
  for (const [k, c] of Object.entries(e.columns)) {
    const { renamedFrom: _cr, ...cRest } = c;
    cols[k] = cRest;
  }
  return { ...rest, columns: cols };
}

/** Canonical (key-sorted) JSON of a value. A `Date` is its ISO text,
 * as in the snapshot file. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (typeof v === 'object' && v !== null && !(v instanceof Date)) {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return `{${
      keys.map((k) =>
        `${JSON.stringify(k)}:${
          canonicalJson((v as Record<string, unknown>)[k])
        }`
      ).join(',')
    }}`;
  }
  return JSON.stringify(v) ?? 'null';
}

/** 64-bit FNV-1a, 16-char hex — change detection, not cryptography. */
export function fnv1a64(s: string): string {
  let h = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * prime) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, '0');
}

/** Rollup hash over hint-stripped entities. */
export function snapshotHash(
  entities: Record<string, SnapEntity>,
): string {
  const canonical: Record<string, unknown> = {};
  for (const k of Object.keys(entities).sort()) {
    canonical[k] = stripHints(entities[k]!);
  }
  return fnv1a64(canonicalJson(canonical));
}
