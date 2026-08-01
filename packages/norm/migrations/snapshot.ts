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
  /** VIEW body — the stored OQL SELECT, verbatim. */
  readonly query?: unknown;
  /** VIEW: CREATE MATERIALIZED VIEW (DDL-relevant — hashed). */
  readonly materialized?: true;
  /** MIGRATION HINT — excluded from hashing. */
  readonly renamedFrom?: string;
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

/**
 * Build the physical snapshot of a compiled registry. QUERY entities
 * are client-side and skipped; FK entity keys resolve to the target's
 * PHYSICAL table (+dbSchema) so the file is DDL-ready.
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

/** Canonical (key-sorted) JSON of a value. */
function canonicalJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
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
