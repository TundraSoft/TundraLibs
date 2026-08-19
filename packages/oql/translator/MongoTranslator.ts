/**
 * MongoDB OQL translator.
 *
 * Mongo isn't a SQL dialect, so this class deliberately doesn't extend
 * {@link AbstractTranslator}. Instead it implements the same public-method
 * surface (`select`, `insert`, `update`, …) and returns a {@link
 * MongoAction} — a discriminated union over Mongo action keywords
 * (`'find'`, `'aggregate'`, `'insert'`, `'update'`, `'delete'`,
 * `'count'`, `'createCollection'`, `'createIndex'`, `'drop'`,
 * `'dropIndex'`, `'createView'`, `'renameCollection'`, `'dropDatabase'`,
 * `'noop'`). Each variant carries the precise `params` shape for that
 * action, so drivers can `switch (action.sql)` and have TypeScript
 * narrow `action.params` automatically.
 *
 * The driver layer dispatches on `sql` and uses `params` directly with
 * the underlying mongo client.
 *
 * Compatibility notes (full breakdown in `packages/oql/docs/Compatibility.md`):
 * - Schemas: `CREATE_SCHEMA` throws (Mongo databases are created on first
 *   write). `DROP_SCHEMA` emits `dropDatabase`.
 * - TRUNCATE: emulated as `delete` with an empty filter.
 * - Materialized views: not supported. CREATE_VIEW with `materialized: true`
 *   silently falls back to a regular Mongo view; REFRESH_MATERIALIZED_VIEW
 *   emits a `noop`.
 * - Mongo collections are schemaless, so CREATE_TABLE emits a
 *   `createCollection` action (also implicit on first write). ALTER_TABLE
 *   is a no-op except for renames, which emit `renameCollection`.
 * - Bulk UPSERT (data: array) emits a `bulkWrite` action whose `params.ops`
 *   carries one `updateOne` operation per row. The Mongo driver dispatches
 *   this through MongoDB's native `bulkWrite` call — one round-trip, atomic
 *   per-op semantics. Single-row UPSERT still emits a plain `update` action.
 * - Expressions: UUID materialises a fresh value via `crypto.randomUUID()`
 *   at translate time. HASH/ENCRYPT/DECRYPT/LPAD/RPAD pass the input
 *   through unchanged (Mongo has no aggregation-pipeline crypto/padding).
 * - Aggregates: STRING_AGG throws — no clean Mongo equivalent.
 * - Deduplication: `SELECT { distinct: true }` and `COUNT { distinct }`
 *   throw — Mongo has no find-level DISTINCT; build a `$group` pipeline
 *   explicitly when you need one.
 * - `$exists` / `$nexists` filters throw — correlated EXISTS subqueries
 *   have no Mongo find-filter equivalent (a faithful `$lookup`-based
 *   emulation would silently change plan/semantics, so we refuse).
 *
 * @module translator/MongoTranslator
 */

import type {
  Expressions,
  Operators,
  Query,
  QueryFilter,
  TimeUnit,
} from '../types/mod.ts';
import {
  assertAlterTable,
  assertAlterView,
  assertCount,
  assertCreateIndex,
  assertCreateSchema,
  assertCreateTable,
  assertCreateView,
  assertDelete,
  assertDropIndex,
  assertDropSchema,
  assertDropTable,
  assertDropView,
  assertInsert,
  assertSelect,
  assertTruncate,
  assertUpdate,
  assertUpsert,
  findDisallowedJsonPathOperator,
  JSON_PATH_ALLOWED_OPERATORS,
} from '../asserts/mod.ts';
import { assertInsertFromQuery } from '../asserts/query/DML/mod.ts';
import { assertRefreshMaterializedView } from '../asserts/query/DDL/mod.ts';
import { DialectUnsupportedError, OqlError } from '../errors/mod.ts';
import { COUNT_ALIAS } from './AbstractTranslator.ts';

// =============================================================================
// Mongo action types — discriminated union of every translator output shape.
// =============================================================================
//
// Each action carries its own `params` shape, narrowed by the `sql` literal.
// Drivers can `switch (a.sql) { case 'find': … }` and TypeScript will narrow
// `a.params` automatically — no `as any` cast on the dispatch path.

/**
 * A plain `find()`. Emitted for a SELECT that needs no pipeline —
 * anything requiring aliasing, joins or aggregates becomes a
 * {@link MongoAggregateAction} instead.
 */
export type MongoFindAction = {
  sql: 'find';
  params: {
    collection: string;
    filter: Record<string, unknown>;
    options: {
      // Mongo native `find().project()` only supports include/exclude
      // (0 / 1). Aliasing/renaming forces the SELECT into the aggregate
      // path, where projection accepts string field references.
      projection?: Record<string, 0 | 1>;
      sort?: Record<string, 1 | -1>;
      limit?: number;
      skip?: number;
      findOne?: boolean;
    };
  };
};

/**
 * An aggregation pipeline. Also the shape `insertQuery` emits, where the
 * final `$merge` stage is what performs the write.
 */
export type MongoAggregateAction = {
  sql: 'aggregate';
  params: {
    collection: string;
    pipeline: Record<string, unknown>[];
  };
};

/**
 * An insert. `params.data` stays singular or plural exactly as the caller
 * passed it, so the driver picks `insertOne` / `insertMany` from its shape.
 */
export type MongoInsertAction = {
  sql: 'insert';
  params: {
    collection: string;
    data: Record<string, unknown> | Array<Record<string, unknown>>;
  };
};

/**
 * An update. `params.data` is already wrapped in its Mongo update
 * operators (`$set`, and `$setOnInsert` on the upsert path) — pass it
 * through untouched.
 */
export type MongoUpdateAction = {
  sql: 'update';
  params: {
    collection: string;
    filter: Record<string, unknown>;
    data: Record<string, unknown>;
    options?: { multiple?: boolean; upsert?: boolean };
  };
};

/**
 * One `updateOne`-with-upsert operation inside a bulk UPSERT. The shape
 * mirrors what MongoDB's `bulkWrite` accepts under
 * `{ updateOne: { filter, update, upsert: true } }`.
 */
export type MongoBulkUpsertOp = {
  filter: Record<string, unknown>;
  update: Record<string, unknown>;
};

/**
 * Emitted by `MongoTranslator.upsert(q)` when `q.data` is an array.
 * Each entry in `params.ops` is one `updateOne` with `upsert: true` —
 * the conflict-key columns form `filter`, the rest of the row forms
 * `update`. The driver dispatches this through MongoDB's native
 * `bulkWrite` for a single round-trip.
 */
export type MongoBulkWriteAction = {
  sql: 'bulkWrite';
  params: {
    collection: string;
    ops: MongoBulkUpsertOp[];
  };
};

/**
 * A delete. Also what `truncate` emits, with an empty `filter` — so an
 * empty filter here is intentional, never a dropped predicate.
 */
export type MongoDeleteAction = {
  sql: 'delete';
  params: {
    collection: string;
    filter: Record<string, unknown>;
    options?: { multiple?: boolean };
  };
};

/**
 * A native `count`. Only emitted for a join-free COUNT; with joins the
 * query falls back to a pipeline.
 */
export type MongoCountAction = {
  sql: 'count';
  params: {
    collection: string;
    filter: Record<string, unknown>;
  };
};

/**
 * An explicit `createCollection`. Optional in practice — Mongo creates the
 * collection on first write — but emitted so CREATE_TABLE has an effect.
 */
export type MongoCreateCollectionAction = {
  sql: 'createCollection';
  params: { collection: string };
};

/**
 * A `createIndex`. Every key is ascending (`1`) — OQL's `CREATE_INDEX`
 * carries no per-column direction. A partial index arrives as
 * `options.partialFilterExpression`.
 */
export type MongoCreateIndexAction = {
  sql: 'createIndex';
  params: {
    collection: string;
    keys: Record<string, 1 | -1>;
    options: Record<string, unknown>;
  };
};

/** A `dropIndex`. Mongo scopes index names per-collection. */
export type MongoDropIndexAction = {
  sql: 'dropIndex';
  params: { name: string; collection?: string };
};

/**
 * A collection drop, emitted for both DROP_TABLE and DROP_VIEW — Mongo
 * drops a view the same way it drops a collection.
 */
export type MongoDropAction = {
  sql: 'drop';
  params: { collection: string; options: { ifExists: boolean } };
};

/**
 * A `renameCollection` — the only ALTER_TABLE action Mongo can act on,
 * and how `alterView` handles a rename-only request.
 */
export type MongoRenameCollectionAction = {
  sql: 'renameCollection';
  params: { collection: string; target: string };
};

/**
 * A `createView`. `viewOn` is the source collection and `pipeline` the
 * view body — the translated SELECT, expanded to pipeline stages even
 * when it would otherwise have been a plain `find`.
 */
export type MongoCreateViewAction = {
  sql: 'createView';
  params: {
    view: string;
    viewOn: string;
    pipeline: unknown[];
  };
};

/**
 * A `dropDatabase`, emitted for DROP_SCHEMA. Note the asymmetry: there is
 * no create counterpart, because `createSchema` throws.
 */
export type MongoDropDatabaseAction = {
  sql: 'dropDatabase';
  params: { database: string };
};

/**
 * Do nothing. Emitted where a SQL dialect would have work to do but Mongo
 * has none — `refreshMaterializedView`, say — so a caller's statement
 * sequence keeps its length and positions.
 */
