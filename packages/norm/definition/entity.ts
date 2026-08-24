/**
 * @module
 *
 * `Entity(name, columns, options)` — the single definition
 * constructor. The options bag carries the kind discriminator:
 *
 * ```ts ignore
 * Entity('users',  {...cols}, { pk: ['id'], fk: {...}, index: {...} })  // TABLE (default kind)
 * Entity('active', {...cols}, { type: 'VIEW',  query: select })        // VIEW
 * Entity('stats',  {...cols}, { type: 'QUERY', query: select })        // QUERY
 * ```
 *
 * Kind semantics:
 * - **TABLE** — physical, writable, DDL-emitting. `pk` is required
 *   (composite keys just list several columns); `fk` aliases drive
 *   joins + reverse relations; `index` emits DDL indexes.
 * - **VIEW** — read-only, DB-side (`CREATE VIEW … AS query`). CAN be
 *   joined against and CAN be the base of further stored queries.
 * - **QUERY** — read-only, client-side stored SELECT (no DDL).
 *   TERMINAL: cannot be joined and cannot be built upon by other
 *   views/queries (composition rules enforced at `Schema()`/`use()`).
 *
 * Foreign keys reference the target's ENTITY KEY — the stable name it
 * is exposed under in the schema registry (`fk: { Author: { model:
 * 'Users', on: { authorId: 'id' } } }`), NOT its table name. Renaming
 * the physical table or moving it to another database schema is an
 * ALTER; linkage definitions never change. Keys resolve — with named
 * errors — when schemas compose in `use()`. No model imports, no
 * import cycles, and definitions serialize cleanly.
 *
 * Write scoping (the clearremit request-schema pattern): `insert:`
 * and `update:` pick-lists restrict which columns a CALLER may pass
 * per operation; `InsertOf`/`UpdateOf` and the generated Guardians
 * are limited to that scope. Norm-maintained behavior (hash siblings,
 * `defaultOnUpdate` auto-touch) is unaffected — scope governs the
 * payload surface, not norm itself.
 *
 * Row-level hooks (whole-row, complementing the per-column
 * transforms): TABLEs take `hooks.beforeInsert` / `hooks.beforeUpdate`
 * / `hooks.afterRead`; read-only kinds take `afterRead` only. Hook
 * payloads are typed from the column builders. Like column
 * transforms, hooks are runtime-only callbacks — they drop out of the
 * JSON export.
 *
 * The result is PLAIN DATA (builders unwrap to their specs) so
 * snapshots/migrations can hash and diff it — the TYPE carries the
 * builders' phantom info for `RowOf` / `InsertOf` / `PrimaryKeyOf`.
 *
 * @since 1.0.0
 */

import type { Query } from '@tundralibs/oql/types';
import { assertDefinition } from '../asserts/definition.ts';
import { ulid } from '../result.ts';
import {
  type AnyColumnBuilder,
  Column,
  type ColumnBuilder,
  type ColumnSpec,
  hashSiblingOf,
} from './Column.ts';
import type { InsertOf, ReadRowOf, UpdateOf } from './infer.ts';

/** Referential actions norm emits — the cross-dialect-safe subset
 * (SET_DEFAULT excluded: MariaDB/InnoDB silently no-ops it). Applied
 * as ON DELETE / ON UPDATE on the physical FK constraint (TABLE only;
 * meaningless on a VIEW's logical join fk). */
export type ForeignKeyAction =
  | 'CASCADE'
  | 'RESTRICT'
  | 'NO_ACTION'
  | 'SET_NULL';

/**
 * Foreign-key declaration: named alias → target + column mapping.
 *
 * `model` is the target's ENTITY KEY — the stable name it is exposed
 * under in the schema registry (`Schema('Blog', { Users, ... })` →
 * `'Users'`) — NOT its database table name. The table can be renamed
 * and no FK declaration changes; that's just an ALTER. Keys resolve —
 * with named errors — when schemas compose in `use()`.
 */
export type ForeignKeyDef<
  C extends Record<string, AnyColumnBuilder>,
> = {
  /** Registry key of the target entity (e.g. `'Users'`). */
  readonly model: string;
  /** local column → target column. */
  readonly on: Partial<Record<keyof C & string, string>>;
  /**
   * Name of the derived REVERSE relation on the target (defaults to
   * this entity's registry key; auto-qualifies as
   * `<Key>_via_<alias>` when two FKs share source and target).
   */
  readonly reverseAs?: string;
  /**
   * Cardinality of the derived REVERSE relation — whether the target
   * sees one row (`hasOne` → object-or-null) or many (`hasMany` →
   * array). Defaults to derivation: `hasOne` when this FK's local
   * columns equal this entity's primary key, else `hasMany`.
   */
  readonly reverseCardinality?: 'hasOne' | 'hasMany';
  /**
   * EAGER-fetch this relation on THIS entity's default (projection-
   * less) reads: rows gain the alias as `object | null` — the
   * target's LOCAL default row, depth-1 (no transitive eager).
   * Explicit projections replace the default entirely; write
   * RETURNING stays flat (RETURNING cannot join).
   */
  readonly project?: true;
  /**
   * EAGER-fetch the derived REVERSE relation on the TARGET's default
   * reads. hasOne reverses only (explicit `reverseCardinality:
   * 'hasOne'` or derived FK-columns-equal-pk) — eager to-many lists
   * on every innocent read would be a footgun, so hasMany is
   * rejected.
   */
  readonly reverseProject?: true;
  /** ON DELETE referential action for the physical FK constraint.
   * Omit = the database default (RESTRICT). TABLE fks only. */
  readonly onDelete?: ForeignKeyAction;
  /** ON UPDATE referential action. Omit = database default. */
  readonly onUpdate?: ForeignKeyAction;
};

/** Column-spec map of a builder set, synthesized hash siblings included. */
type SpecMapOf<C extends Record<string, AnyColumnBuilder>> =
  & { readonly [K in keyof C]: C[K]['spec'] }
  & HashSiblingsOf<C>;

/**
 * Whole-row hooks on a TABLE. Pre-write is split by operation (insert
 * payloads and update payloads have different shapes); post-read sees
 * the full row. Returning a row replaces the payload; returning
 * nothing means the hook mutated in place.
 */
