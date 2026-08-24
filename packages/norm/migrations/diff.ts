/**
 * @module
 *
 * `diffSnapshots` — pure snapshot-to-DDL diff. No I/O, no dialect
 * knowledge (the Migrator applies dialect capability checks on the
 * result).
 *
 * NEVER-SILENT rules: drops suppressed by `allowDrop: false` are
 * RETURNED in `blockedDrops`; changes the subsystem cannot express
 * yet (encrypt/digest flips → crypto rebuild, primary-key changes)
 * THROW rather than skip.
 *
 * Renames are hint-driven only (`renamedFrom`) — no heuristics. A
 * pure registry RE-KEY (same physical table under a new entity key)
 * is matched by physical identity and costs zero DDL.
 *
 * @since 1.0.0
 */

import type { Query } from '@tundralibs/oql/types';
import type { DdlQuery } from '../executor.ts';
import type { MigrationAction, RebuildTable } from './rebuild.ts';
import { NormMigrationError } from '../errors/mod.ts';
import type {
  MigrationSnapshot,
  SnapColumn,
  SnapEntity,
  SnapForeignKey,
} from './snapshot.ts';

/** Diff output: ordered actions (DDL + rebuilds) + loud bookkeeping. */
export type DiffResult = {
  readonly actions: MigrationAction[];
  /** `entity` / `entity.column` drops suppressed by allowDrop:false. */
  readonly blockedDrops: string[];
  /** Apply-time hazards worth reading BEFORE applying (e.g. NOT NULL
   * column adds that fail on populated tables). */
  readonly warnings: string[];
};

/** Knobs for diffing two snapshots into migration actions. */
export type DiffOptions = {
  /** Emit DROP actions for removed tables/columns. Default false —
   * drops are surfaced as blocked, not run, unless opted in. */
  readonly allowDrop?: boolean;
  /** Dialect can ALTER column types/nullability and FK constraints in
   * place (executor capabilities). When false, such changes emit a
   * REBUILD_TABLE instead of ALTER pieces. Default true. */
  readonly inPlaceAlter?: boolean;
};

/** Physical identity of an entity ("schema.name" | "name"). */
function physId(e: SnapEntity): string {
  return e.dbSchema === undefined ? e.name : `${e.dbSchema}.${e.name}`;
}

/** OQL's per-type column definition (discriminated: DECIMAL carries
 * precision/scale, VARCHAR carries length, …). */
type OqlColumnDef = Query<'CREATE_TABLE'>['columns'][string];

/** THE one deliberate cast in this module: snapshot columns are
 * type-erased JSON (SnapColumn.type is `string`), so OQL's
 * discriminated per-type union cannot be re-proven statically without
 * a runtime switch over every SQL type. Shape validity is guaranteed
 * upstream — builders emit legal combinations by construction, and
 * hand-built snapshots fail the OQL asserts at ddl() time. */
function columnDef(c: SnapColumn): OqlColumnDef {
  return {
    type: c.type,
    ...(c.length !== undefined ? { length: c.length } : {}),
    ...(c.precision !== undefined ? { precision: c.precision } : {}),
    ...(c.scale !== undefined ? { scale: c.scale } : {}),
    nullable: c.nullable === true,
  } as unknown as OqlColumnDef;
}

/** Physical column facts (markers/hints excluded) for change checks. */
function physicalFacts(c: SnapColumn): string {
  return JSON.stringify(columnDef(c));
}

/** Crypto-relevant markers — a flip means a data-rewriting rebuild. */
function cryptoFacts(c: SnapColumn): string {
  return `${c.encrypt === true}|${c.hash === true}|${c.hashed ?? ''}`;
}

/** Regular index physical name. */
export function indexName(table: string, key: string): string {
  return `ix_${table}_${key}`;
}

/** Unique index physical name. */
export function uniqueIndexName(table: string, key: string): string {
  return `ux_${table}_${key}`;
}

/** FK constraint physical name. */
export function fkName(table: string, alias: string): string {
  return `fk_${table}_${alias}`;
}