export type MongoNoopAction = {
  sql: 'noop';
  params: Record<string, never>;
};

/**
 * Discriminated union of every action `MongoTranslator` can emit. Use
 * `switch (action.sql)` to dispatch — TypeScript narrows `action.params`
 * to the matching shape inside each case.
 */
export type MongoAction =
  | MongoFindAction
  | MongoAggregateAction
  | MongoInsertAction
  | MongoUpdateAction
  | MongoBulkWriteAction
  | MongoDeleteAction
  | MongoCountAction
  | MongoCreateCollectionAction
  | MongoCreateIndexAction
  | MongoDropIndexAction
  | MongoDropAction
  | MongoRenameCollectionAction
  | MongoCreateViewAction
  | MongoDropDatabaseAction
  | MongoNoopAction;

/**
 * Mongo escape for a value to be inlined inside a regex pattern. Mongo's
 * `$regex` operator interprets the value as a JS regex source.
 */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * Filter operators whose value is spliced into a regex pattern. Their
 * operand must be a plain string by the time it reaches
 * `#translateOperator` — anything else is routed or rejected before that.
 */
const LIKE_OPERATORS: ReadonlySet<string> = new Set([
  '$like',
  '$nlike',
  '$ilike',
  '$nilike',
  '$startsWith',
  '$endsWith',
  '$contains',
]);

/**
 * OQL {@link TimeUnit} → Mongo `$dateAdd` / `$dateDiff` unit.
 *
 * Mongo's date-arithmetic operators only accept lowercase singular unit
 * names and fail at execution with `unknown time unit value: …` on
 * anything else, so the OQL unit cannot be passed through verbatim. The
 * SQL dialects do the equivalent mapping through
 * `AbstractTranslator._timeUnitCase`; this is Mongo's counterpart.
 *
 * Keyed by {@link TimeUnit} so a new OQL unit fails to compile until it
 * is mapped here.
 */
const MONGO_TIME_UNITS: Record<TimeUnit, string> = {
  DAYS: 'day',
  HOURS: 'hour',
  MINUTES: 'minute',
  SECONDS: 'second',
  MONTHS: 'month',
  YEARS: 'year',
};

/**
 * Turns a validated {@link Query} into a {@link MongoAction} for the mongo
 * driver to execute. Mirrors the SQL translators' method surface but is
 * not an {@link AbstractTranslator} — there is no SQL string or parameter
 * record, just a discriminated action object.
 *
 * Stateless and reusable. Several OQL features have no Mongo equivalent
 * and throw rather than degrade silently; the module header above lists
 * them.
 *
 * @example
 * ```typescript
 * const mongo = new MongoTranslator();
 * const action = mongo.select({
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'name'],
 *   projection: { '@id': true, '@name': true },
 * });
 * if (action.sql === 'find') {
 *   // action.params is narrowed to the find shape here
 *   console.log(action.params.collection, action.params.filter);
 * }
 * ```
 */
export class MongoTranslator {
  /** Dialect tag, reported on every error this translator raises. */
  public readonly Dialect = 'mongo';

  // =========================================================================
  // Public API — one method per query type
  // =========================================================================

  /**
   * Translate a `SELECT`. Returns a plain `find` when it can and an
   * aggregation pipeline when the query needs one (aliased projections,
   * joins, aggregates, grouping) — check `action.sql` before reading
   * `params`.
   *
   * @throws {@link DialectUnsupportedError} For `distinct`, an
   *   `$exists` / `$nexists` filter, `STRING_AGG`, and any other
   *   expression or operator with no Mongo equivalent.
   */
  public select(
    q: Query<'SELECT'>,
  ): MongoFindAction | MongoAggregateAction {
    assertSelect(q);
    return this.#buildSelect(q);
  }

  /**
   * Translate an `INSERT`. There is no `RETURNING` equivalent, so unlike
   * the SQL translators nothing is projected back.
   */
  public insert(q: Query<'INSERT'>): MongoInsertAction {
    assertInsert(q);
    const data = q.data;
    return {
      sql: 'insert',
      params: {
        collection: q.table,
        data: this.#renderData(data),
      },
    };
  }

  /**
   * Translate an `INSERT … SELECT`. The pipeline runs over the *source*
   * collection and writes with `$merge`, so `params.collection` is the
   * source, not the insert target — the target appears in the final stage.
   */
  public insertQuery(q: Query<'INSERT_FROM_QUERY'>): MongoAggregateAction {
    assertInsertFromQuery(q);
    // `INSERT INTO target SELECT … FROM source` — emitted as an aggregation
    // over the SOURCE collection whose final stage writes into the target.
    //
    // Two correctness requirements the SQL dialects meet and Mongo must too:
    //   1. Preserve the source SELECT's WHERE / projection / sort / limit /
    //      skip. A plain-`find` source keeps those in `filter`/`options`, so
    //      convert it to the equivalent pipeline stages rather than dropping
    //      them (the old code emitted a bare `[{ $out }]`, copying EVERY doc
    //      with EVERY field).
    //   2. APPEND rows, never replace. `$out` atomically REPLACES the target
    //      collection (destroying its existing data); `$merge` appends. We
    //      use `$merge` with `whenNotMatched: 'insert'` and, to mirror SQL's
    //      insert semantics, `whenMatched: 'fail'` on an `_id` collision.
    const inner = this.#buildSelect(q.query as Query<'SELECT'>);
    const sourcePipeline = this.#pipelineFromSelect(inner);
    return {
      sql: 'aggregate',
      params: {
        collection: inner.params.collection,
        pipeline: [
          ...sourcePipeline,
          {
            $merge: {
              into: q.table,
              whenMatched: 'fail',
              whenNotMatched: 'insert',
            },
          },
        ],
      },
    };
  }