export type TableHooks<C extends Record<string, AnyColumnBuilder>> = {
  readonly beforeInsert?: (
    row: InsertOf<{ columns: SpecMapOf<C> }>,
  ) => InsertOf<{ columns: SpecMapOf<C> }> | void;
  readonly beforeUpdate?: (
    row: UpdateOf<{ columns: SpecMapOf<C> }>,
  ) => UpdateOf<{ columns: SpecMapOf<C> }> | void;
  readonly afterRead?: (
    row: ReadRowOf<{ columns: SpecMapOf<C> }>,
  ) => ReadRowOf<{ columns: SpecMapOf<C> }> | void;
  /** Fires BEFORE a DELETE executes, with the caller's filter
   * (undefined = the deliberate/omitted all-rows form). Deletes are
   * filter-based — no rows are fetched — so the hook sees the filter,
   * not rows; THROW to veto the delete (audit gates, soft-delete
   * enforcement). Runs for delete()/deleteByPK(), not truncate(). */
  readonly beforeDelete?: (
    filter: Record<string, unknown> | undefined,
  ) => void | Promise<void>;
};

/** Read-only kinds get the post-read hook only. */
export type ReadHooks<C extends Record<string, AnyColumnBuilder>> = {
  readonly afterRead?: (
    row: ReadRowOf<{ columns: { readonly [K in keyof C]: C[K]['spec'] } }>,
  ) =>
    | ReadRowOf<{ columns: { readonly [K in keyof C]: C[K]['spec'] } }>
    | void;
};

/**
 * Hooks as they ride on EMITTED definitions: parameter-erased carrier
 * functions. The precise row typing lives on the AUTHORING side
 * ({@linkcode TableHooks} / {@linkcode ReadHooks} in the Entity
 * options — that's where the callbacks are written and contextually
 * typed). The emitted slot must stay assignment-compatible across
 * concrete definitions (`(row: never) => unknown` accepts any hook),
 * or every entity with hooks would fail `extends AnyDefinition` on
 * function-parameter contravariance.
 */
export type EmittedHooks = {
  readonly beforeInsert?: (row: never) => unknown;
  readonly beforeUpdate?: (row: never) => unknown;
  readonly afterRead?: (row: never) => unknown;
  readonly beforeDelete?: (filter: never) => unknown;
};

/** Emitted read-only hook slot. */
export type EmittedReadHooks = {
  readonly afterRead?: (row: never) => unknown;
};

/** TABLE options — the default kind (`type` may be omitted). */
export type EntityTableOptions<
  C extends Record<string, AnyColumnBuilder>,
> = {
  readonly type?: 'TABLE';
  /** Primary key column tuple; composite keys list several. */
  readonly pk: readonly [keyof C & string, ...(keyof C & string)[]];
  /** Named FK aliases — drive joins + reverse relations. */
  readonly fk?: Record<string, ForeignKeyDef<C>>;
  /** Named indexes: name → column tuple (synthesized `<col>_hash`
   * siblings are indexable too). */
  readonly index?: Record<string, ReadonlyArray<_IndexableOf<C>>>;
  /** Named UNIQUE constraints: name → column tuple. Emitted as
   * UNIQUE INDEXES (diffable on every dialect) — e.g. the
   * sibling-digest uniqueness pattern:
   * `unique: { email: ['email_hash'] }`. */
  readonly unique?: Record<string, ReadonlyArray<_IndexableOf<C>>>;
  /** MIGRATION HINT: this table's PREVIOUS physical name (optionally
   * `'dbSchema.name'`-qualified). Consumed only by the migration
   * diff — inert everywhere else, excluded from snapshot hashes;
   * delete it once the rename has been applied everywhere. */
  readonly renamedFrom?: string;
  /**
   * INSERT scope — the pick-list of columns a caller may pass on
   * insert (the clearremit `CreateRequestSchema = base.pick({...})`
   * pattern). Unlisted columns become norm-owned for inserts;
   * `InsertOf` and the generated insert Guardian are limited to this
   * scope. Omit = every column is passable.
   */
  readonly insert?: ReadonlyArray<keyof C & string>;
  /**
   * UPDATE scope — the pick-list of columns a caller may update
   * (`UpdateRequestSchema = base.pick({...}).partial()`). Unlisted
   * columns become norm-owned for updates; `UpdateOf` and the
   * generated update Guardian are limited to this scope. Omit = every
   * column is updatable.
   */
  readonly update?: ReadonlyArray<keyof C & string>;
  /**
   * DATABASE schema / namespace (e.g. Postgres `public`). Named
   * `dbSchema` because in norm, "schema" means a named collection of
   * exposed entities (see `Schema()` / `use()`).
   */
  readonly dbSchema?: string;
  /** Documentation + DDL comment (`COMMENT ON TABLE …`). */
  readonly comment?: string;
  /** Whole-row hooks (see {@linkcode TableHooks}). */
  readonly hooks?: TableHooks<C>;
  /** Rows a limit-less `find()` fetches (default 10). `0` = UNBOUNDED
   * — every such read emits a `warning` event when it runs. */
  readonly defaultPageSize?: number;
  /**
   * Read-cache time-to-live in MINUTES. `0`/omitted (default) = no
   * caching. Only engages when the `Norm` was constructed with a
   * `cache` config; then non-transactional, non-joined `find` /
   * `findOne` / `count` / `getByPK` results are cached under this
   * entity's own namespace, keyed by the query, with a WINDOWED TTL
   * (each read resets the clock). Any write to this table prunes them.
   * Reads that join or aggregate are never cached — model a cached
   * multi-table read as a VIEW instead.
   */
  readonly cache?: number;
  /**
   * Make this an EFFECTIVE-DATED (temporal) table: norm keeps every
   * version of each logical record in this same table, injecting and
   * managing `EffectiveFrom` / `EffectiveTo` timestamp columns. `insert`
   * supersedes the current version (closes it and opens a new one);
   * `update`/`upsert`/`truncate`/`delete` are disabled — a version is
   * added ONLY via `insert()`. Reads see the time columns as ordinary
   * filters — `find({ ...key, EffectiveTo: sentinel })` is the current
   * version. See {@link TemporalTableOptions}. Mutually exclusive with
   * `audit` — a temporal table is already its own complete history.
   */
  readonly temporal?: TemporalTableOptions<C>;
  /**
   * Generate a versioned REPLICA of this table that records every
   * version — an audit trail. Unlike `temporal`, THIS table's write
   * semantics are unchanged (normal insert/update/delete); norm mirrors
   * every write into the replica (insert → open a version; update →
   * close current + open new; delete → close current, no successor).
   * The replica is registered under `audit.name` as a READ-ONLY entity
   * (`find`/`findOne`/`count`/`getByPK` only — norm owns its writes).
   * Mutually exclusive with `temporal`. See {@link AuditTableOptions}.
   */
  readonly audit?: AuditTableOptions<C>;
};