/** Column pairing (same-name, then renamedFrom hints) + the flags
 * that decide whether a matched TABLE pair needs a REBUILD. Pure —
 * called from pass 0.5 (to keep FK-drops away from rebuilt tables)
 * and pass 4 (the real emission). */
function pairAndFlags(
  pre: SnapEntity,
  cur: SnapEntity,
  inPlaceAlter: boolean,
  currKey: string,
): {
  pairs: Map<string, string>;
  renameColumns: Record<string, string>;
  cryptoChanged: boolean;
  rebuild: boolean;
} {
  const renameColumns: Record<string, string> = {};
  const pairs = new Map<string, string>(); // currCol → prevCol
  for (const col of Object.keys(cur.columns)) {
    if (pre.columns[col] !== undefined) pairs.set(col, col);
  }
  for (const [col, c] of Object.entries(cur.columns)) {
    if (pairs.has(col) || c.renamedFrom === undefined) continue;
    if (
      pre.columns[c.renamedFrom] !== undefined &&
      cur.columns[c.renamedFrom] === undefined
    ) {
      pairs.set(col, c.renamedFrom);
      renameColumns[c.renamedFrom] = col;
    }
  }
  let cryptoChanged = false;
  let alterNeeded = false;
  for (const [col, prevCol] of pairs) {
    const c = cur.columns[col]!;
    const p = pre.columns[prevCol]!;
    if (cryptoFacts(c) !== cryptoFacts(p)) {
      if ((c.hashed ?? p.hashed) !== undefined && c.hashed !== p.hashed) {
        // One-way digests have NO plaintext to re-digest from.
        throw new NormMigrationError(
          `Column '${currKey}.${col}': digest algorithm changes cannot ` +
            `be migrated — digests are one-way, the plaintext is gone. ` +
            `Add a new column and backfill from source data instead.`,
          { subject: `${currKey}.${col}`, code: 'DIGEST_IMMUTABLE' },
        );
      }
      cryptoChanged = true;
    } else if (physicalFacts(c) !== physicalFacts(p)) {
      alterNeeded = true;
    }
  }
  const pkChanged = JSON.stringify([...(cur.primaryKeys ?? [])]) !==
    JSON.stringify([...(pre.primaryKeys ?? [])]);
  const fkChanged = JSON.stringify(cur.foreignKeys ?? {}) !==
    JSON.stringify(pre.foreignKeys ?? {});
  const rebuild = cryptoChanged || pkChanged ||
    (!inPlaceAlter && (alterNeeded || fkChanged));
  return { pairs, renameColumns, cryptoChanged, rebuild };
}

/**
 * Retire (never drop) a column an AUDIT replica's source removed:
 * synthesize a `_<col>_` column carrying `renamedFrom: col` — and
 * `nullable: true` when the original was `NOT NULL`, since the source
 * will never supply a value for it again — onto a COPY of `cur`'s
 * columns. The underscore-wrapped name survives a later re-add of a
 * column with the ORIGINAL name (a fresh mirror, unrelated to the
 * frozen history) — though not a SECOND retirement of the same name,
 * which would collide with the still-frozen column from the first.
 *
 * Deliberately reuses the EXISTING rename/alter/rebuild machinery
 * instead of a parallel code path: once the synthetic column carries
 * `renamedFrom`, `pairAndFlags`'s already-tested rename detection (a
 * `renamedFrom` hint pointing at a `pre`-only, `cur`-absent column)
 * picks it up automatically — including per-dialect REBUILD-vs-ALTER
 * for the nullable relax, and the resulting `ALTER_TABLE
 * .renameColumns` DDL.
 *
 * `warn` collects one message per retired column so the caller can
 * surface it — a column silently vanishing from its usual name is a
 * meaningful change even though nothing is destroyed.
 */