  /**
   * Expand a {@link MongoFindAction} into the equivalent aggregation
   * pipeline — `$match` (filter) → `$project` → `$sort` → `$skip` →
   * `$limit`, matching find's evaluation order. Reached via
   * {@link #pipelineFromSelect} from every path that materialises a SELECT
   * into a pipeline — `insertQuery` (`$merge` source), `createView` and
   * `alterView` (view body) — so a plain-`find` source SELECT keeps its
   * WHERE / projection / sort / limit / skip in all of them.
   */
  #findToPipeline(find: MongoFindAction): Record<string, unknown>[] {
    const pipeline: Record<string, unknown>[] = [];
    const { filter, options } = find.params;
    if (filter && Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }
    if (options.projection && Object.keys(options.projection).length > 0) {
      pipeline.push({ $project: options.projection });
    }
    if (options.sort && Object.keys(options.sort).length > 0) {
      pipeline.push({ $sort: options.sort });
    }
    if (options.skip !== undefined) pipeline.push({ $skip: options.skip });
    if (options.limit !== undefined) pipeline.push({ $limit: options.limit });
    return pipeline;
  }

  /**
   * Translate an `UPDATE`. Always `multiple: true`, and a `q.where`-less
   * query yields an empty filter that matches the whole collection.
   */
  public update(q: Query<'UPDATE'>): MongoUpdateAction {
    assertUpdate(q);
    return {
      sql: 'update',
      params: {
        collection: q.table,
        filter: q.where
          ? this.#translateFilter(q.where, this.#columnsOf(q))
          : {},
        data: { $set: this.#translateUpdateBody(q.data) },
        options: { multiple: true },
      },
    };
  }

  /**
   * Translate a `DELETE`. Always `multiple: true`, and a `q.where`-less
   * query yields an empty filter — which deletes every document.
   */
  public delete(q: Query<'DELETE'>): MongoDeleteAction {
    assertDelete(q);
    return {
      sql: 'delete',
      params: {
        collection: q.table,
        filter: q.where
          ? this.#translateFilter(q.where, this.#columnsOf(q))
          : {},
        options: { multiple: true },
      },
    };
  }

  /**
   * Translate an `UPSERT`. A single row becomes an `update` with
   * `upsert: true`; an array of rows becomes a `bulkWrite` — check
   * `action.sql` before reading `params`.
   *
   * @throws {@link DialectUnsupportedError} When a row leaves a conflict
   *   key null or absent. Mongo would match an arbitrary document rather
   *   than fail, so a partial key is refused up front.
   */
  public upsert(
    q: Query<'UPSERT'>,
  ): MongoUpdateAction | MongoBulkWriteAction {
    assertUpsert(q);
    // Mongo's upsert is `update` with `upsert: true`. The conflict keys
    // form the filter; the rest of `data` becomes the `$set`. When the
    // caller passes an array of rows we emit a `bulkWrite` action so
    // every row goes through in one round-trip — the per-row body is
    // built by `#buildUpsertOp` either way.
    const conflictKeys = q.conflictKeys.map((k) => k.slice(1));
    const updateOnConflict = q.updateOnConflict?.map((k) => k.slice(1));
    if (Array.isArray(q.data)) {
      const ops: MongoBulkUpsertOp[] = q.data.map((row) =>
        this.#buildUpsertOp(row, conflictKeys, updateOnConflict)
      );
      return {
        sql: 'bulkWrite',
        params: { collection: q.table, ops },
      };
    }
    const { filter, update } = this.#buildUpsertOp(
      q.data,
      conflictKeys,
      updateOnConflict,
    );
    return {
      sql: 'update',
      params: {
        collection: q.table,
        filter,
        data: update,
        options: { upsert: true },
      },
    };
  }

  /**
   * Build one `{ filter, update }` op for a single UPSERT row.
   *
   * - Conflict-key columns become the filter (`updateOne` matcher).
   * - Remaining columns split between `$set` (applied on both branches
   *   when listed in `updateOnConflict`, or always when
   *   `updateOnConflict` is undefined) and `$setOnInsert` (applied only
   *   on the insert branch — honours `disableUpdate` semantics).
   *
   * Empty `$set` / `$setOnInsert` operators are omitted because Mongo
   * rejects them.
   */
  #buildUpsertOp(
    row: Record<string, unknown>,
    conflictKeys: string[],
    updateOnConflict: string[] | undefined,
  ): MongoBulkUpsertOp {
    // Every conflict key MUST carry a concrete VALUE in the row — not merely
    // be present. A key that is absent, `undefined`, or `null` all reduce to
    // the same hazard: `undefined`/`null` serialise on the wire as
    // `{ ck: null }` (the Node driver defaults `ignoreUndefined` to false),
    // and an absent key leaves the filter empty/partial. Either way
    // `updateOne({}/{ck:null}, …, {upsert:true})` matches an ARBITRARY
    // existing document (any whose `ck` is null or absent) and $sets the row
    // onto it — silent corruption of an unrelated record. Testing `ck in row`
    // alone let `{ ck: undefined }` slip through; test the value instead.
    // Refuse loudly. (SQL dialects handle the same input benignly: the column
    // takes DEFAULT/NULL and ON CONFLICT simply never fires.)
    for (const ck of conflictKeys) {
      const value = row[ck];
      if (!(ck in row) || value === undefined || value === null) {
        throw new DialectUnsupportedError(
          this.Dialect,
          `UPSERT row is missing a concrete value for conflict key '${ck}' — an empty/partial or null match filter would overwrite an arbitrary document. Provide a non-null value for every conflict key in each data row.`,
        );
      }
    }
    const filter: Record<string, unknown> = {};
    const setBody: Record<string, unknown> = {};
    const insertOnly: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (conflictKeys.includes(key)) {
        filter[key] = value;
        continue;
      }
      const rendered = this.#renderValue(value);
      if (updateOnConflict === undefined || updateOnConflict.includes(key)) {
        setBody[key] = rendered;
      } else {
        insertOnly[key] = rendered;
      }
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(setBody).length > 0) update.$set = setBody;
    const setOnInsert = { ...filter, ...insertOnly };
    if (Object.keys(setOnInsert).length > 0) update.$setOnInsert = setOnInsert;
    return { filter, update };
  }

  /**
   * Translate a `COUNT`. A join-free count is a native `count`; with joins
   * it is rewritten as a SELECT and comes back as a pipeline.
   *
   * @throws {@link DialectUnsupportedError} When `q.distinct` is set —
   *   Mongo has no count-level DISTINCT.
   */
  public count(
    q: Query<'COUNT'>,
  ): MongoCountAction | MongoFindAction | MongoAggregateAction {
    assertCount(q);
    if (q.distinct !== undefined) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `COUNT with 'distinct' (build an explicit $group + $count pipeline instead)`,
      );
    }
    // Mongo native `count` only supports filter — no pre-count expression
    // chain. If the OQL caller asked for joins we fall back to an
    // aggregate count; otherwise the simpler path.
    if (q.joins) {
      const sel = this.#buildSelect({
        type: 'SELECT',
        table: q.table,
        schema: q.schema,
        columns: q.columns,
        joins: q.joins,
        where: q.where,
        aggregates: { [COUNT_ALIAS]: { $$_aggregate: 'COUNT' } },
        projection: { [`@${COUNT_ALIAS}`]: true },
      });
      return sel;
    }
    return {
      sql: 'count',
      params: {
        collection: q.table,
        filter: q.where
          ? this.#translateFilter(q.where, this.#columnsOf(q))
          : {},
      },
    };
  }

  // ---------------------------------------------------------------------------
  // DDL
  // ---------------------------------------------------------------------------

  /**
   * Always throws — a Mongo database springs into existence on its first
   * write, so there is nothing to emit. Validates `q` first, so a
   * malformed query still fails as a malformed query.
   *
   * @throws {@link DialectUnsupportedError} Unconditionally.
   */
  public createSchema(q: Query<'CREATE_SCHEMA'>): never {
    assertCreateSchema(q);
    throw new DialectUnsupportedError(
      this.Dialect,
      'CREATE_SCHEMA (Mongo databases are created implicitly on first write)',
    );
  }

  /**
   * Translate a `DROP_SCHEMA` to `dropDatabase`. Unconditional — Mongo
   * offers no `ifExists` or `cascade` here, so both are ignored.
   */
  public dropSchema(q: Query<'DROP_SCHEMA'>): MongoDropDatabaseAction {
    assertDropSchema(q);
    return {
      sql: 'dropDatabase',
      params: { database: q.schema },
    };
  }

  /**
   * Translate a `CREATE_TABLE` into a `createCollection` plus one unique
   * `createIndex` per key. Column definitions are discarded — Mongo
   * collections are schemaless, so only the uniqueness constraints
   * survive: the primary key as an index named `_pk`, and each entry of
   * `q.uniqueKeys` under its own name.
   */
  public createTable(
    q: Query<'CREATE_TABLE'>,
  ): Array<MongoCreateCollectionAction | MongoCreateIndexAction> {
    assertCreateTable(q);
    // Mongo collections are schemaless and created lazily on first write.
    // Emit an explicit `createCollection` so callers who want the empty
    // collection up-front can run it; primary-key uniqueness is enforced
    // by emitting a follow-up `createIndex` on the PK columns when
    // present.
    const out: Array<MongoCreateCollectionAction | MongoCreateIndexAction> = [{
      sql: 'createCollection',
      params: { collection: q.table },
    }];
    if (q.primaryKey && q.primaryKey.length > 0) {
      out.push({
        sql: 'createIndex',
        params: {
          collection: q.table,
          keys: Object.fromEntries(
            (q.primaryKey as string[]).map((c) => [c, 1]),
          ),
          options: { unique: true, name: '_pk' },
        },
      });
    }
    if (q.uniqueKeys) {
      for (const [name, cols] of Object.entries(q.uniqueKeys)) {
        out.push({
          sql: 'createIndex',
          params: {
            collection: q.table,
            keys: Object.fromEntries(
              (cols as string[]).map((c) => [c, 1]),
            ),
            options: { unique: true, name },
          },
        });
      }
    }
    return out;
  }

  /**
   * Translate an `ALTER_TABLE`. Only `renameTo` produces anything; column
   * and constraint changes are silently dropped, so a request that only
   * adds columns returns an empty array rather than throwing.
   */
  public alterTable(
    q: Query<'ALTER_TABLE'>,
  ): MongoRenameCollectionAction[] {
    assertAlterTable(q);
    // Mongo collections are schemaless; addColumns/dropColumns are
    // no-ops at the DB level (the change is whatever you write/unset
    // in subsequent updates). We honour `renameTo` since Mongo has
    // `renameCollection`.
    const out: MongoRenameCollectionAction[] = [];
    if (q.renameTo) {
      out.push({
        sql: 'renameCollection',
        params: { collection: q.table, target: q.renameTo },
      });
    }
    return out;
  }

  /**
   * Translate a `DROP_TABLE`. `q.ifExists` rides along in
   * `params.options`; the driver decides whether to swallow a missing
   * collection, since Mongo's `drop` has no such flag.
   */
  public dropTable(q: Query<'DROP_TABLE'>): MongoDropAction {
    assertDropTable(q);
    return {
      sql: 'drop',
      params: { collection: q.table, options: { ifExists: !!q.ifExists } },
    };
  }

  /**
   * Translate a `TRUNCATE` into an unfiltered delete. The collection and
   * its indexes survive, unlike a drop — but this walks every document, so
   * it is not the O(1) operation SQL `TRUNCATE` is.
   */
  public truncate(q: Query<'TRUNCATE'>): MongoDeleteAction {
    assertTruncate(q);
    return {
      sql: 'delete',
      params: {
        collection: q.table,
        filter: {},
        options: { multiple: true },
      },
    };
  }

  /**
   * Translate a `CREATE_INDEX`. `q.where` becomes a
   * `partialFilterExpression`; `q.method` has no Mongo equivalent and is
   * ignored.
   */
  public createIndex(q: Query<'CREATE_INDEX'>): MongoCreateIndexAction {
    assertCreateIndex(q);
    return {
      sql: 'createIndex',
      params: {
        collection: q.table,
        keys: Object.fromEntries(
          q.columns.map((c) => [c.slice(1), 1]),
        ),
        options: {
          unique: !!q.unique,
          name: q.index,
          ...(q.where
            ? {
              partialFilterExpression: this.#translateFilter(
                q.where,
                this.#columnsOf(q),
              ),
            }
            : {}),
        },
      },
    };
  }

  /** Translate a `DROP_INDEX`. `q.ifExists` and `q.cascade` are ignored. */
  public dropIndex(q: Query<'DROP_INDEX'>): MongoDropIndexAction {
    assertDropIndex(q);
    // `q.table` is guaranteed by the OQL contract; Mongo uses it as
    // the collection name on `dropIndex`.
    return {
      sql: 'dropIndex',
      params: { collection: q.table, name: q.index },
    };
  }

  /**
   * Mongo has no materialized views. When `q.materialized === true`
   * we silently fall back to a regular Mongo view — query still runs,
   * but data isn't cached and there's no `REFRESH` to issue.
   */
  public createView(q: Query<'CREATE_VIEW'>): MongoCreateViewAction {
    assertCreateView(q);
    void q.materialized; // accepted but not honoured
    const inner = this.#buildSelect(q.query);
    return {
      sql: 'createView',
      params: {
        view: q.view,
        viewOn: inner.params.collection,
        pipeline: this.#pipelineFromSelect(inner),
      },
    };
  }

  /**
   * Translate a `DROP_VIEW`. Emits the same `drop` as
   * {@link MongoTranslator.dropTable} — Mongo makes no distinction, so
   * this will happily drop a plain collection of the same name.
   */
  public dropView(q: Query<'DROP_VIEW'>): MongoDropAction {
    assertDropView(q);
    // Views drop the same way collections do.
    return {
      sql: 'drop',
      params: { collection: q.view, options: { ifExists: !!q.ifExists } },
    };
  }

  /**
   * Translate an `ALTER_VIEW`. Redefining emits drop-then-create, which is
   * not atomic: a reader between the two statements sees no view at all.
   * A rename with no `q.query` uses `renameCollection` instead.
   *
   * @throws {@link OqlError} `ALTER_VIEW_EMPTY` when neither `renameTo`
   *   nor `query` is set.
   */
  public alterView(
    q: Query<'ALTER_VIEW'>,
  ): Array<
    MongoDropAction | MongoCreateViewAction | MongoRenameCollectionAction
  > {
    assertAlterView(q);
    // Mongo has no ALTER VIEW. Emulate via drop+create when redefining;
    // rename uses renameCollection.
    const out: Array<
      MongoDropAction | MongoCreateViewAction | MongoRenameCollectionAction
    > = [];
    if (q.query) {
      out.push({
        sql: 'drop',
        params: { collection: q.view, options: { ifExists: true } },
      });
      const inner = this.#buildSelect(q.query);
      const newName = q.renameTo ?? q.view;
      out.push({
        sql: 'createView',
        params: {
          view: newName,
          viewOn: inner.params.collection,
          pipeline: this.#pipelineFromSelect(inner),
        },
      });
    } else if (q.renameTo) {
      out.push({
        sql: 'renameCollection',
        params: { collection: q.view, target: q.renameTo },
      });
    } else {
      throw new OqlError(
        `ALTER_VIEW requires at least one of 'renameTo' or 'query'`,
        { code: 'ALTER_VIEW_EMPTY', dialect: this.Dialect },
      );
    }
    return out;
  }

  /**
   * Mongo has no materialized views; the matching CREATE_VIEW silently
   * created a regular view, so REFRESH is a no-op.
   */
  public refreshMaterializedView(
    q: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): MongoNoopAction {
    assertRefreshMaterializedView(q);
    void q.view;
    return {
      sql: 'noop',
      params: {},
    };
  }

  /**
   * Coerce a {@link MongoFindAction} or {@link MongoAggregateAction} into
   * the pipeline form the SELECT-materialising paths need — `insertQuery`
   * (`$merge` source), `createView` and `alterView` (view definition).
   * For an aggregate action this is the existing pipeline; for a find
   * action it's the full `$match` → `$project` → `$sort` → `$skip` →
   * `$limit` expansion via {@link #findToPipeline}, so the source SELECT's
   * WHERE / projection / sort / limit / skip are all preserved rather than
   * collapsed to a bare `$match` (which dropped the projection — exposing
   * deliberately projected-away columns — the sort and the limit).
   *
   * All three consumers share this single helper so the find-expansion
   * cannot drift out of sync between them again.
   */
  #pipelineFromSelect(
    inner: MongoFindAction | MongoAggregateAction,
  ): Record<string, unknown>[] {
    if (inner.sql === 'aggregate') return inner.params.pipeline;
    return this.#findToPipeline(inner);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Build the Mongo op for a SELECT. Picks `find` (simple cases) vs
   * `aggregate` (anything that needs a pipeline: joins, aggregates,
   * declared expressions, HAVING, or projection aliasing — Mongo's
   * native `find().project()` only takes 0/1 includes, no rename).
   */
  #buildSelect(q: Query<'SELECT'>): MongoFindAction | MongoAggregateAction {
    if (q.distinct === true) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `SELECT with 'distinct' (build an explicit $group pipeline instead)`,
      );
    }
    const hasAlias = Object.values(q.projection).some(
      (v) => typeof v === 'string',
    );
    const needsPipeline = !!q.joins || !!q.aggregates ||
      !!q.expressions || !!q.having || hasAlias;
    if (!needsPipeline) {
      return this.#buildFind(q);
    }
    return this.#buildAggregate(q);
  }

  /**
   * Map an OQL `orderBy` (`{ '@col': 'ASC' | 'DESC' }`) to a Mongo sort
   * document (`{ col: 1 | -1 }`). Shared by `#buildFind` (as `options.sort`)
   * and `#buildAggregate` (as the `$sort` stage value).
   */
  #buildSort(
    orderBy: NonNullable<Query<'SELECT'>['orderBy']>,
  ): Record<string, 1 | -1> {
    return Object.fromEntries(
      Object.entries(orderBy).map((
        [k, v],
      ) => [k.slice(1).replace('.@', '.'), v === 'ASC' ? 1 : -1]),
    );
  }

  /** Build a simple `find` op — no joins, no aggregates. */
  #buildFind(q: Query<'SELECT'>): MongoFindAction {
    const filter = q.where
      ? this.#translateFilter(q.where, this.#columnsOf(q))
      : {};
    // `find` path only fires when projection has no aliasing (see
    // `#buildSelect`), so `#buildProjection`'s output here is purely
    // 0/1 include/exclude. Cast at the type boundary, not inline.
    const projection = this.#buildProjection(q) as Record<string, 0 | 1>;
    const options: MongoFindAction['params']['options'] = {};
    if (Object.keys(projection).length > 0) options.projection = projection;
    if (q.orderBy && Object.keys(q.orderBy).length > 0) {
      options.sort = this.#buildSort(q.orderBy);
    }
    if (q.limit !== undefined) options.limit = q.limit;
    if (q.offset !== undefined) options.skip = q.offset;
    return {
      sql: 'find',
      params: {
        collection: q.table,
        filter,
        options,
      },
    };
  }

  /**
   * Build an aggregation pipeline for SELECTs that need one — joins,
   * aggregates, expressions, having.
   */
  #buildAggregate(q: Query<'SELECT'>): MongoAggregateAction {
    const pipeline: Record<string, unknown>[] = [];
    // The `$match` position matters: a filter can only run once every field
    // it references exists in the doc. Two cases force it LATE:
    //   - it references a joined field (key OR value position, e.g.
    //     `@Author.@joinedAt`) — the field appears only after `$lookup`;
    //   - it references a declared expression alias (`@total`) — that field
    //     is materialised only by the `$addFields` expressions stage below.
    // An early `$match` (before `$lookup`/`$addFields`) is more efficient for
    // pure primary-table filters, so we detect and route the two cases. A
    // wrongly-early `$match` on a not-yet-existing field silently matches
    // against `missing` and returns wrong rows.
    //
    // The routing scans (`#filterReferencesJoins` /
    // `#filterReferencesExpressions`) are cheap structural passes over the
    // ORIGINAL `@Alias.@col` filter shape; `#translateFilter` (the actual
    // build) runs in exactly ONE branch, never both.
    const filterTouchesJoins = this.#filterReferencesJoins(q.where, q.joins);
    const filterTouchesExpr = this.#filterReferencesExpressions(
      q.where,
      q.expressions,
    );
    const deferMatch = filterTouchesJoins || filterTouchesExpr;
    if (q.where && !deferMatch) {
      pipeline.push({
        $match: this.#translateFilter(q.where, this.#columnsOf(q)),
      });
    }
    if (q.joins) {
      for (const [alias, def] of Object.entries(q.joins)) {
        if (!def) continue;
        const lookup = this.#buildLookup(alias, def);
        if (lookup !== null) pipeline.push(lookup);
      }
      // Joined fields land under `<alias>: [docs...]`. For
      // `belongsTo` / `hasOne`-style joins, we'd ideally `$unwind`
      // here so callers can match on `Alias.field` as if it were a
      // single document — but unwind drops parent rows that lack the
      // join, breaking LEFT JOIN semantics. Mongo's array-path
      // matching (`'Alias.field': value` matches if any element has
      // that field-value) handles the common case fine, so we skip
      // the unwind. If the caller needs single-row semantics they
      // can post-process.
    }
    if (q.expressions) {
      const addFields: Record<string, unknown> = {};
      for (const [name, expr] of Object.entries(q.expressions)) {
        addFields[name] = this.#translateExpression(expr);
      }
      pipeline.push({ $addFields: addFields });
    }
    // Deferred $match — runs AFTER every $lookup (joined arrays exist) and
    // AFTER the expressions $addFields (alias fields exist), but BEFORE any
    // $group, mirroring SQL's WHERE-then-GROUP-BY evaluation order.
    if (q.where && deferMatch) {
      pipeline.push({
        $match: this.#translateFilter(q.where, this.#columnsOf(q)),
      });
    }
    if (q.aggregates) {
      // JSON_ROW over a $lookup'd alias is NOT a $group job on Mongo:
      // $lookup already aggregated the related docs into an array per
      // base doc (no row fan-out to collapse). Pushing it through
      // $group evaluates '$Alias.field' AGAINST THE ARRAY — every
      // object field becomes an array of values. The faithful mapping
      // is a $map projecting the requested fields per element.
      const mapFields: Record<string, unknown> = {};
      const groupAggs: Record<string, unknown> = {};
      for (const [name, agg] of Object.entries(q.aggregates)) {
        const alias = this.#jsonRowLookupAlias(agg, q.joins);
        if (alias !== null) {
          const cols = (agg as { columns: Record<string, string> }).columns;
          const inObj: Record<string, unknown> = {};
          for (const [k, source] of Object.entries(cols)) {
            inObj[k] = `$$r.${source.replace(`@${alias}.@`, '')}`;
          }
          mapFields[name] = {
            $map: { input: `$${alias}`, as: 'r', in: inObj },
          };
          continue;
        }
        groupAggs[name] = agg;
      }
      if (Object.keys(mapFields).length > 0) {
        pipeline.push({ $addFields: mapFields });
      }
      if (Object.keys(groupAggs).length > 0) {
        const groupId: Record<string, unknown> = {};
        const groupBody: Record<string, unknown> = { _id: groupId };
        const groupedKeys: string[] = [];
        // Auto-GROUP-BY: every projection key not in aggregates is
        // grouped.
        for (const key of Object.keys(q.projection)) {
          const stripped = key.slice(1);
          if (q.aggregates && stripped in q.aggregates) continue;
          if (q.joins && stripped in q.joins) continue;
          groupId[stripped] = `$${stripped.replace('.@', '.')}`;
          groupedKeys.push(stripped);
        }
        for (const [name, agg] of Object.entries(groupAggs)) {
          // deno-lint-ignore no-explicit-any
          groupBody[name] = this.#translateAggregate(agg as any);
        }
        // Mapped JSON_ROW fields survive the group via $first — each
        // group key tuple identifies the base doc(s); SQL semantics
        // for this mix are group-dependent anyway.
        for (const name of Object.keys(mapFields)) {
          groupBody[name] = { $first: `$${name}` };
        }
        pipeline.push({ $group: groupBody });
        // After $group, grouped fields live under `_id.<key>`. Flatten
        // them back to top level so the subsequent $project / $sort /
        // $match sees plain field names.
        if (groupedKeys.length > 0) {
          const flatten: Record<string, unknown> = {};
          for (const key of groupedKeys) flatten[key] = `$_id.${key}`;
          pipeline.push({ $addFields: flatten });
        }
      }
    }
    if (q.having) {
      pipeline.push({
        $match: this.#translateFilter(q.having, this.#columnsOf(q)),
      });
    }
    const projection = this.#buildProjection(q);
    if (Object.keys(projection).length > 0) {
      pipeline.push({ $project: projection });
    }
    if (q.orderBy && Object.keys(q.orderBy).length > 0) {
      pipeline.push({ $sort: this.#buildSort(q.orderBy) });
    }
    if (q.offset !== undefined) pipeline.push({ $skip: q.offset });
    if (q.limit !== undefined) pipeline.push({ $limit: q.limit });
    return {
      sql: 'aggregate',
      params: {
        collection: q.table,
        pipeline,
      },
    };
  }

  /**
   * Build the `$lookup` stage for one join alias.
   *
   * OQL's join filter is a `JoinFilter` — `{ '@Alias.@joined': <value>,
   * … }` — and every entry is a condition, ANDed together (the SQL
   * translator emits one `ON a = b AND c = d` per entry). Values are a
   * local/joined column ref (`@local`, `@Other.@col`), a literal, `null`,
   * or an Expression over the local document.
   *
   * Two emitted forms:
   * - **One entry, column-ref value** → the concise
   *   `localField`/`foreignField` `$lookup`. This is the overwhelmingly
   *   common case and the form Mongo can optimise best.
   * - **Anything else** (composite keys, literal / `null` / Expression
   *   values) → the general `let` + `pipeline` form. Every condition
   *   becomes an `$eq` inside one `$expr: { $and: [ … ] }`, so a
   *   composite key correlates on *all* its parts. `let` bindings are
   *   evaluated against the local document, which is what makes
   *   local-side refs and Expressions resolve to the outer row (inside
   *   the sub-pipeline a bare `$field` addresses the *joined*
   *   collection).
   *
   * Returns `null` for an empty `on` (nothing to correlate on).
   */
  #buildLookup(
    alias: string,
    def: NonNullable<NonNullable<Query<'SELECT'>['joins']>[string]>,
  ): Record<string, unknown> | null {
    const onEntries = Object.entries(def.on);
    if (onEntries.length === 0) return null;
    const from = String(def.table);

    if (onEntries.length === 1) {
      const [joinedKey, localRef] = onEntries[0]!;
      const localField = this.#joinLocalPath(localRef);
      if (localField !== null) {
        return {
          $lookup: {
            from,
            localField,
            foreignField: this.#joinForeignField(joinedKey, alias),
            as: alias,
          },
        };
      }
    }

    // General form. `let` variable names must be valid Mongo variable
    // identifiers (lowercase-initial, alphanumeric), so they're generated
    // positionally rather than derived from the field path.
    const letVars: Record<string, unknown> = {};
    const conditions: unknown[] = [];
    for (const [joinedKey, value] of onEntries) {
      const foreignField = `$${this.#joinForeignField(joinedKey, alias)}`;
      const localPath = this.#joinLocalPath(value);
      if (localPath !== null) {
        const varName = `v${Object.keys(letVars).length}`;
        letVars[varName] = `$${localPath}`;
        conditions.push({ $eq: [foreignField, `$$${varName}`] });
        continue;
      }
      if (this.#isExpressionNode(value)) {
        const varName = `v${Object.keys(letVars).length}`;
        letVars[varName] = this.#translateExpression(value as Expressions);
        conditions.push({ $eq: [foreignField, `$$${varName}`] });
        continue;
      }
      // Literal / null — a constant condition on the joined collection.
      conditions.push({ $eq: [foreignField, value] });
    }

    const lookup: Record<string, unknown> = { from };
    if (Object.keys(letVars).length > 0) lookup.let = letVars;
    lookup.pipeline = [{
      $match: {
        $expr: conditions.length === 1 ? conditions[0] : { $and: conditions },
      },
    }];
    lookup.as = alias;
    return { $lookup: lookup };
  }

  /**
   * The joined-side (foreign) field name from an `on` key
   * (`'@Alias.@userId'` → `'userId'`).
   */
  #joinForeignField(joinedKey: string, alias: string): string {
    return joinedKey.replace(`@${alias}.@`, '');
  }

  /**
   * The local-side field path from an `on` value, or `null` when the
   * value isn't a column reference (literal / `null` / Expression).
   *
   * Unlike a filter value position, a join `on` value that starts with
   * `@` is a column reference by construction — the assert layer has
   * already validated it against the declared column lists.
   */
  #joinLocalPath(value: unknown): string | null {
    if (typeof value !== 'string' || !value.startsWith('@')) return null;
    return value.slice(1).replace('.@', '.');
  }

  /** Structural check for an OQL Expression node. */
  #isExpressionNode(value: unknown): boolean {
    return typeof value === 'object' && value !== null &&
      !(value instanceof Date) && !Array.isArray(value) &&
      '$$_expression' in value;
  }

  /**
   * Build a Mongo `projection` document from OQL projection. `1` for
   * include, `0` for exclude. Aliases use `$expr` rename via $project's
   * `{ alias: '$source' }` form.
   */
  #buildProjection(q: Query<'SELECT'>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    let hasAliasing = false;
    for (const [key, value] of Object.entries(q.projection)) {
      const stripped = key.slice(1);
      const source = stripped.replace('.@', '.');
      if (typeof value === 'string') {
        // Alias: { aliasName: '$source.path' }
        out[value] = `$${source}`;
        hasAliasing = true;
      } else {
        out[source] = 1;
      }
    }
    if (hasAliasing) {
      // When any aliasing is present, `_id` ought to be excluded by
      // default unless the projection explicitly asked for it.
      if (!Object.prototype.hasOwnProperty.call(out, '_id')) {
        out._id = 0;
      }
    }
    return out;
  }

  /**
   * Build the body of an INSERT — single document or array. Each value
   * is rendered via `#renderValue` so expressions inside (e.g. NOW)
   * become Mongo-native.
   */
  #renderData(
    data: Record<string, unknown> | Array<Record<string, unknown>>,
  ): Record<string, unknown> | Array<Record<string, unknown>> {
    if (Array.isArray(data)) return data.map((row) => this.#renderRow(row));
    return this.#renderRow(data);
  }

  #renderRow(row: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
      out[k] = this.#renderValue(v);
    }
    return out;
  }

  /** Translate UPDATE `data` to a Mongo-flat `$set` body. */
  #translateUpdateBody(
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = this.#renderValue(v);
    }
    return out;
  }

  /**
   * Render a single primitive / Date / Expression value into the form
   * Mongo expects in the operation body. Most primitives pass through;
   * Expressions become Mongo aggregation operators.
   */
  #renderValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (
      typeof value === 'object' &&
      !(value instanceof Date) &&
      '$$_expression' in value
    ) {
      return this.#translateExpression(value as Expressions);
    }
    return value;
  }

  /**
   * Walk a filter and return `true` if it references one of the supplied
   * join aliases — `'@<Alias>.@<col>'` — in EITHER position:
   *   - a filter KEY (`{ '@Author.@name': … }`), or
   *   - a VALUE (`{ '@createdAt': { $gt: '@Author.@joinedAt' } }`).
   * Both need the joined array to exist, so the aggregate builder uses
   * this to run `$match` AFTER `$lookup`. Scanning only keys (the original
   * bug) routed a value-position joined ref to the early `$match`, where
   * the missing path sorts below all BSON types and the comparison
   * silently matched every document.
   */
  #filterReferencesJoins(
    filter: QueryFilter | undefined,
    joins: Query<'SELECT'>['joins'] | undefined,
  ): boolean {
    if (!filter || !joins) return false;
    const aliases = new Set(Object.keys(joins));
    if (aliases.size === 0) return false;
    // Key form is `@Alias.@col` / `@Alias.col`; value form is `@Alias.@col`.
    // Both start `@<alias>.` — one regex covers each.
    const refsAlias = (s: unknown): boolean => {
      if (typeof s !== 'string') return false;
      const m = /^@([^.]+)\./.exec(s);
      return m !== null && aliases.has(m[1]!);
    };
    const visitValue = (v: unknown): boolean => {
      if (typeof v === 'string') return refsAlias(v);
      if (Array.isArray(v)) return v.some(visitValue);
      if (v && typeof v === 'object' && !(v instanceof Date)) {
        return Object.values(v as Record<string, unknown>).some(visitValue);
      }
      return false;
    };
    const visit = (f: unknown): boolean => {
      if (!f || typeof f !== 'object') return false;
      for (const [key, value] of Object.entries(f as Record<string, unknown>)) {
        if (key === '$and' || key === '$or') {
          if (Array.isArray(value)) {
            for (const sub of value) if (visit(sub)) return true;
          }
          continue;
        }
        if (refsAlias(key)) return true;
        if (visitValue(value)) return true;
      }
      return false;
    };
    return visit(filter);
  }

  /**
   * Walk a filter and return `true` if any key references a declared
   * expression alias (`@<exprName>`). Such a key must be matched AFTER the
   * `$addFields` expressions stage materialises the field — the aggregate
   * builder uses this to defer the `$match`. Expression aliases appear only
   * in key position (a WHERE alias filter), so values aren't scanned.
   */
  #filterReferencesExpressions(
    filter: QueryFilter | undefined,
    expressions: Query<'SELECT'>['expressions'] | undefined,
  ): boolean {
    if (!filter || !expressions) return false;
    const names = new Set(Object.keys(expressions));
    if (names.size === 0) return false;
    const visit = (f: unknown): boolean => {
      if (!f || typeof f !== 'object') return false;
      for (const [key, value] of Object.entries(f as Record<string, unknown>)) {
        if (key === '$and' || key === '$or') {
          if (Array.isArray(value)) {
            for (const sub of value) if (visit(sub)) return true;
          }
          continue;
        }
        // A bare `@name` key (no `.`) that names a declared expression.
        if (
          key.startsWith('@') && !key.includes('.') && names.has(key.slice(1))
        ) {
          return true;
        }
      }
      return false;
    };
    return visit(filter);
  }

  /**
   * The set of valid column paths for a query — base columns plus `alias.col`
   * for every joined column. Used to tell a value-position `@x` column
   * reference apart from literal data.
   */
  #columnsOf(
    q: { columns?: unknown; joins?: Record<string, unknown> | undefined },
  ): Set<string> {
    const set = new Set<string>();
    if (Array.isArray(q.columns)) {
      for (const c of q.columns) set.add(String(c));
    }
    if (q.joins && typeof q.joins === 'object') {
      for (const [alias, def] of Object.entries(q.joins)) {
        const cols = (def as { columns?: unknown } | null)?.columns;
        if (Array.isArray(cols)) {
          for (const c of cols) set.add(`${alias}.${String(c)}`);
        }
      }
    }
    return set;
  }

  /**
   * Resolve a value-position column reference for Mongo: an `@x` string whose
   * column path is in `columns` becomes a `$x` field reference (for use inside
   * `$expr`); anything else is data. Mirrors the SQL translator's rule so the
   * same OQL filter compares columns in both dialects.
   */
  #valueFieldRef(value: unknown, columns: ReadonlySet<string>): string | null {
    if (typeof value !== 'string' || !value.startsWith('@')) return null;
    const path = value.slice(1).replace('.@', '.');
    return columns.has(path) ? `$${path}` : null;
  }

  /**
   * Translate an OQL `QueryFilter` to a Mongo filter document.
   *
   * `$and` / `$or` become Mongo `$and` / `$or` arrays. Per-column
   * conditions translate via {@link #translateColumnCondition}.
   */
  #translateFilter(
    filter: QueryFilter,
    columns: ReadonlySet<string> = new Set(),
  ): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];
    let merged: Record<string, unknown> = {};
    // `$expr` clauses (column-to-column comparisons) are top-level siblings,
    // not per-field specs, so collect and combine them under one `$expr`.
    const exprs: unknown[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$exists' || key === '$nexists') {
        // OQL's `$exists` is a correlated EXISTS *subquery* — not
        // Mongo's field-existence `$exists` operator. There is no
        // faithful find-filter equivalent, so refuse loudly.
        throw new DialectUnsupportedError(
          this.Dialect,
          `filter operator '${key}' (correlated EXISTS subqueries have no Mongo find-filter equivalent)`,
        );
      }
      if (key === '$and') {
        const subs = (value as QueryFilter[]).map((f) =>
          this.#translateFilter(f, columns)
        );
        conditions.push({ $and: subs });
        continue;
      }
      if (key === '$or') {
        const subs = (value as QueryFilter[]).map((f) =>
          this.#translateFilter(f, columns)
        );
        conditions.push({ $or: subs });
        continue;
      }
      // Per-column condition; key looks like `@col`, `@Alias.@col`, or a
      // JSON path `@col.@key` (deeper allowed). All resolve to Mongo's
      // native dotted-path syntax; JSON paths additionally get the
      // restricted operator set policed.
      const fieldPath = this.#filterFieldPath(key, value, columns);
      const { spec, exprs: colExprs } = this.#translateColumnCondition(
        fieldPath,
        value as Operators,
        columns,
      );
      merged = { ...merged, ...spec };
      exprs.push(...colExprs);
    }
    if (exprs.length > 0) {
      merged = {
        ...merged,
        $expr: exprs.length === 1 ? exprs[0] : { $and: exprs },
      };
    }
    if (conditions.length === 0) return merged;
    if (Object.keys(merged).length === 0 && conditions.length === 1) {
      return conditions[0]!;
    }
    return { ...merged, $and: conditions };
  }

  /**
   * Resolve one filter key to its Mongo field path, enforcing the
   * JSON-path operator restriction.
   *
   * A multi-segment key is a *qualified* reference (a `$lookup`'d join
   * alias field) when its flat dotted path is a declared column, or when
   * its first segment prefixes any declared `alias.col` entry — the
   * join-alias interpretation always wins, mirroring the SQL
   * translators' precedence. Otherwise, when the first segment names a
   * declared base column, the key is a JSON path into that column's
   * embedded document. Mongo's native dotted-path syntax covers both —
   * `profile.name` — so the emitted path is identical either way; only
   * the operator policing differs: JSON-path keys take the restricted
   * {@link JSON_PATH_ALLOWED_OPERATORS} set so the same OQL query is
   * accepted or rejected uniformly across dialects, even though Mongo
   * itself could compare nested values natively.
   *
   * (The third SQL precedence rung — the base *table* name as first
   * segment — has no Mongo find-filter meaning and is already rejected
   * by the asserts layer, so it needs no handling here.)
   *
   * @throws {OqlError} `JSON_PATH_UNSUPPORTED_OPERATOR` when a JSON-path
   *   key carries an operator outside the allowed set.
   */
  #filterFieldPath(
    key: string,
    rhs: unknown,
    columns: ReadonlySet<string>,
  ): string {
    const stripped = key.slice(1);
    if (!stripped.includes('.@')) return stripped;
    // NOTE: `split('.@').join('.')` (not `replace`, which only rewrites
    // the FIRST occurrence) so deep paths keep every segment.
    const segments = stripped.split('.@');
    const flat = segments.join('.');
    const first = segments[0]!;
    const isQualified = columns.has(flat) ||
      [...columns].some((c) => c.startsWith(`${first}.`));
    if (!isQualified && columns.has(first)) {
      const disallowed = findDisallowedJsonPathOperator(rhs);
      if (disallowed !== null) {
        throw new OqlError(
          `Operator '${disallowed}' is not supported on JSON path '${key}'. Allowed: ${
            [...JSON_PATH_ALLOWED_OPERATORS].join(', ')
          }`,
          {
            code: 'JSON_PATH_UNSUPPORTED_OPERATOR',
            dialect: this.Dialect,
            operator: disallowed,
            path: key,
          },
        );
      }
    }
    return flat;
  }

  /**
   * Translate a `'@col': RHS` pair. Returns a per-field literal `spec`
   * (`{ field: <mongo-spec> }`) plus any `$expr` `exprs` for value-position
   * column references (`@otherCol`). A column reference is resolved to a
   * `$expr` comparison for the comparison operators; for `$in`/`$nin` and the
   * LIKE family — which Mongo cannot faithfully express field-to-field — a
   * {@link DialectUnsupportedError} is thrown rather than silently treating
   * the reference as a literal.
   */
  #translateColumnCondition(
    fieldPath: string,
    rhs: Operators,
    columns: ReadonlySet<string>,
  ): { spec: Record<string, unknown>; exprs: unknown[] } {
    const exprs: unknown[] = [];
    const lhs = `$${fieldPath}`;
    if (rhs === null) return { spec: { [fieldPath]: null }, exprs };
    if (Array.isArray(rhs)) {
      // Implicit $in. A column ref inside the list cannot be expressed in a
      // Mongo $match — reject rather than silently treat it as a literal.
      if (rhs.some((el) => this.#valueFieldRef(el, columns) !== null)) {
        throw new DialectUnsupportedError(
          this.Dialect,
          'column reference inside an $in / array filter value',
        );
      }
      return { spec: { [fieldPath]: { $in: rhs } }, exprs };
    }
    if (typeof rhs !== 'object' || rhs instanceof Date) {
      const ref = this.#valueFieldRef(rhs, columns);
      if (ref !== null) {
        exprs.push({ $eq: [lhs, ref] });
        return { spec: {}, exprs };
      }
      return { spec: { [fieldPath]: rhs }, exprs };
    }
    // Multiple operators on the same field merge into a single
    // `{ field: { $op1: …, $op2: … } }` document — deep-merge the inner spec.
    const out: Record<string, unknown> = {};
    const mergeLiteral = (fragment: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(fragment)) {
        if (
          out[k] !== undefined &&
          typeof out[k] === 'object' && out[k] !== null &&
          !Array.isArray(out[k]) &&
          typeof v === 'object' && v !== null && !Array.isArray(v)
        ) {
          out[k] = { ...(out[k] as object), ...(v as object) };
        } else {
          out[k] = v;
        }
      }
    };
    for (const [op, val] of Object.entries(rhs)) {
      if (
        op === '$eq' || op === '$ne' || op === '$gt' || op === '$gte' ||
        op === '$lt' || op === '$lte'
      ) {
        // Aggregation comparison operators share these names.
        const ref = this.#valueFieldRef(val, columns);
        if (ref !== null) {
          exprs.push({ [op]: [lhs, ref] });
          continue;
        }
      } else if (op === '$between') {
        const [lo, hi] = val as [unknown, unknown];
        const loRef = this.#valueFieldRef(lo, columns);
        const hiRef = this.#valueFieldRef(hi, columns);
        if (loRef !== null || hiRef !== null) {
          exprs.push({
            $and: [{ $gte: [lhs, loRef ?? lo] }, { $lte: [lhs, hiRef ?? hi] }],
          });
          continue;
        }
      } else if (
        op === '$in' || op === '$nin' || op === '$like' || op === '$nlike' ||
        op === '$ilike' || op === '$nilike' || op === '$startsWith' ||
        op === '$endsWith' || op === '$contains'
      ) {
        const hasRef = (op === '$in' || op === '$nin')
          ? (val as unknown[]).some((el) =>
            this.#valueFieldRef(el, columns) !== null
          )
          : this.#valueFieldRef(val, columns) !== null;
        if (hasRef) {
          throw new DialectUnsupportedError(
            this.Dialect,
            `column reference as the value of '${op}'`,
          );
        }
        // The LIKE family also accepts an Expression value (see
        // `asserts/filters/operators.ts`). A computed operand can't be
        // spliced into a `$regex` at translation time, so it routes
        // through `$expr` instead of the per-field literal spec.
        // (`$in` / `$nin` take primitive arrays only — no Expression.)
        if (op !== '$in' && op !== '$nin' && this.#isExpressionNode(val)) {
          exprs.push(
            this.#likeExpressionOperand(lhs, op, val as Expressions),
          );
          continue;
        }
      }
      mergeLiteral(this.#translateOperator(fieldPath, op, val));
    }
    return { spec: out, exprs };
  }

  /**
   * Translate a LIKE-family operator whose value is an OQL Expression
   * into an aggregation `$expr` fragment.
   *
   * `$startsWith` / `$endsWith` / `$contains` carry *literal* substring
   * semantics on the SQL side (the bound value's `%` / `_` are escaped
   * with an `ESCAPE` clause), so they map onto Mongo's literal
   * string-search operators — no regex, hence nothing to escape.
   *
   * `$like` / `$nlike` / `$ilike` / `$nilike` are the opposite: their
   * value IS a wildcard pattern, and translating that grammar to a regex
   * requires reading the pattern at translation time. When it is computed
   * server-side there is no pattern to read, and Mongo has no
   * LIKE-pattern matcher to hand it to — so we refuse rather than emit
   * something that quietly means something else.
   *
   * @throws {DialectUnsupportedError} For the `$like` family.
   */
  #likeExpressionOperand(
    lhs: string,
    op: string,
    expr: Expressions,
  ): unknown {
    const operand = this.#translateExpression(expr);
    switch (op) {
      case '$startsWith':
        // `$indexOfCP` returns -1 for "not found" and null when the field
        // is missing; both compare false against 0.
        return { $eq: [{ $indexOfCP: [lhs, operand] }, 0] };
      case '$contains':
        return { $gte: [{ $indexOfCP: [lhs, operand] }, 0] };
      case '$endsWith': {
        // Mongo has no "last index of", so compare the trailing slice.
        // `$let` binds both operands once — the subject `$ifNull`-coerced
        // so a missing field yields no match instead of a `$strLenCP`
        // type error, the suffix so the expression isn't re-evaluated
        // three times.
        const subject = '$$subject';
        const suffix = '$$suffix';
        const subjectLen = { $strLenCP: subject };
        const suffixLen = { $strLenCP: suffix };
        return {
          $let: {
            vars: { subject: { $ifNull: [lhs, ''] }, suffix: operand },
            in: {
              $and: [
                { $gte: [subjectLen, suffixLen] },
                {
                  $eq: [
                    {
                      $substrCP: [
                        subject,
                        { $subtract: [subjectLen, suffixLen] },
                        suffixLen,
                      ],
                    },
                    suffix,
                  ],
                },
              ],
            },
          },
        };
      }
      default:
        throw new DialectUnsupportedError(
          this.Dialect,
          `Expression as the value of '${op}' (a LIKE pattern must be ` +
            `known at translation time to become a regex — use ` +
            `'$startsWith' / '$endsWith' / '$contains' for a computed operand)`,
        );
    }
  }

  #translateOperator(
    fieldPath: string,
    op: string,
    val: unknown,
  ): Record<string, unknown> {
    // The LIKE family splices its value into a regex, so it must be a
    // string by this point. `#translateColumnCondition` has already
    // routed column refs (throws) and Expressions (`$expr`) away; this
    // guards the remaining shapes so hand-built, unvalidated input gets
    // a dialect error rather than a `val.replace is not a function`
    // TypeError from below.
    if (LIKE_OPERATORS.has(op) && typeof val !== 'string') {
      throw new DialectUnsupportedError(
        this.Dialect,
        `${val === null ? 'null' : typeof val} value for '${op}' ` +
          `(expected a string pattern or an Expression)`,
      );
    }
    switch (op) {
      case '$eq':
      case '$ne':
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
      case '$in':
      case '$nin':
        return { [fieldPath]: { [op]: val } };
      case '$null':
        return val ? { [fieldPath]: null } : { [fieldPath]: { $ne: null } };
      case '$between': {
        const [lo, hi] = val as [unknown, unknown];
        return { [fieldPath]: { $gte: lo, $lte: hi } };
      }
      case '$like':
      case '$nlike':
        return {
          [fieldPath]: this.#likeToRegex(val as string, op === '$nlike'),
        };
      case '$ilike':
      case '$nilike':
        return {
          [fieldPath]: this.#likeToRegex(
            val as string,
            op === '$nilike',
            true,
          ),
        };
      case '$startsWith':
        return {
          [fieldPath]: {
            $regex: `^${(val as string).replace(REGEX_SPECIALS, '\\$&')}`,
          },
        };
      case '$endsWith':
        return {
          [fieldPath]: {
            $regex: `${(val as string).replace(REGEX_SPECIALS, '\\$&')}$`,
          },
        };
      case '$contains':
        return {
          [fieldPath]: {
            $regex: (val as string).replace(REGEX_SPECIALS, '\\$&'),
          },
        };
      default:
        throw new DialectUnsupportedError(
          this.Dialect,
          `filter operator '${op}'`,
        );
    }
  }

  /**
   * SQL `LIKE` pattern → Mongo `$regex`. `%` → `.*`, `_` → `.`. Other
   * regex specials in the user's pattern are escaped first.
   */
  #likeToRegex(
    pattern: string,
    negate: boolean,
    caseInsensitive = false,
  ): Record<string, unknown> {
    // First escape regex specials EXCEPT `%` and `_`, then translate
    // those LIKE wildcards. REGEX_SPECIALS includes `*` (a regex
    // quantifier, but NOT a LIKE wildcard) so a literal `*` in the
    // pattern stays literal instead of leaking into the regex.
    const escaped = pattern
      .replace(REGEX_SPECIALS, '\\$&')
      .replaceAll('%', '.*')
      .replaceAll('_', '.');
    const inner: Record<string, unknown> = {
      $regex: `^${escaped}$`,
    };
    if (caseInsensitive) inner.$options = 'i';
    return negate ? { $not: inner } : inner;
  }

  /**
   * Map an OQL {@link TimeUnit} to the unit name Mongo's `$dateAdd` /
   * `$dateDiff` expect. See {@link MONGO_TIME_UNITS}.
   *
   * @throws {OqlError} `INVALID_TIME_UNIT` when the unit isn't a
   *   recognised OQL time unit. The asserts layer already rejects those,
   *   so this only fires on hand-built input that bypassed validation —
   *   and a clean error beats Mongo failing at execution time.
   */
  #mongoTimeUnit(unit: unknown): string {
    const mapped = typeof unit === 'string'
      ? MONGO_TIME_UNITS[unit as TimeUnit]
      : undefined;
    if (mapped === undefined) {
      throw new OqlError(
        `Unknown time unit '${String(unit)}' — expected one of ${
          Object.keys(MONGO_TIME_UNITS).join(', ')
        }`,
        { code: 'INVALID_TIME_UNIT', dialect: this.Dialect, unit },
      );
    }
    return mapped;
  }

  /**
   * Resolve an expression/aggregate argument for Mongo: a leading-`@`
   * string column reference becomes a `$field` path, a nested expression
   * object is translated recursively, and anything else (literals) passes
   * through unchanged. Shared by {@link #translateExpression} and
   * {@link #translateAggregate}.
   */
  #resolveExpressionRef(v: unknown): unknown {
    if (typeof v === 'string' && v.startsWith('@')) {
      return `$${v.slice(1).replace('.@', '.')}`;
    }
    if (
      typeof v === 'object' && v !== null && !(v instanceof Date) &&
      '$$_expression' in v
    ) {
      return this.#translateExpression(v as Expressions);
    }
    return v;
  }

  /**
   * Translate an OQL Expression to Mongo aggregation-operator form.
   * Pipeline / aggregation expressions only — these don't apply to
   * `find` filter syntax (which has different operator names).
   */
  #translateExpression(expr: Expressions): unknown {
    const args = ('args' in expr) ? expr.args : undefined;
    const r = (v: unknown): unknown => this.#resolveExpressionRef(v);
    switch (expr.$$_expression) {
      // Math
      case 'ADD':
        return { $add: (args as unknown[]).map(r) };
      case 'SUBTRACT':
        return { $subtract: (args as unknown[]).map(r) };
      case 'MULTIPLY':
        return { $multiply: (args as unknown[]).map(r) };
      case 'DIVIDE':
        return { $divide: (args as unknown[]).map(r) };
      case 'MODULO':
        return { $mod: (args as unknown[]).map(r) };
      case 'POWER': {
        const a = args as { base: unknown; exponent: unknown };
        return { $pow: [r(a.base), r(a.exponent)] };
      }
      case 'SQRT':
        return { $sqrt: r((args as unknown[])[0]) };
      case 'ABS':
        return { $abs: r((args as unknown[])[0]) };
      case 'CEIL':
        return { $ceil: r((args as unknown[])[0]) };
      case 'FLOOR':
        return { $floor: r((args as unknown[])[0]) };
      case 'ROUND':
        return {
          $round: (args as unknown[]).length > 1
            ? [r((args as unknown[])[0]), r((args as unknown[])[1])]
            : [r((args as unknown[])[0])],
        };

      // String
      case 'CONCAT':
        return { $concat: (args as unknown[]).map(r) };
      case 'LENGTH':
        return { $strLenCP: r(args) };
      case 'LOWER':
        return { $toLower: r(args) };
      case 'UPPER':
        return { $toUpper: r(args) };
      case 'TRIM':
        return { $trim: { input: r(args) } };
      case 'LTRIM':
        return { $ltrim: { input: r(args) } };
      case 'RTRIM':
        return { $rtrim: { input: r(args) } };
      case 'SUBSTR': {
        const a = args as { string: unknown; start: unknown; length?: unknown };
        // OQL `SUBSTR` start is 1-based (SQL-native) but Mongo's
        // `$substrCP` is 0-based, so shift down by one. `$subtract`
        // handles literal and column-ref starts uniformly.
        const start = { $subtract: [r(a.start), 1] };
        return {
          $substrCP: a.length !== undefined
            ? [r(a.string), start, r(a.length)]
            // -1 in $substrCP means "to the end"
            : [r(a.string), start, -1],
        };
      }
      case 'REPLACE': {
        const a = args as {
          string: unknown;
          search: unknown;
          replace: unknown;
        };
        return {
          $replaceAll: {
            input: r(a.string),
            find: r(a.search),
            replacement: r(a.replace),
          },
        };
      }

      // Date
      case 'NOW':
      case 'CURRENT_TIMESTAMP':
      case 'CURRENT_TIMESTAMPTZ':
        return '$$NOW';
      case 'CURRENT_DATE':
        return { $dateTrunc: { date: '$$NOW', unit: 'day' } };
      case 'CURRENT_TIME':
        // Mongo has no time-only type; emit NOW and let the caller
        // decide how to extract.
        return '$$NOW';
      case 'DATE_ADD': {
        const a = args as { date: unknown; amount: unknown; unit: unknown };
        return {
          $dateAdd: {
            startDate: r(a.date),
            unit: this.#mongoTimeUnit(a.unit),
            amount: r(a.amount),
          },
        };
      }
      case 'DATE_DIFF': {
        const a = args as { from: unknown; to: unknown; unit: unknown };
        return {
          $dateDiff: {
            startDate: r(a.from),
            endDate: r(a.to),
            unit: this.#mongoTimeUnit(a.unit),
          },
        };
      }

      // Crypto / UUID — Mongo has no aggregation-pipeline crypto ops.
      // We degrade gracefully: UUID materialises a fresh value at
      // translation time; HASH/ENCRYPT/DECRYPT pass the input through
      // unchanged (caller is responsible for any client-side crypto).
      case 'UUID':
        return crypto.randomUUID();
      // HASH's arg is the value itself; ENCRYPT/DECRYPT wrap it in
      // `{ secret, data }`. Degrade by passing the underlying value
      // through — never index it as an array (it is neither).
      case 'HASH':
        return r(args);
      case 'ENCRYPT':
      case 'DECRYPT':
        return r((args as { data: unknown }).data);

      // LPAD / RPAD have no aggregation equivalent in Mongo. Pass the
      // input string through unchanged — padding is typically a
      // presentation concern the caller can apply post-fetch.
      case 'LPAD':
      case 'RPAD':
        return r((args as { string: unknown }).string);

      default: {
        const t: never = expr;
        throw new DialectUnsupportedError(
          this.Dialect,
          `expression '${(t as { $$_expression: string }).$$_expression}'`,
        );
      }
    }
  }

  /**
   * Translate an OQL Aggregate to a Mongo aggregation `$group` value.
   * Returns the operator object that goes inside `$group: { _id: …, X: <here> }`.
   */
  /** JSON_ROW whose columns ALL reference one $lookup'd join alias —
   * the shape relation projections emit. Returns the alias, or null
   * when the aggregate needs the $group path. */
  #jsonRowLookupAlias(
    agg: unknown,
    joins: Query<'SELECT'>['joins'] | undefined,
  ): string | null {
    const a = agg as {
      $$_aggregate?: string;
      columns?: Record<string, unknown>;
    };
    if (a.$$_aggregate !== 'JSON_ROW' || joins === undefined) return null;
    if (a.columns === undefined) return null;
    let alias: string | null = null;
    for (const source of Object.values(a.columns)) {
      if (typeof source !== 'string') return null;
      const m = source.match(/^@([^.]+)\.@/);
      if (m === null) return null;
      if (alias === null) alias = m[1]!;
      else if (alias !== m[1]) return null;
    }
    return alias !== null && alias in joins ? alias : null;
  }

  #translateAggregate(
    agg: { $$_aggregate: string; [k: string]: unknown },
  ): unknown {
    const ref = (col: unknown): unknown => this.#resolveExpressionRef(col);
    switch (agg.$$_aggregate) {
      case 'COUNT':
        // SQL `COUNT(col)` counts every NON-NULL value, including falsy
        // ones (0, '', false). Test the field for non-null existence, not
        // truthiness: `$ifNull` collapses a missing-or-null field to null,
        // and the outer `$ne` counts everything else. The previous
        // truthiness `$cond` wrongly dropped 0 / '' / false.
        return 'column' in agg
          ? {
            $sum: {
              $cond: [
                { $ne: [{ $ifNull: [ref(agg.column), null] }, null] },
                1,
                0,
              ],
            },
          }
          : { $sum: 1 };
      case 'SUM':
        return { $sum: ref(agg.column) };
      case 'AVG':
        return { $avg: ref(agg.column) };
      case 'MIN':
        return { $min: ref(agg.column) };
      case 'MAX':
        return { $max: ref(agg.column) };
      case 'STRING_AGG': {
        // Mongo has no SQL-style STRING_AGG. Use $push + $reduce as a
        // best effort; clearer to throw and let users build the pipeline
        // explicitly when they need this.
        throw new DialectUnsupportedError(
          this.Dialect,
          `aggregate 'STRING_AGG' (use a custom $push/$reduce pipeline)`,
        );
      }
      case 'ARRAY_AGG':
        return { $push: ref(agg.column) };
      case 'JSON_ROW': {
        // Build per-row object then aggregate via $push.
        const cols = agg.columns as Record<string, unknown>;
        const rowObj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(cols)) {
          rowObj[k] = ref(v);
        }
        return { $push: rowObj };
      }
      default:
        throw new DialectUnsupportedError(
          this.Dialect,
          `aggregate '${agg.$$_aggregate}'`,
        );
    }
  }
}