/** Audit (versioned-replica) configuration — see
 * {@link EntityTableOptions.audit}. */
export type AuditTableOptions<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
> = {
  /** Registry key the generated replica is exposed under —
   * `db.repo(name)`. Required: there is no derived default. */
  readonly name: string;
  /** Column builder for the replica's own primary key — one row per
   * version, name fixed as `auditId`. Full `Column` control (type,
   * length, generator); default is a lexically-sortable ULID
   * `varchar(26)`. */
  readonly AuditPK?: AnyColumnBuilder;
  /** Name of the injected "valid from" column (default `EffectiveFrom`). */
  readonly EffectiveFromColumn?: string;
  /** Name of the injected "valid to" column (default `EffectiveTo`). The
   * current version is the row whose value equals the sentinel. */
  readonly EffectiveToColumn?: string;
  /** Name of the VIRTUAL point-in-time filter column (default `AsOf`) —
   * same rewrite as {@link TemporalTableOptions.asOfColumn}. */
  readonly asOfColumn?: string;
  /** The open-end sentinel stored in `EffectiveTo` for the current
   * version (default `2099-12-31T23:59:59.999Z`). */
  readonly sentinel?: string;
};

/** Effective-dating (temporal-table) configuration — see
 * {@link EntityTableOptions.temporal}. */
export type TemporalTableOptions<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
> = {
  /** The TEMPORAL KEY: the column(s) identifying one logical record
   * across its versions (NOT the primary key — the pk stays per-version).
   * Must be existing, non-encrypted columns. */
  readonly key: ReadonlyArray<keyof C & string>;
  /** Name of the injected "valid from" column (default `EffectiveFrom`). */
  readonly EffectiveFromColumn?: string;
  /** Name of the injected "valid to" column (default `EffectiveTo`). The
   * current version is the row whose value equals the sentinel. */
  readonly EffectiveToColumn?: string;
  /**
   * Name of the VIRTUAL point-in-time filter column (default `AsOf`).
   * It is filter-only — never stored, never read, never inserted:
   * `find({ '@AsOf': someDate })` rewrites to `EffectiveFrom <= someDate
   * AND EffectiveTo > someDate`, selecting the version in force at that
   * instant (pass "now" for the current one).
   */
  readonly asOfColumn?: string;
  /** The open-end sentinel stored in `EffectiveTo` for the current
   * version (default `2099-12-31T23:59:59.999Z`). A far-future value
   * (not NULL) lets a plain `UNIQUE(key…, EffectiveTo)` enforce
   * one-current-per-key on every dialect. Provide an ISO-8601 string. */
  readonly sentinel?: string;
};

/** VIEW options — DB-side, joinable, composable. */
export type EntityViewOptions<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
> = {
  readonly type: 'VIEW';
  /** The stored SELECT the view is defined over. */
  readonly query: Query<'SELECT'>;
  /** CREATE MATERIALIZED VIEW (Postgres; other dialects degrade to a
   * plain view per the OQL translator). */
  readonly materialized?: true;
  /**
   * LOGICAL foreign keys — join linkage + reverse derivation ONLY,
   * never DDL (FK constraints on views are not valid SQL; these stay
   * out of migration snapshots entirely). This is what makes a view
   * PROJECTABLE from its target — the M2M pattern: a junction⋈far
   * view with `fk: { Post: … , reverseAs: 'Tags' }` gives Posts a
   * one-query `'@Tags'` relation. Views have no primary key, so the
   * derived reverse cardinality is ALWAYS hasMany — declare
   * `reverseCardinality: 'hasOne'` explicitly when the view is
   * one-row-per-target.
   */
  readonly fk?: Record<string, ForeignKeyDef<C>>;
  readonly dbSchema?: string;
  readonly comment?: string;
  readonly hooks?: ReadHooks<C>;
  /** Rows a limit-less `find()` fetches (default 10). `0` = UNBOUNDED
   * — every such read emits a `warning` event when it runs. */
  readonly defaultPageSize?: number;
  /**
   * Read-cache TTL in MINUTES (`0`/omitted = off; needs a `cache`
   * config on `Norm`). A VIEW is a derivation over base tables, so its
   * cache is pruned whenever ANY of the tables its stored query reads
   * (resolved transitively through composed views) is written. See
   * {@link EntityTableOptions.cache}.
   */
  readonly cache?: number;
};

/** QUERY options — client-side stored SELECT; terminal. */
export type EntityQueryOptions<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
> = {
  readonly type: 'QUERY';
  readonly query: Query<'SELECT'>;
  readonly comment?: string;
  readonly hooks?: ReadHooks<C>;
  /** Rows a limit-less `find()` fetches (default 10). `0` = UNBOUNDED
   * — every such read emits a `warning` event when it runs. */
  readonly defaultPageSize?: number;
  /**
   * Read-cache TTL in MINUTES (`0`/omitted = off; needs a `cache`
   * config on `Norm`). A QUERY is a derivation over base tables, so its
   * cache is pruned whenever ANY of the tables its stored query reads
   * (resolved transitively through composed views) is written. See
   * {@link EntityTableOptions.cache}.
   */
  readonly cache?: number;
};

/** Index/unique targets: declared columns plus the synthesized
 * `<col>_hash` siblings of `.encrypt().hash()` columns. */
type _IndexableOf<C extends Record<string, AnyColumnBuilder>> =
  | (keyof C & string)
  | (keyof HashSiblingsOf<C> & string);

/** Synthesized `<name>_hash` siblings for `.encrypt().hash()` columns.
 * Sibling nullability follows the source column. */
type HashSiblingsOf<C extends Record<string, AnyColumnBuilder>> = {
  [
    K in keyof C & string as C[K]['spec'] extends { hash: true } ? `${K}_hash`
      : never
  ]:
    & ColumnSpec<
      C[K] extends ColumnBuilder<infer T, boolean>
        ? (null extends T ? string | null : string)
        : string,
      true
    >
    & {
      readonly disableInsert: true;
      readonly disableUpdate: true;
    };
};