function retireAuditColumns(
  curr: MigrationSnapshot,
  prevEntities: Record<string, SnapEntity>,
  matched: ReadonlyMap<string, string>,
  warn: (message: string) => void,
): MigrationSnapshot {
  let entities: Record<string, SnapEntity> | undefined;
  for (const [currKey, prevKey] of matched) {
    const cur = curr.entities[currKey]!;
    if (cur.kind !== 'TABLE' || cur.auditOf === undefined) continue;
    const pre = prevEntities[prevKey]!;
    // Columns an explicit renamedFrom hint already claims pair normally
    // — only a column with NO home left in `cur` is a real retirement.
    const renameTargets = new Set<string>();
    for (const c of Object.values(cur.columns)) {
      if (c.renamedFrom !== undefined) renameTargets.add(c.renamedFrom);
    }
    let newColumns: Record<string, SnapColumn> | undefined;
    for (const col of Object.keys(pre.columns)) {
      if (cur.columns[col] !== undefined || renameTargets.has(col)) continue;
      const frozen = `_${col}_`;
      if (
        cur.columns[frozen] !== undefined || pre.columns[frozen] !== undefined
      ) {
        // Name in use (a prior retirement, or a genuine column already
        // called that) — fall through to an ordinary drop rather than
        // collide; see the doc comment's one-retirement-per-name limit.
        continue;
      }
      const p = pre.columns[col]!;
      (newColumns ??= { ...cur.columns })[frozen] = {
        ...p,
        ...(p.nullable === true ? {} : { nullable: true }),
        renamedFrom: col,
      };
      warn(
        `${currKey}.${col}: removed from the source — retired (not ` +
          `dropped) in the audit replica as '${frozen}' so its history ` +
          `survives; it will read as null on every version from here on.`,
      );
    }
    if (newColumns !== undefined) {
      (entities ??= { ...curr.entities })[currKey] = {
        ...cur,
        columns: newColumns,
      };
    }
  }
  return entities === undefined ? curr : { ...curr, entities };
}

/** Topo-order TABLE entity keys parents-first via FK references
 * (cycles fall back to insertion order). */
function orderForCreate(
  keys: string[],
  entities: Record<string, SnapEntity>,
): string[] {
  const byPhys = new Map<string, string>();
  for (const k of keys) byPhys.set(physId(entities[k]!), k);
  const visited = new Set<string>();
  const out: string[] = [];
  const visit = (k: string, path: Set<string>) => {
    if (visited.has(k) || path.has(k)) return;
    path.add(k);
    const e = entities[k]!;
    for (const fk of Object.values(e.foreignKeys ?? {})) {
      const ref = fk.references.schema === undefined
        ? fk.references.table
        : `${fk.references.schema}.${fk.references.table}`;
      const parent = byPhys.get(ref);
      if (parent !== undefined && parent !== k) visit(parent, path);
    }
    path.delete(k);
    visited.add(k);
    out.push(k);
  };
  for (const k of keys) visit(k, new Set());
  return out;
}

function sameFk(a: SnapForeignKey, b: SnapForeignKey): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** All index emissions (regular + unique) for one table. */
export function indexActions(e: SnapEntity): DdlQuery[] {
  const out: DdlQuery[] = [];
  const base = {
    table: e.name,
    ...(e.dbSchema !== undefined ? { schema: e.dbSchema } : {}),
  };
  for (const [key, cols] of Object.entries(e.indexes ?? {})) {
    out.push(
      {
        type: 'CREATE_INDEX',
        index: indexName(e.name, key),
        ...base,
        columns: cols.map((c): `@${string}` => `@${c}`),
        ifNotExists: true,
      },
    );
  }
  for (const [key, cols] of Object.entries(e.uniques ?? {})) {
    out.push(
      {
        type: 'CREATE_INDEX',
        index: uniqueIndexName(e.name, key),
        ...base,
        columns: cols.map((c): `@${string}` => `@${c}`),
        unique: true,
        ifNotExists: true,
      },
    );
  }
  return out;
}

type OqlFkConstraint = NonNullable<
  Query<'CREATE_TABLE'>['foreignKeys']
>[string];