/** Resolved `EffectiveFrom` column name for a temporal options object
 * (the override, or the default). `string extends N` catches a WIDENED
 * override — e.g. the config built in a separately-`: string`-annotated
 * variable instead of an inline literal — where `N` resolves to the bare
 * `string` type rather than a specific literal. Falling through to `N`
 * in that case would make `_TemporalColumnsOf` key a mapped type on
 * `string` itself, i.e. `{ [x: string]: ColumnSpec<...> }` — an index
 * signature that, once intersected into the entity's columns, makes
 * EVERY property access type-check (typos included), silently voiding
 * norm's compile-time typo protection for the WHOLE entity. `never`
 * instead contributes no key at all: the column is invisible to the
 * type (needs a cast) but every OTHER column stays fully checked. */
type _EffFromName<O> = O extends {
  readonly temporal: { readonly EffectiveFromColumn: infer N extends string };
} ? (string extends N ? never : N)
  : 'EffectiveFrom';
/** Resolved `EffectiveTo` column name — same widened-literal guard as
 * {@link _EffFromName}. */
type _EffToName<O> = O extends
  { readonly temporal: { readonly EffectiveToColumn: infer N extends string } }
  ? (string extends N ? never : N)
  : 'EffectiveTo';

/** Resolved `AsOf` virtual filter-column name — same widened-literal
 * guard as {@link _EffFromName}. */
type _AsOfName<O> = O extends
  { readonly temporal: { readonly asOfColumn: infer N extends string } }
  ? (string extends N ? never : N)
  : 'AsOf';

/** The `EffectiveFrom` / `EffectiveTo` columns norm injects for a temporal
 * table, surfaced in the TYPE so they can be read and filtered. `EffectiveTo`
 * is norm-owned (excluded from `InsertOf`/`UpdateOf`). `EffectiveFrom` is
 * OPTIONAL on insert/update (`ColumnSpec<Date, true>` ⇒ optional but non-null
 * on read): a caller MAY supply it to date/schedule the new version; when
 * omitted norm uses "now". Plus the VIRTUAL `AsOf` filter column — filter-only
 * (the `asOf` brand keeps it OUT of `RowOf`/`ReadRowOf`, and it is never a
 * real stored column). Empty for a non-temporal entity. */
type _TemporalColumnsOf<O> = O extends { readonly temporal: object } ?
    & { readonly [K in _EffFromName<O>]: ColumnSpec<Date, true> }
    & {
      readonly [K in _EffToName<O>]:
        & ColumnSpec<Date, true>
        & { readonly disableInsert: true; readonly disableUpdate: true };
    }
    & {
      readonly [K in _AsOfName<O>]:
        & ColumnSpec<Date, true>
        & {
          readonly asOf: true;
          readonly disableInsert: true;
          readonly disableUpdate: true;
        };
    }
  : Record<never, never>;

/** Apply the insert/update pick-lists to the emitted column types:
 * columns OUTSIDE a declared scope carry the corresponding disable
 * brand, so `InsertOf`/`UpdateOf` (and the generated Guardians)
 * exclude them without any extra machinery. */
type _ScopedColumns<M, O> = {
  readonly [K in keyof M]:
    & M[K]
    & (O extends { readonly insert: ReadonlyArray<infer I> }
      ? K extends I ? unknown : { readonly disableInsert: true }
      : unknown)
    & (O extends { readonly update: ReadonlyArray<infer U> }
      ? K extends U ? unknown : { readonly disableUpdate: true }
      : unknown);
};

/** An FK entry as it appears in EMITTED definitions. */
export type EmittedForeignKey = {
  readonly model: string;
  readonly on: Readonly<Record<string, string>>;
  readonly reverseAs?: string;
  readonly reverseCardinality?: 'hasOne' | 'hasMany';
  readonly project?: true;
  readonly reverseProject?: true;
  readonly onDelete?: ForeignKeyAction;
  readonly onUpdate?: ForeignKeyAction;
};

/** Emitted FK map — entity-key, `on`, and reverse-naming LITERALS
 * preserved from the options (the typed projection surface resolves
 * reverse relations from these). */
type EmittedForeignKeysOf<F> = {
  readonly [A in keyof F]: F[A] extends
    { readonly model: infer M extends string; readonly on: infer On } ? (
      & { readonly model: M; readonly on: On }
      & (F[A] extends { readonly reverseAs: infer RA extends string }
        ? { readonly reverseAs: RA }
        : { readonly reverseAs?: string })
      & (F[A] extends
        { readonly reverseCardinality: infer RC extends 'hasOne' | 'hasMany' }
        ? { readonly reverseCardinality: RC }
        : { readonly reverseCardinality?: 'hasOne' | 'hasMany' })
      & (F[A] extends { readonly project: true } ? { readonly project: true }
        : { readonly project?: true })
      & (F[A] extends { readonly reverseProject: true }
        ? { readonly reverseProject: true }
        : { readonly reverseProject?: true })
      & (F[A] extends { readonly onDelete: infer OD extends ForeignKeyAction }
        ? { readonly onDelete: OD }
        : { readonly onDelete?: ForeignKeyAction })
      & (F[A] extends { readonly onUpdate: infer OU extends ForeignKeyAction }
        ? { readonly onUpdate: OU }
        : { readonly onUpdate?: ForeignKeyAction })
    )
    : never;
};

/** The emitted TABLE definition. */
export type TableDefinition<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
  O extends EntityTableOptions<C> = EntityTableOptions<C>,
  N extends string = string,
> = {
  readonly type: 'TABLE';
  readonly name: N;
  readonly dbSchema?: string;
  readonly comment?: string;
  readonly columns:
    & _ScopedColumns<SpecMapOf<C>, O>
    & _TemporalColumnsOf<O>;
  readonly primaryKeys: O['pk'];
  readonly foreignKeys?: O['fk'] extends Record<string, ForeignKeyDef<C>>
    ? EmittedForeignKeysOf<O['fk']>
    : undefined;
  readonly indexes?: O['index'];
  readonly uniques?: O['unique'];
  readonly renamedFrom?: string;
  readonly hooks?: O['hooks'];
  readonly defaultPageSize?: number;
  /** Read-cache TTL in minutes; 0/omitted = off. See the option type. */
  readonly cache?: number;
  /** Normalized effective-dating config; absent = not a temporal table. */
  readonly temporal?: EmittedTemporal;
  /** Normalized audit-replica config; `undefined` = no generated
   * replica. The `definition` carries the FULLY-BUILT
   * {@link AuditDefinition} — `Schema()` registers it under `name`.
   * Deliberately NOT `audit?: EmittedAudit<C, O>` (a flat optional
   * field) — that would make the field's type `EmittedAudit<C, O> |
   * undefined` even for an entity that DOES configure `audit`, and a
   * type unioned with `undefined` fails a `M[K] extends { readonly
   * audit: { readonly name: infer N } }` check UNCONDITIONALLY (an
   * object requiring `name` never accepts `undefined`) — silently
   * breaking `Schema()`'s `_AuditEntitiesOf<M>` injection for every
   * entity. The ternary keeps the CONFIGURED case union-free. */
  readonly audit: O extends {
    readonly audit: { readonly name: infer N extends string };
  } ? EmittedAudit<C, O>
    : undefined;
};

/** Normalized {@link TemporalTableOptions} on an emitted definition:
 * resolved column names + sentinel. */
export type EmittedTemporal = {
  readonly key: readonly string[];
  readonly from: string;
  readonly to: string;
  readonly sentinel: string;
  /** Virtual point-in-time filter column name (rewrites to a from/to
   * range). Filter-only — not a stored column. */
  readonly asOf: string;
};

/** Normalized {@link AuditTableOptions} on the SOURCE entity's emitted
 * definition: the registry name the replica is exposed under, plus the
 * fully-built replica {@link AuditDefinition} itself — `Entity()` builds
 * it eagerly (it needs nothing beyond the source's own columns/name),
 * so `Schema()`'s job is just to relocate it into the registry. */
export type EmittedAudit<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
  O extends EntityTableOptions<C> = EntityTableOptions<C>,
> = {
  /** The literal registry name from `O['audit']['name']` when it infers
   * as one (the normal `const`-inferred inline-literal case); plain
   * `string` otherwise (a widened override — same fallback shape as a
   * runtime-only consumer would see, just not USABLE to key
   * `_AuditEntitiesOf`'s injection in that case). */
  readonly name: O extends {
    readonly audit: { readonly name: infer N extends string };
  } ? N
    : string;
  readonly definition: AuditDefinition<C, O>;
};

/** Resolved `EffectiveFrom` column name for an AUDIT options object —
 * same widened-literal guard as {@link _EffFromName} (temporal), reading
 * `O['audit']` instead of `O['temporal']`. */
type _AuditEffFromName<O> = O extends {
  readonly audit: { readonly EffectiveFromColumn: infer N extends string };
} ? (string extends N ? never : N)
  : 'EffectiveFrom';
/** Resolved `EffectiveTo` column name for an AUDIT options object. */
type _AuditEffToName<O> = O extends
  { readonly audit: { readonly EffectiveToColumn: infer N extends string } }
  ? (string extends N ? never : N)
  : 'EffectiveTo';
/** Resolved `AsOf` virtual filter-column name for an AUDIT options
 * object. */
type _AuditAsOfName<O> = O extends
  { readonly audit: { readonly asOfColumn: infer N extends string } }
  ? (string extends N ? never : N)
  : 'AsOf';

/** The replica's own columns: every one of the source's columns
 * (unscoped — the replica is never written via the public API, so no
 * insert/update pick-list applies), plus the generated `auditId`
 * primary key, plus the same EffectiveFrom/EffectiveTo/AsOf trio
 * `_TemporalColumnsOf` injects for a temporal table (same brands, so
 * `RowOf`/`ReadRowOf`/`ValidProjection`'s existing `AsOf`-exclusion
 * applies here with no extra machinery). */
type _AuditColumnsOf<C extends Record<string, AnyColumnBuilder>, O> =
  & SpecMapOf<C>
  & { readonly auditId: ColumnSpec<string, true> }
  & { readonly [K in _AuditEffFromName<O>]: ColumnSpec<Date, true> }
  & {
    readonly [K in _AuditEffToName<O>]:
      & ColumnSpec<Date, true>
      & { readonly disableInsert: true; readonly disableUpdate: true };
  }
  & {
    readonly [K in _AuditAsOfName<O>]:
      & ColumnSpec<Date, true>
      & {
        readonly asOf: true;
        readonly disableInsert: true;
        readonly disableUpdate: true;
      };
  };

/** The emitted AUDIT definition — a generated, read-only, versioned
 * replica of a `temporal`-free TABLE. Physical (real DDL, real pk +
 * `UNIQUE(<source pk>, EffectiveTo)`), but exposed as a `ReadRepo` —
 * never joinable (no `foreignKeys` — deliberately: a row references a
 * SPECIFIC version, not the logical record, and audit history must
 * survive the source row's own deletion) and never an FK target. */
export type AuditDefinition<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
  O extends EntityTableOptions<C> = EntityTableOptions<C>,
  N extends string = string,
> = {
  readonly type: 'AUDIT';
  readonly name: N;
  readonly dbSchema?: string;
  readonly comment?: string;
  readonly columns: _AuditColumnsOf<C, O>;
  readonly primaryKeys: readonly ['auditId'];
  readonly uniques: Record<string, readonly string[]>;
  /** Never present — structurally declared (`undefined`-typed, not
   * omitted) so call sites that narrow `TableDefinition | ViewDefinition
   * | AuditDefinition` on `type !== 'QUERY'` (the FK/index machinery
   * shared with TABLE) keep type-checking without an AUDIT-specific
   * branch; the runtime value is always absent. */
  readonly foreignKeys?: undefined;
  readonly indexes?: undefined;
  readonly renamedFrom?: undefined;
  /** Registry key of the source TABLE this replica mirrors — filled in
   * by `Schema()` (`Entity()` does not know its own future registry
   * key). */
  readonly auditOf: string;
};

/** The emitted VIEW definition. */
export type ViewDefinition<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
  N extends string = string,
  O extends EntityViewOptions<C> = EntityViewOptions<C>,
> = {
  readonly type: 'VIEW';
  readonly name: N;
  readonly dbSchema?: string;
  readonly comment?: string;
  readonly columns: { readonly [K in keyof C]: C[K]['spec'] };
  readonly query: Query<'SELECT'>;
  readonly materialized?: true;
  /** LOGICAL join linkage only — never DDL, never snapshotted. */
  readonly foreignKeys?: O['fk'] extends Record<string, ForeignKeyDef<C>>
    ? EmittedForeignKeysOf<O['fk']>
    : undefined;
  readonly hooks?: EmittedReadHooks;
  readonly defaultPageSize?: number;
  /** Read-cache TTL in minutes; 0/omitted = off. See the option type. */
  readonly cache?: number;
};