export function createTableAction(
  e: SnapEntity,
  excludeFkAliases?: ReadonlySet<string>,
): DdlQuery {
  const columns: Record<string, OqlColumnDef> = {};
  for (const [name, c] of Object.entries(e.columns)) {
    columns[name] = columnDef(c);
  }
  const foreignKeys: Record<string, OqlFkConstraint> = {};
  for (const [alias, fk] of Object.entries(e.foreignKeys ?? {})) {
    // Deferred FKs (cycle-breakers, non-PK-unique targets) are emitted as a
    // post-create ALTER instead of inline — see `diffSnapshots` pass 3.
    if (excludeFkAliases?.has(alias)) continue;
    foreignKeys[fkName(e.name, alias)] = {
      columns: [...fk.columns],
      references: {
        table: fk.references.table,
        ...(fk.references.schema !== undefined
          ? { schema: fk.references.schema }
          : {}),
        columns: [...fk.references.columns],
      },
      ...(fk.onDelete !== undefined
        ? { onDelete: fk.onDelete as OqlFkConstraint['onDelete'] }
        : {}),
      ...(fk.onUpdate !== undefined
        ? { onUpdate: fk.onUpdate as OqlFkConstraint['onDelete'] }
        : {}),
    };
  }
  return {
    type: 'CREATE_TABLE',
    table: e.name,
    ...(e.dbSchema !== undefined ? { schema: e.dbSchema } : {}),
    columns,
    ...(e.primaryKeys !== undefined && e.primaryKeys.length > 0
      ? { primaryKey: [...e.primaryKeys] }
      : {}),
    ...(Object.keys(foreignKeys).length > 0 ? { foreignKeys } : {}),
    ifNotExists: true,
  };
}

function createViewAction(e: SnapEntity): DdlQuery {
  return {
    type: 'CREATE_VIEW',
    view: e.name,
    ...(e.dbSchema !== undefined ? { schema: e.dbSchema } : {}),
    query: e.query as Query<'SELECT'>,
    ...(e.materialized === true ? { materialized: true } : {}),
    ifNotExists: true,
  };
}

/**
 * Diff two snapshots into ordered DDL. `prev = null` → everything
 * creates.
 */