/** The emitted QUERY definition (client-side; no DDL, no dbSchema). */
export type QueryDefinition<
  C extends Record<string, AnyColumnBuilder> = Record<
    string,
    AnyColumnBuilder
  >,
  N extends string = string,
> = {
  readonly type: 'QUERY';
  readonly name: N;
  readonly comment?: string;
  readonly columns: { readonly [K in keyof C]: C[K]['spec'] };
  readonly query: Query<'SELECT'>;
  readonly hooks?: EmittedReadHooks;
  readonly defaultPageSize?: number;
  /** Read-cache TTL in minutes; 0/omitted = off. See the option type. */
  readonly cache?: number;
};

/** Spec of the synthesized hash sibling. */
function hashSiblingSpec(
  source: string,
  nullable: boolean,
  renamedFrom?: string,
): ColumnSpec<string> {
  return {
    type: 'VARCHAR',
    length: 64,
    ...(nullable ? { nullable: true } : {}),
    disableInsert: true,
    disableUpdate: true,
    // The sibling follows its source through renames — otherwise the
    // migration diff drops+re-adds it and every stored digest is lost.
    ...(renamedFrom !== undefined
      ? { renamedFrom: hashSiblingOf(renamedFrom) }
      : {}),
    comment:
      `Auto-synthesised hash sibling of '${source}' - maintained by norm`,
  } as ColumnSpec<string>;
}

/** Recursively freeze plain data (functions are skipped by nature —
 * they are not objects to `Object.values` recursion entry). */
function deepFreeze(v: unknown): void {
  if (v === null || typeof v !== 'object' || Object.isFrozen(v)) return;
  Object.freeze(v);
  for (const val of Object.values(v as Record<string, unknown>)) {
    deepFreeze(val);
  }
}

/** Validate the emitted definition (every structural rule lives in
 * ONE place — ../asserts/definition.ts), then freeze it. */
function validateAndFinalize<D extends object>(def: D): D {
  assertDefinition(def as never);
  return finalize(def);
}

/** Freeze an emitted definition — everything except the caller-owned
 * OQL `query` object. Definitions are validated at construction; a
 * frozen tree keeps them that way. */
function finalize<D extends object>(def: D): D {
  for (const [key, val] of Object.entries(def)) {
    if (key === 'query') continue;
    deepFreeze(val);
  }
  Object.freeze(def);
  return def;
}

/**
 * Validate a temporal config and inject its norm-owned `EffectiveFrom` /
 * `EffectiveTo` columns into `specs`. Returns the normalized config plus
 * the `UNIQUE(key…, EffectiveTo)` group that enforces one-current-per-key.
 */
function buildTemporal(
  name: string,
  columns: Record<string, AnyColumnBuilder>,
  specs: Record<string, ColumnSpec>,
  t: TemporalTableOptions,
): { emitted: EmittedTemporal; unique: { name: string; cols: string[] } } {
  const key = [...t.key] as string[];
  if (key.length === 0) {
    throw new Error(
      `Entity('${name}'): temporal.key must name at least one column.`,
    );
  }
  for (const col of key) {
    if (!(col in columns)) {
      throw new Error(
        `Entity('${name}'): temporal.key column '${col}' does not exist.`,
      );
    }
    if ((specs[col] as ColumnSpec | undefined)?.encrypt === true) {
      throw new Error(
        `Entity('${name}'): temporal.key column '${col}' is encrypted — a ` +
          `temporal key must be matchable by value; use .hash() or a plain ` +
          `column.`,
      );
    }
  }
  const from = t.EffectiveFromColumn ?? 'EffectiveFrom';
  const to = t.EffectiveToColumn ?? 'EffectiveTo';
  const asOf = t.asOfColumn ?? 'AsOf';
  if (new Set([from, to, asOf]).size !== 3) {
    throw new Error(
      `Entity('${name}'): the temporal column names (EffectiveFromColumn, ` +
        `EffectiveToColumn, asOfColumn) must all differ.`,
    );
  }
  // `asOf` is virtual (filter-only) — it must also not collide, since it
  // surfaces as a filter key.
  for (const c of [from, to, asOf]) {
    if (c in columns || c in specs) {
      throw new Error(
        `Entity('${name}'): temporal column '${c}' collides with a declared ` +
          `column — rename it via EffectiveFromColumn / EffectiveToColumn / ` +
          `asOfColumn.`,
      );
    }
  }
  const sentinel = t.sentinel ?? '2099-12-31T23:59:59.999Z';
  if (Number.isNaN(Date.parse(sentinel))) {
    throw new Error(
      `Entity('${name}'): temporal.sentinel '${sentinel}' is not a valid ` +
        `ISO-8601 date.`,
    );
  }
  // DATETIME (not TIMESTAMP): MariaDB's TIMESTAMP is Unix-based and caps
  // at 2038, which the far-future sentinel overflows; DATETIME runs to
  // 9999. On Postgres both render to TIMESTAMP; on SQLite, TEXT.
  const tsSpec = (label: string): ColumnSpec =>
    ({
      type: 'DATETIME',
      disableInsert: true,
      disableUpdate: true,
      comment: `Temporal ${label} — maintained by norm`,
    }) as ColumnSpec;
  specs[from] = tsSpec('valid-from');
  specs[to] = tsSpec('valid-to');
  // `asOf` is NOT added to specs — it is a virtual filter-only column,
  // rewritten to a from/to range at query time.
  return {
    emitted: { key, from, to, sentinel, asOf },
    unique: { name: `${name}_temporal_current`, cols: [...key, to] },
  };
}

/** `UserAudit` → `user_audit`; `HTTPUserAudit` → `http_user_audit`. Used
 * only to derive the audit replica's PHYSICAL table name from its
 * registry name — the registry name itself is never derived. */
function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/**
 * Validate an audit config and build the FULLY-FORMED replica
 * definition (columns, pk, unique) from the source's own already-
 * emitted specs — the source itself is untouched. `Schema()` relocates
 * the returned `definition` into the registry under `emitted.name` and
 * fills in `auditOf` (the source's registry key, unknown here).
 */
function buildAudit(
  name: string,
  dbSchema: string | undefined,
  specs: Record<string, ColumnSpec>,
  primaryKeys: readonly string[],
  a: AuditTableOptions,
): { emitted: { name: string; definition: AuditDefinition } } {
  if (a.name.trim() === '') {
    throw new Error(`Entity('${name}'): audit.name must be non-empty.`);
  }
  if (primaryKeys.length === 0) {
    throw new Error(
      `Entity('${name}'): audit requires a primary key to version by.`,
    );
  }
  const from = a.EffectiveFromColumn ?? 'EffectiveFrom';
  const to = a.EffectiveToColumn ?? 'EffectiveTo';
  const asOf = a.asOfColumn ?? 'AsOf';
  if (new Set([from, to, asOf]).size !== 3) {
    throw new Error(
      `Entity('${name}'): the audit column names (EffectiveFromColumn, ` +
        `EffectiveToColumn, asOfColumn) must all differ.`,
    );
  }
  for (const c of [from, to, asOf]) {
    if (c in specs) {
      throw new Error(
        `Entity('${name}'): audit column '${c}' collides with a declared ` +
          `column — rename it via EffectiveFromColumn / EffectiveToColumn / ` +
          `asOfColumn.`,
      );
    }
  }
  const sentinel = a.sentinel ?? '2099-12-31T23:59:59.999Z';
  if (Number.isNaN(Date.parse(sentinel))) {
    throw new Error(
      `Entity('${name}'): audit.sentinel '${sentinel}' is not a valid ` +
        `ISO-8601 date.`,
    );
  }
  const pkBuilder = a.AuditPK ?? Column.varchar(26).default(() => ulid());
  const pkSpec = pkBuilder.spec;
  if (pkSpec.default?.insert === undefined) {
    throw new Error(
      `Entity('${name}'): audit.AuditPK must declare .default(...) — a ` +
        `version's pk is generated by norm, never supplied by a caller.`,
    );
  }
  const tsSpec = (label: string): ColumnSpec =>
    ({
      type: 'DATETIME',
      disableInsert: true,
      disableUpdate: true,
      comment: `Audit ${label} — maintained by norm`,
    }) as ColumnSpec;
  const columns: Record<string, ColumnSpec> = { ...specs };
  columns['auditId'] = {
    ...pkSpec,
    disableInsert: true,
    disableUpdate: true,
    comment: pkSpec.comment ?? 'Audit version id — maintained by norm',
  } as ColumnSpec;
  columns[from] = tsSpec('valid-from');
  columns[to] = tsSpec('valid-to');
  // `asOf` is NOT added to columns — virtual filter-only, same as temporal.

  const definition = validateAndFinalize({
    type: 'AUDIT',
    name: snakeCase(a.name),
    ...(dbSchema !== undefined ? { dbSchema } : {}),
    columns,
    primaryKeys: ['auditId'],
    uniques: { [`${name}_audit_current`]: [...primaryKeys, to] },
    auditOf: '', // Schema() fills in the source's registry key.
    // Read-side reuse: the replica's EffectiveFrom/EffectiveTo/AsOf are
    // semantically identical to a temporal table's (versioned rows,
    // current = sentinel, `@AsOf` rewrites to a from/to range) — stamping
    // the SAME EmittedTemporal shape here (key = the SOURCE's pk, the
    // replica's version key) lets `ReadRepo`'s existing `@AsOf` rewrite
    // serve it with no new read-path code. Never drives a WRITE: the
    // replica is exposed only as a `ReadRepo`, which has no write verbs
    // for the guard in `Repo.insert/update/delete/upsert/truncate` to
    // ever see.
    temporal: { key: [...primaryKeys], from, to, sentinel, asOf },
  }) as unknown as AuditDefinition;

  return { emitted: { name: a.name, definition } };
}

/** Unwrap builders → specs, guarding read-only kinds. */
function collectSpecs(
  kind: 'TABLE' | 'VIEW' | 'QUERY',
  name: string,
  columns: Record<string, AnyColumnBuilder>,
): Record<string, ColumnSpec> {
  const specs: Record<string, ColumnSpec> = {};
  for (const [colName, builder] of Object.entries(columns)) {
    const spec = builder.spec;
    // Shallow copy: entities never alias the builder's live spec
    // object (builders are reusable across entities).
    specs[colName] = { ...spec };
    if (kind === 'TABLE' && spec.hash === true) {
      const sibling = hashSiblingOf(colName);
      if (sibling in columns) {
        throw new Error(
          `Entity('${name}'): column '${sibling}' collides with the ` +
            `hash sibling synthesised for '${colName}'. Rename it — ` +
            `norm owns '<column>_hash' names.`,
        );
      }
      specs[sibling] = hashSiblingSpec(
        colName,
        spec.nullable === true,
        spec.renamedFrom,
      );
    }
  }
  return specs;
}

/** Normalize one builder-side FK declaration into its EMITTED form —
 * shared by the TABLE and VIEW branches. A VIEW's onDelete/onUpdate are
 * carried only so assertDefinition can reject them (a logical join fk
 * has no physical constraint to act on). */
function emitForeignKey(
  fk: ForeignKeyDef<Record<string, AnyColumnBuilder>>,
): EmittedForeignKey {
  return {
    model: fk.model,
    on: { ...fk.on } as Readonly<Record<string, string>>,
    ...(fk.reverseAs !== undefined ? { reverseAs: fk.reverseAs } : {}),
    ...(fk.reverseCardinality !== undefined
      ? { reverseCardinality: fk.reverseCardinality }
      : {}),
    ...(fk.project === true ? { project: true } : {}),
    ...(fk.reverseProject === true ? { reverseProject: true } : {}),
    ...(fk.onDelete !== undefined ? { onDelete: fk.onDelete } : {}),
    ...(fk.onUpdate !== undefined ? { onUpdate: fk.onUpdate } : {}),
  };
}

/** Define a VIEW (DB-side; joinable, composable). */
export function Entity<
  N extends string,
  C extends Record<string, AnyColumnBuilder>,
  const O extends EntityViewOptions<C>,
>(
  name: N,
  columns: C,
  options: O & EntityViewOptions<C>,
): ViewDefinition<C, N, O>;
/** Define a QUERY (client-side stored SELECT; terminal). */
export function Entity<
  N extends string,
  C extends Record<string, AnyColumnBuilder>,
>(
  name: N,
  columns: C,
  options: EntityQueryOptions<C>,
): QueryDefinition<C, N>;
/** Define a TABLE (the default kind — `pk` required). */
export function Entity<
  N extends string,
  C extends Record<string, AnyColumnBuilder>,
  const O extends EntityTableOptions<C>,