export function diffSnapshots(
  prev: MigrationSnapshot | null,
  curr: MigrationSnapshot,
  opts: DiffOptions = {},
): DiffResult {
  const allowDrop = opts.allowDrop === true;
  const inPlaceAlter = opts.inPlaceAlter !== false;
  const actions: MigrationAction[] = [];
  const blockedDrops: string[] = [];
  const warnings: string[] = [];

  const prevEntities: Record<string, SnapEntity> = {
    ...(prev?.entities ?? {}),
  };

  // ── Pass 0: matching — key, physical identity, renamedFrom ────────
  // matched: currKey → prevKey (post-rename working pairs).
  const matched = new Map<string, string>();
  const renames: Array<{ currKey: string; from: SnapEntity }> = [];
  const prevTaken = new Set<string>();

  for (const [key, cur] of Object.entries(curr.entities)) {
    const p = prevEntities[key];
    if (p !== undefined && p.kind === cur.kind) {
      matched.set(key, key);
      prevTaken.add(key);
      // The entity KEY is identity — a physical-name change under a
      // stable key IS a rename, no hint required.
      if (cur.kind === 'TABLE' && physId(p) !== physId(cur)) {
        renames.push({ currKey: key, from: p });
      }
    }
  }
  // Hint-driven renames take precedence over physical-identity
  // re-keys: a hint names its OLD table explicitly, and letting a
  // coincidental physId match steal the pair would misbind the data.
  for (const [key, cur] of Object.entries(curr.entities)) {
    if (matched.has(key) || cur.renamedFrom === undefined) continue;
    const hinted = cur.renamedFrom.includes('.')
      ? cur.renamedFrom
      : cur.dbSchema === undefined
      ? cur.renamedFrom
      : `${cur.dbSchema}.${cur.renamedFrom}`;
    for (const [pk, pe] of Object.entries(prevEntities)) {
      if (prevTaken.has(pk) || pe.kind !== cur.kind) continue;
      if (physId(pe) === hinted) {
        matched.set(key, pk);
        prevTaken.add(pk);
        renames.push({ currKey: key, from: pe });
        break;
      }
    }
  }
  // Physical-identity re-keys (zero DDL).
  for (const [key, cur] of Object.entries(curr.entities)) {
    if (matched.has(key)) continue;
    for (const [pk, pe] of Object.entries(prevEntities)) {
      if (prevTaken.has(pk) || pe.kind !== cur.kind) continue;
      if (physId(pe) === physId(cur)) {
        matched.set(key, pk);
        prevTaken.add(pk);
        break;
      }
    }
  }

  // Audit replicas never lose a column the source removes — retire it
  // (rename to `_<col>_`, relax to nullable if it was NOT NULL) instead
  // of dropping it, BEFORE anything below reads column shape. Must run
  // after entity matching (needs `matched`/`prevEntities`) and before
  // every column-level pass.
  curr = retireAuditColumns(
    curr,
    prevEntities,
    matched,
    (m) => warnings.push(m),
  );

  const newKeys = Object.keys(curr.entities).filter((k) => !matched.has(k));
  const droppedKeys = Object.keys(prevEntities).filter(
    (k) => !prevTaken.has(k),
  );

  // Changed views are detected up front: they must DROP before table
  // alters (Postgres/Maria pin view definitions to referenced
  // columns) and recreate after everything else.
  const changedViews: string[] = [];
  for (const [currKey, prevKey] of matched) {
    const cur = curr.entities[currKey]!;
    if (cur.kind !== 'VIEW') continue;
    const pre = prevEntities[prevKey]!;
    if (
      JSON.stringify(cur.query) !== JSON.stringify(pre.query) ||
      JSON.stringify(Object.keys(cur.columns).sort()) !==
        JSON.stringify(Object.keys(pre.columns).sort())
    ) {
      changedViews.push(currKey);
    }
  }

  // pairAndFlags is O(columns) and gives the SAME result across passes
  // 0.5 / 2 / 4 for a matched TABLE pair (a rename's `from` IS
  // prevEntities[prevKey]) — compute it ONCE per matched table here.
  const tableAnalyses = new Map<string, ReturnType<typeof pairAndFlags>>();
  for (const [currKey, prevKey] of matched) {
    const cur = curr.entities[currKey]!;
    if (cur.kind !== 'TABLE') continue;
    tableAnalyses.set(
      currKey,
      pairAndFlags(prevEntities[prevKey]!, cur, inPlaceAlter, currKey),
    );
  }

  // ── Pass 0.5: FK constraint DROPS come first — a surviving child's
  //    constraint must release a parent before DROP TABLE, and a
  //    replaced constraint must vacate its name before re-ADD. Uses
  //    PRE-rename table names (renames run later). ────────────────────
  for (const [currKey, prevKey] of matched) {
    const cur = curr.entities[currKey]!;
    if (cur.kind !== 'TABLE') continue;
    const pre = prevEntities[prevKey]!;
    // Rebuilt tables recreate their constraints wholesale — an early
    // FK-drop ALTER would itself be unsupported on the very dialects
    // that need the rebuild.
    if (tableAnalyses.get(currKey)!.rebuild) continue;
    const curFks = cur.foreignKeys ?? {};
    const preFks = pre.foreignKeys ?? {};
    const dropForeignKeys: string[] = [];
    for (const [alias, fk] of Object.entries(preFks)) {
      const now = curFks[alias];
      if (now === undefined || !sameFk(now, fk)) {
        dropForeignKeys.push(fkName(pre.name, alias));
      }
    }
    if (dropForeignKeys.length > 0) {
      actions.push(
        {
          type: 'ALTER_TABLE',
          table: pre.name,
          ...(pre.dbSchema !== undefined ? { schema: pre.dbSchema } : {}),
          dropForeignKeys,
        },
      );
    }
  }

  // ── Pass 1: drops (views first; tables reverse-topo) ──────────────
  for (const k of droppedKeys) {
    const e = prevEntities[k]!;
    if (!allowDrop) {
      blockedDrops.push(k);
      continue;
    }
    if (e.kind === 'VIEW') {
      actions.push(
        {
          type: 'DROP_VIEW',
          view: e.name,
          ...(e.dbSchema !== undefined ? { schema: e.dbSchema } : {}),
          ...(e.materialized === true ? { materialized: true } : {}),
          ifExists: true,
        },
      );
    }
  }
  for (const k of changedViews) {
    const pre = prevEntities[matched.get(k)!]!;
    actions.push(
      {
        type: 'DROP_VIEW',
        view: pre.name,
        ...(pre.dbSchema !== undefined ? { schema: pre.dbSchema } : {}),
        ...(pre.materialized === true ? { materialized: true } : {}),
        ifExists: true,
      },
    );
  }
  const droppedTables = droppedKeys.filter(
    (k) => prevEntities[k]!.kind === 'TABLE',
  );
  if (allowDrop && droppedTables.length > 0) {
    const ordered = orderForCreate(droppedTables, prevEntities);
    for (const k of ordered.reverse()) {
      const e = prevEntities[k]!;
      actions.push(
        {
          type: 'DROP_TABLE',
          table: e.name,
          ...(e.dbSchema !== undefined ? { schema: e.dbSchema } : {}),
          ifExists: true,
        },
      );
    }
  }

  // ── Pass 2: table renames (before alters reference new names) ─────
  for (const { currKey, from } of renames) {
    const cur = curr.entities[currKey]!;
    if (cur.kind === 'VIEW') {
      throw new NormMigrationError(
        `View '${currKey}': renamedFrom is not supported on views — drop ` +
          `and recreate instead (no data at stake).`,
        { subject: currKey, code: 'UNSUPPORTED_RENAME' },
      );
    }
    // A rebuild subsumes the rename: it copies OLD table → NEW table
    // and drops the old, so pre-renaming here would strand pass 4's
    // `from.name` on a table that no longer exists.
    if (tableAnalyses.get(currKey)!.rebuild) continue;
    actions.push(
      {
        type: 'ALTER_TABLE',
        table: from.name,
        ...(from.dbSchema !== undefined ? { schema: from.dbSchema } : {}),
        renameTo: cur.name,
      },
    );
  }

  // ── Pass 3: creates (namespaces → tables topo → indexes → deferred
  //    FKs). New `dbSchema` namespaces are provisioned first so qualified
  //    CREATEs resolve. FKs a fresh table cannot satisfy inline are
  //    stripped from the CREATE and re-added by ALTER once every
  //    dependency exists: a cycle back-edge (the referenced table is
  //    created later) or a self-referential non-PK target (its backing
  //    UNIQUE index is created after the table). ──────────────────────
  const prevSchemas = new Set<string>();
  for (const e of Object.values(prevEntities)) {
    if (e.dbSchema !== undefined) prevSchemas.add(e.dbSchema);
  }
  const newSchemas = new Set<string>();
  for (const k of newKeys) {
    const s = curr.entities[k]!.dbSchema;
    if (s !== undefined && !prevSchemas.has(s)) newSchemas.add(s);
  }
  for (const schema of [...newSchemas].sort()) {
    actions.push({ type: 'CREATE_SCHEMA', schema });
  }

  const newTables = newKeys.filter((k) => curr.entities[k]!.kind === 'TABLE');
  const createOrder = orderForCreate(newTables, curr.entities);
  const orderIndex = new Map<string, number>();
  createOrder.forEach((k, i) => orderIndex.set(k, i));
  const currByPhys = new Map<string, string>();
  for (const k of Object.keys(curr.entities)) {
    currByPhys.set(physId(curr.entities[k]!), k);
  }

  const deferredFkActions: MigrationAction[] = [];
  for (const k of createOrder) {
    const e = curr.entities[k]!;
    const deferred = new Set<string>();
    const addForeignKeys: Record<string, OqlFkConstraint> = {};
    for (const [alias, fk] of Object.entries(e.foreignKeys ?? {})) {
      const refPhys = fk.references.schema === undefined
        ? fk.references.table
        : `${fk.references.schema}.${fk.references.table}`;
      const refKey = currByPhys.get(refPhys);
      const refEntity = refKey !== undefined
        ? curr.entities[refKey]
        : undefined;
      // A non-PK target is backed by a UNIQUE index that `indexActions`
      // emits AFTER the referenced table's CREATE.
      const refPk = JSON.stringify([...(refEntity?.primaryKeys ?? [])].sort());
      const nonPkTarget = refEntity !== undefined &&
        JSON.stringify([...fk.references.columns].sort()) !== refPk;
      // F3: the referenced table is itself new and created later (cycle).
      const refIsNewLater = refKey !== undefined &&
        orderIndex.has(refKey) &&
        orderIndex.get(refKey)! > orderIndex.get(k)!;
      // F5: a self-referential FK to a non-PK (unique) column — the index
      // does not exist yet at this table's own CREATE.
      const selfNonPk = refKey === k && nonPkTarget;
      if (refIsNewLater || selfNonPk) {
        deferred.add(alias);
        addForeignKeys[fkName(e.name, alias)] = {
          columns: [...fk.columns],
          references: { ...fk.references, columns: [...fk.references.columns] },
          ...(fk.onDelete !== undefined
            ? { onDelete: fk.onDelete as OqlFkConstraint['onDelete'] }
            : {}),
          ...(fk.onUpdate !== undefined
            ? { onUpdate: fk.onUpdate as OqlFkConstraint['onDelete'] }
            : {}),
        };
      }
    }
    actions.push(createTableAction(e, deferred));
    actions.push(...indexActions(e));
    if (Object.keys(addForeignKeys).length > 0) {
      deferredFkActions.push({
        type: 'ALTER_TABLE',
        table: e.name,
        ...(e.dbSchema !== undefined ? { schema: e.dbSchema } : {}),
        addForeignKeys,
      });
    }
  }
  // All deferred FKs land after every table + its indexes exist.
  actions.push(...deferredFkActions);

  // ── Pass 4: alters on matched TABLE pairs ─────────────────────────
  for (const [currKey, prevKey] of matched) {
    const cur = curr.entities[currKey]!;
    const pre = prevEntities[prevKey]!;
    if (cur.kind === 'VIEW') continue;

    const analysis = tableAnalyses.get(currKey)!;
    const { pairs, renameColumns } = analysis;
    const prevMatched = new Set(pairs.values());
    const addColumns: Record<string, OqlColumnDef> = {};
    for (const [col, c] of Object.entries(cur.columns)) {
      if (pairs.has(col)) continue;
      addColumns[col] = columnDef(c);
      if (c.nullable !== true) {
        // Norm never emits DDL defaults (system-generated at write
        // time), so the database itself refuses this on populated
        // tables. The diff cannot know the row count — warn, always.
        warnings.push(
          `${currKey}.${col}: adding a NOT NULL column will fail if ` +
            `'${cur.name}' has rows — make it nullable() and backfill, ` +
            `then tighten (nullability alters need PG/Maria).`,
        );
      }
    }
    const dropColumns: string[] = [];
    for (const col of Object.keys(pre.columns)) {
      if (prevMatched.has(col)) continue;
      if (allowDrop) dropColumns.push(col);
      else blockedDrops.push(`${currKey}.${col}`);
    }

    const alterColumns: Record<string, OqlColumnDef> = {};
    for (const [col, prevCol] of pairs) {
      const c = cur.columns[col]!;
      const p = pre.columns[prevCol]!;
      if (cryptoFacts(c) !== cryptoFacts(p)) continue; // rebuild transform
      if (physicalFacts(c) !== physicalFacts(p)) {
        alterColumns[col] = columnDef(c);
      }
    }

    // FK ADDs only — drops were emitted in pass 0.5, before table
    // drops and renames.
    const addForeignKeys: Record<string, OqlFkConstraint> = {};
    const curFks = cur.foreignKeys ?? {};
    const preFks = pre.foreignKeys ?? {};
    for (const [alias, fk] of Object.entries(curFks)) {
      const old = preFks[alias];
      if (old === undefined || !sameFk(old, fk)) {
        addForeignKeys[fkName(cur.name, alias)] = {
          columns: [...fk.columns],
          references: { ...fk.references, columns: [...fk.references.columns] },
          ...(fk.onDelete !== undefined
            ? { onDelete: fk.onDelete as OqlFkConstraint['onDelete'] }
            : {}),
          ...(fk.onUpdate !== undefined
            ? { onUpdate: fk.onUpdate as OqlFkConstraint['onDelete'] }
            : {}),
        };
      }
    }

    // Index churn brackets the ALTER: drops FIRST (SQLite refuses to
    // drop a column an index still references), creates after.
    const idxDrops: DdlQuery[] = [];
    const idxCreates: DdlQuery[] = [];

    const alter: {
      type: 'ALTER_TABLE';
      table: string;
      schema?: string;
      renameColumns?: Record<string, string>;
      addColumns?: Record<string, OqlColumnDef>;
      dropColumns?: string[];
      alterColumns?: Record<string, OqlColumnDef>;
      addForeignKeys?: Record<string, OqlFkConstraint>;
    } = {
      type: 'ALTER_TABLE',
      table: cur.name,
      ...(cur.dbSchema !== undefined ? { schema: cur.dbSchema } : {}),
    };
    if (Object.keys(renameColumns).length > 0) {
      alter.renameColumns = renameColumns;
    }
    if (Object.keys(addColumns).length > 0) alter.addColumns = addColumns;
    if (dropColumns.length > 0) alter.dropColumns = dropColumns;
    if (Object.keys(alterColumns).length > 0) {
      alter.alterColumns = alterColumns;
    }
    if (Object.keys(addForeignKeys).length > 0) {
      alter.addForeignKeys = addForeignKeys;
    }

    // Index diffs (regular + unique — all plain indexes physically).
    const emitIdx = (
      kind: 'indexes' | 'uniques',
      namer: (t: string, k: string) => string,
      unique: boolean,
    ) => {
      const curIdx = cur[kind] ?? {};
      const preIdx = pre[kind] ?? {};
      // Index physical names embed the table name; a table rename
      // strands them (indexes keep their names through RENAME TO), so
      // force drop-under-old-name + create-under-new-name.
      const tableRenamed = pre.name !== cur.name;
      for (const [key, cols] of Object.entries(curIdx)) {
        const old = preIdx[key];
        const same = !tableRenamed && old !== undefined &&
          JSON.stringify([...old]) === JSON.stringify([...cols]);
        if (same) continue;
        if (old !== undefined) {
          idxDrops.push(
            {
              type: 'DROP_INDEX',
              index: namer(pre.name, key),
              table: cur.name,
              ...(cur.dbSchema !== undefined ? { schema: cur.dbSchema } : {}),
              ifExists: true,
            },
          );
        }
        idxCreates.push(
          {
            type: 'CREATE_INDEX',
            index: namer(cur.name, key),
            table: cur.name,
            ...(cur.dbSchema !== undefined ? { schema: cur.dbSchema } : {}),
            columns: cols.map((c): `@${string}` => `@${c}`),
            ...(unique ? { unique: true } : {}),
            ifNotExists: true,
          },
        );
      }
      for (const key of Object.keys(preIdx)) {
        if (curIdx[key] !== undefined) continue;
        idxDrops.push(
          {
            type: 'DROP_INDEX',
            index: namer(pre.name, key),
            table: cur.name,
            ...(cur.dbSchema !== undefined ? { schema: cur.dbSchema } : {}),
            ifExists: true,
          },
        );
      }
    };
    emitIdx('indexes', indexName, false);
    emitIdx('uniques', uniqueIndexName, true);

    // A rebuild subsumes EVERY per-table change: crypto flips and pk
    // changes force one on all dialects; type/nullability/FK changes
    // force one when the dialect cannot alter in place (SQLite).
    if (analysis.rebuild) {
      const rebuild: RebuildTable = {
        kind: 'REBUILD_TABLE',
        entityKey: currKey,
        from: pre,
        to: cur,
        pairs: [...pairs.entries()],
        transform: analysis.cryptoChanged,
      };
      actions.push(rebuild);
      continue;
    }

    actions.push(...idxDrops);
    if (Object.keys(alter).length > (cur.dbSchema !== undefined ? 3 : 2)) {
      actions.push(alter);
    }
    actions.push(...idxCreates);
  }

  // ── Pass 5: views — new + changed recreate (last) ─────────────────
  for (const k of newKeys) {
    const e = curr.entities[k]!;
    if (e.kind === 'VIEW') actions.push(createViewAction(e));
  }
  for (const k of changedViews) {
    actions.push(createViewAction(curr.entities[k]!));
  }

  return { actions, blockedDrops, warnings };
}