>(name: N, columns: C, options: O): TableDefinition<C, O, N>;
/**
 * Runtime constructor shared by all three {@link Entity} overloads.
 *
 * @throws {Error} When `name` is empty, when `columns` is empty, when an
 *   `insert`/`update` scope names a column that does not exist, or when a
 *   `hash` column collides with the `<column>_hash` sibling norm synthesises.
 * @throws {@link NormDefinitionError} When the emitted definition fails
 *   structural validation (delegated to {@link assertDefinition}).
 */
export function Entity(
  name: string,
  columns: Record<string, AnyColumnBuilder>,
  options:
    | EntityTableOptions<Record<string, AnyColumnBuilder>>
    | EntityViewOptions
    | EntityQueryOptions,
): unknown {
  if (name.trim() === '') {
    throw new Error('Entity(): name must be a non-empty string');
  }
  if (Object.keys(columns).length === 0) {
    throw new Error(`Entity('${name}'): at least one column is required`);
  }
  const kind = options.type ?? 'TABLE';

  if (kind === 'VIEW' || kind === 'QUERY') {
    const o = options as EntityViewOptions | EntityQueryOptions;
    const specs = collectSpecs(kind, name, columns);
    const viewFks = kind === 'VIEW' ? (o as EntityViewOptions).fk : undefined;
    let foreignKeys: Record<string, EmittedForeignKey> | undefined;
    if (viewFks !== undefined) {
      foreignKeys = {};
      for (const [alias, fk] of Object.entries(viewFks)) {
        foreignKeys[alias] = emitForeignKey(fk);
      }
    }
    return validateAndFinalize({
      type: kind,
      name,
      ...(kind === 'VIEW' &&
          (o as EntityViewOptions).dbSchema !== undefined
        ? { dbSchema: (o as EntityViewOptions).dbSchema }
        : {}),
      ...(o.comment !== undefined ? { comment: o.comment } : {}),
      columns: specs,
      query: o.query,
      ...(kind === 'VIEW' && (o as EntityViewOptions).materialized === true
        ? { materialized: true }
        : {}),
      ...(foreignKeys !== undefined ? { foreignKeys } : {}),
      ...(o.hooks !== undefined ? { hooks: { ...o.hooks } } : {}),
      ...(o.defaultPageSize !== undefined
        ? { defaultPageSize: o.defaultPageSize }
        : {}),
      ...(o.cache !== undefined ? { cache: o.cache } : {}),
    });
  }

  const o = options as EntityTableOptions<Record<string, AnyColumnBuilder>>;
  // pk validity (missing / empty) is enforced by assertDefinition on the
  // emitted result below — no separate early check.
  const specs = collectSpecs('TABLE', name, columns);

  // Insert/update pick-lists: listed columns must be real author
  // columns; everything OUTSIDE a declared scope becomes norm-owned
  // for that operation.
  for (const scope of ['insert', 'update'] as const) {
    const list = o[scope];
    if (list === undefined) continue;
    for (const col of list) {
      if (!(col in columns)) {
        throw new Error(
          `Entity('${name}').${scope}: column '${col}' does not exist` +
            (col in specs ? ` — '<column>_hash' siblings are norm-owned` : ''),
        );
      }
    }
    const flag = scope === 'insert' ? 'disableInsert' : 'disableUpdate';
    for (const col of Object.keys(specs)) {
      if (!list.includes(col)) {
        (specs[col] as unknown as Record<string, unknown>)[flag] = true;
      }
    }
  }

  if (o.temporal !== undefined && o.audit !== undefined) {
    throw new Error(
      `Entity('${name}'): 'temporal' and 'audit' are mutually exclusive — ` +
        `a temporal table is already its own complete history.`,
    );
  }

  // Temporal: inject EffectiveFrom/EffectiveTo (norm-owned) AFTER the
  // pick-list loop so they keep their own disable flags, and fold the
  // one-current-per-key UNIQUE group into `uniques`.
  let temporal: EmittedTemporal | undefined;
  const emittedUniques: Record<string, string[]> = o.unique !== undefined
    ? Object.fromEntries(
      Object.entries(o.unique).map(([k, cols]) => [k, [...cols]]),
    )
    : {};
  if (o.temporal !== undefined) {
    const built = buildTemporal(name, columns, specs, o.temporal);
    temporal = built.emitted;
    emittedUniques[built.unique.name] = built.unique.cols;
  }

  // Audit: build the versioned-replica definition from the source's OWN
  // (untouched) specs — Schema() relocates it into the registry.
  let audit: { name: string; definition: AuditDefinition } | undefined;
  const sourcePk = Array.isArray(o.pk) ? [...o.pk] : [];
  if (o.audit !== undefined) {
    audit = buildAudit(name, o.dbSchema, specs, sourcePk, o.audit).emitted;
  }

  let foreignKeys: Record<string, EmittedForeignKey> | undefined;
  if (o.fk) {
    foreignKeys = {};
    for (const [alias, fk] of Object.entries(o.fk)) {
      // Structure (pairs, locals, reverseProject cardinality) is
      // validated by assertDefinition on the emitted result; the
      // ENTITY-KEY target resolves at use() time.
      foreignKeys[alias] = emitForeignKey(fk);
    }
  }

  return validateAndFinalize({
    type: 'TABLE',
    name,
    ...(o.dbSchema !== undefined ? { dbSchema: o.dbSchema } : {}),
    ...(o.comment !== undefined ? { comment: o.comment } : {}),
    columns: specs,
    // Defensive: a missing/non-array pk collapses to [], which
    // assertDefinition rejects with the canonical "at least one column".
    primaryKeys: sourcePk,
    ...(foreignKeys !== undefined ? { foreignKeys } : {}),
    ...(o.index !== undefined
      ? {
        indexes: Object.fromEntries(
          Object.entries(o.index).map(([k, cols]) => [k, [...cols]]),
        ),
      }
      : {}),
    ...(Object.keys(emittedUniques).length > 0
      ? { uniques: emittedUniques }
      : {}),
    ...(o.renamedFrom !== undefined ? { renamedFrom: o.renamedFrom } : {}),
    ...(o.hooks !== undefined ? { hooks: { ...o.hooks } } : {}),
    ...(o.defaultPageSize !== undefined
      ? { defaultPageSize: o.defaultPageSize }
      : {}),
    ...(o.cache !== undefined ? { cache: o.cache } : {}),
    ...(temporal !== undefined ? { temporal } : {}),
    ...(audit !== undefined ? { audit } : {}),
  });
}
