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
 * Compatibility notes (full breakdown in `packages/oql/docs/OQL-Compatibility.md`):
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
 * - Deduplication: `SELECT { distinct: true }` throws — Mongo has no
 *   find-level DISTINCT; build a `$group` pipeline explicitly when you
 *   need one. `COUNT { distinct }` counts a `$group`'s distinct set.
 * - `$exists` / `$nexists` filters run as a `$lookup` stage, so a SELECT
 *   or COUNT carrying one is an aggregation pipeline. UPDATE, DELETE and
 *   a partial-index predicate take a query filter, which has no stage to
 *   run the lookup in, so the node throws there.
 *
 * @module translator/MongoTranslator
 */

import type {
  ExistsFilter,
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
import { findExpression } from './findExpression.ts';

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
 * operators (`$set`, and `$setOnInsert` on the upsert path), or is an
 * aggregation pipeline when a value is an expression — pass it through
 * untouched.
 */
export type MongoUpdateAction = {
  sql: 'update';
  params: {
    collection: string;
    filter: Record<string, unknown>;
    data: Record<string, unknown> | Array<Record<string, unknown>>;
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
  update: Record<string, unknown> | Array<Record<string, unknown>>;
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
 * Prefix of the temporary field an `$exists` / `$nexists` lookup writes
 * its result to. A counter is appended per node, a `_` is prepended while
 * a name of the query has it, and the field is unset straight after the
 * `$match` that reads it.
 */
const EXISTS_FIELD = '__exists_';

/**
 * Mongo escape for a value to be inlined inside a regex pattern. Mongo's
 * `$regex` operator interprets the value as a JS regex source.
 */
const REGEX_SPECIALS = /[.*+?^${}()|[\]\\]/g;

/**
 * The replacements that turn a LIKE pattern into a regex source, in order:
 * each {@link REGEX_SPECIALS} character escaped, the backslash first, then
 * the wildcards. A computed pattern runs them as `$replaceAll` stages.
 */
const LIKE_TO_REGEX_STEPS: readonly (readonly [string, string])[] = [
  ...'\\.*+?^${}()|[]'.split('').map((c) => [c, `\\${c}`] as const),
  ['%', '.*'],
  ['_', '.'],
];

/**
 * Filter operators whose value is spliced into a regex pattern. Their
 * operand must be a plain string by the time it reaches
 * `__translateOperator` — anything else is routed or rejected before that.
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
 * The column scope of an INSERT row: its values cannot read a column, so
 * an `@x` string in one is text. The SQL translators pass `[]` there.
 */
const NO_COLUMNS: ReadonlySet<string> = new Set();

/**
 * A column scope carrying the statement's declared expressions. A `where`
 * value `@name` naming one compares that expression's value inside
 * `$expr`, as the SQL translators compare its body.
 */
class ExpressionScope extends Set<string> {
  public readonly expressions: Readonly<Record<string, Expressions>>;

  constructor(
    columns: Iterable<string>,
    expressions: Record<string, Expressions> = {},
  ) {
    super(columns);
    this.expressions = expressions;
  }

  /**
   * The declared expression a `where` key `@name` names. As in SQL it wins
   * over a column of the same name.
   */
  public expressionAt(key: string): Expressions | undefined {
    const name = key.slice(1);
    return Object.hasOwn(this.expressions, name)
      ? this.expressions[name]
      : undefined;
  }
}

/**
 * The column scope of an UPDATE or DELETE. A `where` key naming a declared
 * expression compares its value inside `$expr`, since a query filter sees
 * no computed field. The SQL translators also put the expression keys in
 * the scope, so an `@key` expression argument there names a column the
 * table lacks and the database refuses it; here the translator throws
 * instead.
 */
class WriteScope extends ExpressionScope {}

/**
 * The column scope of a SELECT's `expressions` stage. A CASE condition
 * there may hold `$exists` / `$nexists`: each adds its `$lookup` to
 * `lookups`, written to a field named outside `taken`, for the stage to
 * run first.
 */
class CaseExistsScope extends Set<string> {
  public readonly lookups: Record<string, unknown>[] = [];
  public readonly taken: ReadonlySet<string>;

  constructor(columns: Iterable<string>, taken: ReadonlySet<string>) {
    super(columns);
    this.taken = taken;
  }
}

/**
 * The aggregates whose `distinct` MongoDB has to compute in two steps,
 * each mapped to the expression that reduces the set of a group's distinct
 * values. The set holds one `null` when any row's value was null; SQL's
 * `DISTINCT` aggregates skip it, as `$sum` and `$avg` do by themselves.
 */
const DISTINCT_REDUCERS: Readonly<Record<string, (set: string) => unknown>> = {
  COUNT: (set) => ({ $size: { $setDifference: [set, [null]] } }),
  // `$sum` of no values is 0, SQL's SUM is NULL: `$max` is null exactly then.
  SUM: (set) => ({
    $cond: [{ $gt: [{ $max: set }, null] }, { $sum: set }, null],
  }),
  AVG: (set) => ({ $avg: set }),
};

/**
 * OQL {@link TimeUnit} → Mongo `$dateAdd` unit.
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
 * Width of one month on the calendar-position scale `DATE_DIFF` uses for
 * `MONTHS` / `YEARS`: 32 days in milliseconds, longer than any month. A
 * date's position is its month number times this, plus the milliseconds
 * since that month began, so dividing the difference of two positions by
 * it yields the complete calendar months between them.
 */
const MONTH_SLOT_MS = 2_764_800_000;

/**
 * What `DATE_DIFF` divides by for each {@link TimeUnit}: milliseconds for
 * the fixed-length units, {@link MONTH_SLOT_MS} slots for `MONTHS` /
 * `YEARS`.
 */
const MONGO_DATE_DIFF_DIVISOR: Record<TimeUnit, number> = {
  DAYS: 86_400_000,
  HOURS: 3_600_000,
  MINUTES: 60_000,
  SECONDS: 1_000,
  MONTHS: MONTH_SLOT_MS,
  YEARS: 12 * MONTH_SLOT_MS,
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
   * joins, aggregates, grouping, an `$exists` / `$nexists` filter) —
   * check `action.sql` before reading `params`.
   *
   * @throws {TypeError} When `q` is not a valid `SELECT` query.
   * @throws {@link DialectUnsupportedError} For `distinct`, an
   *   `$exists` / `$nexists` key bound to a joined column, and any other
   *   expression or operator with no Mongo equivalent.
   */
  public select(
    q: Query<'SELECT'>,
  ): MongoFindAction | MongoAggregateAction {
    assertSelect(q);
    return this.__buildSelect(q);
  }

  /**
   * Translate an `INSERT`. There is no `RETURNING` equivalent, so unlike
   * the SQL translators nothing is projected back.
   *
   * @throws {TypeError} When `q` is not a valid `INSERT` query.
   */
  public insert(q: Query<'INSERT'>): MongoInsertAction {
    assertInsert(q);
    const data = q.data;
    return {
      sql: 'insert',
      params: {
        collection: q.table,
        data: this.__renderData(data),
      },
    };
  }

  /**
   * Translate an `INSERT … SELECT`. The pipeline runs over the *source*
   * collection and writes with `$merge`, so `params.collection` is the
   * source, not the insert target — the target appears in the final stage.
   *
   * @throws {TypeError} When `q` is not a valid `INSERT_FROM_QUERY` query.
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
    const inner = this.__buildSelect(q.query as Query<'SELECT'>);
    const sourcePipeline = this.__pipelineFromSelect(inner);
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
   * pipeline — `$match` (filter) → `$sort` → `$project` → `$skip` →
   * `$limit`, matching find's evaluation order (find sorts before it
   * projects). Reached via
   * {@link __pipelineFromSelect} from every path that materialises a SELECT
   * into a pipeline — `insertQuery` (`$merge` source), `createView` and
   * `alterView` (view body) — so a plain-`find` source SELECT keeps its
   * WHERE / projection / sort / limit / skip in all of them.
   */
  private __findToPipeline(find: MongoFindAction): Record<string, unknown>[] {
    const pipeline: Record<string, unknown>[] = [];
    const { filter, options } = find.params;
    if (filter && Object.keys(filter).length > 0) {
      pipeline.push({ $match: filter });
    }
    if (options.sort && Object.keys(options.sort).length > 0) {
      pipeline.push({ $sort: options.sort });
    }
    if (options.projection && Object.keys(options.projection).length > 0) {
      pipeline.push({ $project: options.projection });
    }
    if (options.skip !== undefined) pipeline.push({ $skip: options.skip });
    if (options.limit !== undefined) pipeline.push({ $limit: options.limit });
    return pipeline;
  }

  /**
   * Translate an `UPDATE`. Always `multiple: true`, and a `q.where`-less
   * query yields an empty filter that matches the whole collection. A
   * `where` key naming a declared expression compares inside `$expr`.
   *
   * @throws {TypeError} When `q` is not a valid `UPDATE` query.
   * @throws {@link DialectUnsupportedError} For an `$exists` / `$nexists`
   *   filter — `updateMany` takes a query filter, not a pipeline.
   * @throws {@link OqlError} `INVALID_COLUMN_REF` when an expression
   *   argument names a declared expression, which is no column. A `where`
   *   value naming one compares its value, as a key does.
   */
  public update(q: Query<'UPDATE'>): MongoUpdateAction {
    assertUpdate(q);
    const columns = new WriteScope(this.__columnsOf(q), q.expressions);
    return {
      sql: 'update',
      params: {
        collection: q.table,
        filter: q.where ? this.__translateFilter(q.where, columns) : {},
        data: this.__updateBody(q.data, columns),
        options: { multiple: true },
      },
    };
  }

  /**
   * Translate a `DELETE`. Always `multiple: true`, and a `q.where`-less
   * query yields an empty filter — which deletes every document. A
   * `where` key naming a declared expression compares inside `$expr`.
   *
   * @throws {TypeError} When `q` is not a valid `DELETE` query.
   * @throws {@link DialectUnsupportedError} For an `$exists` / `$nexists`
   *   filter — `deleteMany` takes a query filter, not a pipeline.
   * @throws {@link OqlError} `INVALID_COLUMN_REF` when an expression
   *   argument names a declared expression, which is no column. A `where`
   *   value naming one compares its value, as a key does.
   */
  public delete(q: Query<'DELETE'>): MongoDeleteAction {
    assertDelete(q);
    const columns = new WriteScope(this.__columnsOf(q), q.expressions);
    return {
      sql: 'delete',
      params: {
        collection: q.table,
        filter: q.where ? this.__translateFilter(q.where, columns) : {},
        options: { multiple: true },
      },
    };
  }

  /**
   * Translate an `UPSERT`. A single row becomes an `update` with
   * `upsert: true`; an array of rows becomes a `bulkWrite` — check
   * `action.sql` before reading `params`.
   *
   * @throws {TypeError} When `q` is not a valid `UPSERT` query.
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
    // built by `__buildUpsertOp` either way.
    const conflictKeys = q.conflictKeys.map((k) => k.slice(1));
    const updateOnConflict = q.updateOnConflict?.map((k) => k.slice(1));
    const updateSet = q.updateSet ?? {};
    const columns = this.__columnsOf(q);
    if (Array.isArray(q.data)) {
      const ops: MongoBulkUpsertOp[] = q.data.map((row) =>
        this.__buildUpsertOp(
          row,
          conflictKeys,
          updateOnConflict,
          updateSet,
          columns,
        )
      );
      return {
        sql: 'bulkWrite',
        params: { collection: q.table, ops },
      };
    }
    const { filter, update } = this.__buildUpsertOp(
      q.data,
      conflictKeys,
      updateOnConflict,
      updateSet,
      columns,
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
   * - With `updateSet`, or when any value is an expression, the update is
   *   an aggregation pipeline instead, because only a pipeline evaluates
   *   expressions (a classic `$set` stores `$$NOW` as a string). A new
   *   document is one whose `_id` is still missing, which lets each field
   *   take its insert value on the insert branch and its `updateSet` or
   *   existing value on the conflict branch, as the SQL dialects do.
   *
   * Empty `$set` / `$setOnInsert` operators are omitted because Mongo
   * rejects them.
   */
  private __buildUpsertOp(
    row: Record<string, unknown>,
    conflictKeys: string[],
    updateOnConflict: string[] | undefined,
    updateSet: Record<string, unknown>,
    columns: ReadonlySet<string>,
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
    for (const ck of conflictKeys) filter[ck] = row[ck];
    const copies = (key: string) =>
      updateOnConflict === undefined
        ? !(key in updateSet)
        : updateOnConflict.includes(key);
    const values = [...Object.values(row), ...Object.values(updateSet)];
    if (
      Object.keys(updateSet).length > 0 ||
      values.some((v) => this.__isExpression(v))
    ) {
      const isNew = { $eq: [{ $type: '$_id' }, 'missing'] };
      const set: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) {
        const inserted = this.__pipelineValue(value, NO_COLUMNS);
        if (key in updateSet) {
          set[key] = {
            $cond: [
              isNew,
              inserted,
              this.__pipelineValue(updateSet[key], columns),
            ],
          };
        } else if (!conflictKeys.includes(key) && copies(key)) {
          set[key] = inserted;
        } else {
          set[key] = { $cond: [isNew, inserted, `$${key}`] };
        }
      }
      for (const [key, value] of Object.entries(updateSet)) {
        if (key in row) continue;
        set[key] = {
          $cond: [isNew, '$$REMOVE', this.__pipelineValue(value, columns)],
        };
      }
      return { filter, update: [{ $set: set }] };
    }
    const setBody: Record<string, unknown> = {};
    const insertOnly: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      if (conflictKeys.includes(key)) continue;
      if (copies(key)) {
        setBody[key] = value;
      } else {
        insertOnly[key] = value;
      }
    }
    const update: Record<string, unknown> = {};
    if (Object.keys(setBody).length > 0) update.$set = setBody;
    const setOnInsert = { ...filter, ...insertOnly };
    if (Object.keys(setOnInsert).length > 0) update.$setOnInsert = setOnInsert;
    return { filter, update };
  }

  /**
   * Translate a `COUNT`. A count is a native `count`; with joins,
   * `distinct`, an `$exists` / `$nexists` filter or a filter on a declared
   * expression it is rewritten as a SELECT, as the SQL translators do, and
   * comes back as a pipeline.
   *
   * @throws {TypeError} When `q` is not a valid `COUNT` query.
   */
  public count(
    q: Query<'COUNT'>,
  ): MongoCountAction | MongoFindAction | MongoAggregateAction {
    assertCount(q);
    // Mongo native `count` only supports filter — no pre-count expression
    // chain. Anything else falls back to an aggregate count.
    if (
      q.joins || q.distinct !== undefined || this.__filterHasExists(q.where) ||
      this.__filterReferencesExpressions(q.where, q.expressions)
    ) {
      return this.__buildSelect({
        type: 'SELECT',
        table: q.table,
        schema: q.schema,
        columns: q.columns,
        expressions: q.expressions,
        joins: q.joins,
        where: q.where,
        aggregates: {
          [COUNT_ALIAS]: q.distinct === undefined
            ? { $$_aggregate: 'COUNT' }
            : {
              $$_aggregate: 'COUNT',
              column: `@${String(q.distinct[0])}`,
              distinct: true,
            },
        },
        projection: { [`@${COUNT_ALIAS}`]: true },
      });
    }
    return {
      sql: 'count',
      params: {
        collection: q.table,
        filter: q.where
          ? this.__translateFilter(
            q.where,
            new ExpressionScope(this.__columnsOf(q), q.expressions),
          )
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
   * @throws {TypeError} When `q` is not a valid `CREATE_SCHEMA` query.
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
   *
   * @throws {TypeError} When `q` is not a valid `DROP_SCHEMA` query.
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
   *
   * @throws {TypeError} When `q` is not a valid `CREATE_TABLE` query.
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
   *
   * @throws {TypeError} When `q` is not a valid `ALTER_TABLE` query.
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
   *
   * @throws {TypeError} When `q` is not a valid `DROP_TABLE` query.
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
   *
   * @throws {TypeError} When `q` is not a valid `TRUNCATE` query.
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
   *
   * @throws {TypeError} When `q` is not a valid `CREATE_INDEX` query.
   * @throws {@link DialectUnsupportedError} When `q.where` holds an
   *   expression: a partial filter takes no `$expr`.
   */
  public createIndex(q: Query<'CREATE_INDEX'>): MongoCreateIndexAction {
    assertCreateIndex(q);
    const computed = findExpression(q.where);
    if (computed !== null) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `the computed expression ${computed} in an index predicate`,
      );
    }
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
              partialFilterExpression: this.__translateFilter(
                q.where,
                this.__columnsOf(q),
              ),
            }
            : {}),
        },
      },
    };
  }

  /**
   * Translate a `DROP_INDEX`. `q.ifExists` and `q.cascade` are ignored.
   *
   * @throws {TypeError} When `q` is not a valid `DROP_INDEX` query.
   */
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
   *
   * @throws {TypeError} When `q` is not a valid `CREATE_VIEW` query.
   */
  public createView(q: Query<'CREATE_VIEW'>): MongoCreateViewAction {
    assertCreateView(q);
    void q.materialized; // accepted but not honoured
    const inner = this.__buildSelect(q.query);
    return {
      sql: 'createView',
      params: {
        view: q.view,
        viewOn: inner.params.collection,
        pipeline: this.__pipelineFromSelect(inner),
      },
    };
  }

  /**
   * Translate a `DROP_VIEW`. Emits the same `drop` as
   * {@link MongoTranslator.dropTable} — Mongo makes no distinction, so
   * this will happily drop a plain collection of the same name.
   *
   * @throws {TypeError} When `q` is not a valid `DROP_VIEW` query.
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
   * @throws {TypeError} When `q` is not a valid `ALTER_VIEW` query.
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
      const inner = this.__buildSelect(q.query);
      const newName = q.renameTo ?? q.view;
      out.push({
        sql: 'createView',
        params: {
          view: newName,
          viewOn: inner.params.collection,
          pipeline: this.__pipelineFromSelect(inner),
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
   *
   * @throws {TypeError} When `q` is not a valid `REFRESH_MATERIALIZED_VIEW`
   *   query.
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
   * action it's the full `$match` → `$sort` → `$project` → `$skip` →
   * `$limit` expansion via {@link __findToPipeline}, so the source SELECT's
   * WHERE / projection / sort / limit / skip are all preserved rather than
   * collapsed to a bare `$match` (which dropped the projection — exposing
   * deliberately projected-away columns — the sort and the limit).
   *
   * All three consumers share this single helper so the find-expansion
   * cannot drift out of sync between them again.
   */
  private __pipelineFromSelect(
    inner: MongoFindAction | MongoAggregateAction,
  ): Record<string, unknown>[] {
    if (inner.sql === 'aggregate') return inner.params.pipeline;
    return this.__findToPipeline(inner);
  }

  // =========================================================================
  // Internals
  // =========================================================================

  /**
   * Build the Mongo op for a SELECT. Picks `find` (simple cases) vs
   * `aggregate` (anything that needs a pipeline: joins, aggregates,
   * declared expressions, HAVING, an `$exists` / `$nexists` filter, or
   * projection aliasing — Mongo's native `find().project()` only takes
   * 0/1 includes, no rename).
   */
  private __buildSelect(
    q: Query<'SELECT'>,
  ): MongoFindAction | MongoAggregateAction {
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
      !!q.expressions || !!q.having || hasAlias ||
      this.__filterHasExists(q.where);
    if (!needsPipeline) {
      return this.__buildFind(q);
    }
    return this.__buildAggregate(q);
  }

  /**
   * Map an OQL `orderBy` (`{ '@col': 'ASC' | 'DESC' }`) to a Mongo sort
   * document (`{ col: 1 | -1 }`). Shared by `__buildFind` (as `options.sort`)
   * and `__buildAggregate` (as the `$sort` stage value). A key listed in
   * `joined` sorts on its computed field (see {@link __joinedSorts}).
   */
  private __buildSort(
    orderBy: NonNullable<Query<'SELECT'>['orderBy']>,
    joined: Record<string, [string, string, string]> = {},
  ): Record<string, 1 | -1> {
    return Object.fromEntries(
      Object.entries(orderBy).map(([k, v]) => [
        joined[k]?.[0] ?? k.slice(1).replace('.@', '.'),
        v === 'ASC' ? 1 : -1,
      ]),
    );
  }

  /**
   * For a grouped query, the orderBy keys that name a joined column the
   * query does not project, each mapped to `[field, operator, path]`.
   * Such a column is no group key, so the key sorts on a `field` the
   * `$group` accumulates: the group's smallest value at `path` for `ASC`,
   * its largest for `DESC`, NULLs skipped, as the SQL translators order
   * by MIN / MAX. The field takes a `_` prefix while an aggregate or a
   * projected key has its name, and the inclusion `$project` drops it.
   */
  private __joinedSorts(
    q: Query<'SELECT'>,
    aggregates: Record<string, unknown>,
  ): Record<string, [string, string, string]> {
    const taken = new Set([
      ...Object.keys(aggregates),
      ...Object.keys(q.projection).map((k) => k.slice(1).split('.@')[0]),
    ]);
    const out: Record<string, [string, string, string]> = {};
    Object.entries(q.orderBy ?? {}).forEach(([key, dir], i) => {
      if (key.includes('.@') && !(key in q.projection)) {
        let field = `__sort_${i}`;
        while (taken.has(field)) field = `_${field}`;
        out[key] = [
          field,
          dir === 'ASC' ? '$min' : '$max',
          `$${key.slice(1).replace('.@', '.')}`,
        ];
      }
    });
    return out;
  }

  /**
   * The field names a SELECT's documents can hold: its columns, join
   * aliases, declared expressions, aggregates and projected keys. A
   * temporary field takes a name outside them.
   */
  private __queryNames(q: Query<'SELECT'>): Set<string> {
    return new Set([
      ...(Array.isArray(q.columns) ? q.columns.map(String) : []),
      ...Object.keys(q.joins ?? {}),
      ...Object.keys(q.expressions ?? {}),
      ...Object.keys(q.aggregates ?? {}),
      ...Object.keys(q.projection).map((k) => k.slice(1).split('.@')[0]!),
    ]);
  }

  /** Build a simple `find` op — no joins, no aggregates. */
  private __buildFind(q: Query<'SELECT'>): MongoFindAction {
    const filter = q.where
      ? this.__translateFilter(q.where, this.__columnsOf(q))
      : {};
    // `find` path only fires when projection has no aliasing (see
    // `__buildSelect`), so `__buildProjection`'s output here is purely
    // 0/1 include/exclude. Cast at the type boundary, not inline.
    const projection = this.__buildProjection(q) as Record<string, 0 | 1>;
    const options: MongoFindAction['params']['options'] = {};
    if (Object.keys(projection).length > 0) options.projection = projection;
    if (q.orderBy && Object.keys(q.orderBy).length > 0) {
      options.sort = this.__buildSort(q.orderBy);
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
  private __buildAggregate(q: Query<'SELECT'>): MongoAggregateAction {
    const pipeline: Record<string, unknown>[] = [];
    const columns = this.__columnsOf(q);
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
    // The routing scans (`__filterReferencesJoins` /
    // `__filterReferencesExpressions`) are cheap structural passes over the
    // ORIGINAL `@Alias.@col` filter shape; `__translateFilter` (the actual
    // build) runs in exactly ONE branch, never both.
    const filterTouchesJoins = this.__filterReferencesJoins(q.where, q.joins);
    const filterTouchesExpr = this.__filterReferencesExpressions(
      q.where,
      q.expressions,
    );
    // A RIGHT or FULL join adds rows whose base columns are NULL, and a
    // filter on a base column must see those too.
    const outerJoin = Object.values(q.joins ?? {}).some((def) =>
      def?.type === 'RIGHT' || def?.type === 'FULL'
    );
    const deferMatch = filterTouchesJoins || filterTouchesExpr || outerJoin;
    const whereScope = new ExpressionScope(columns, q.expressions);
    const names = this.__queryNames(q);
    if (q.where && !deferMatch) {
      this.__pushMatch(pipeline, q.where, whereScope, names);
    }
    if (q.joins) {
      for (const [alias, def] of Object.entries(q.joins)) {
        if (!def) continue;
        const lookup = this.__buildLookup(alias, def, columns);
        if (lookup === null) continue;
        const type = def.type ?? 'INNER';
        const rows = pipeline.slice();
        // One row per joined row, as a SQL join returns: the alias holds
        // a single joined document. A row without a match keeps going
        // with the alias missing, its columns NULL, on LEFT and FULL.
        pipeline.push(
          lookup,
          type === 'INNER' || type === 'RIGHT' ? { $unwind: `$${alias}` } : {
            $unwind: { path: `$${alias}`, preserveNullAndEmptyArrays: true },
          },
        );
        if (type === 'RIGHT' || type === 'FULL') {
          pipeline.push(this.__unmatchedJoinRows(q, alias, def, rows, columns));
        }
      }
    }
    if (q.expressions) {
      const addFields: Record<string, unknown> = {};
      const scope = new CaseExistsScope(columns, names);
      for (const [name, expr] of Object.entries(q.expressions)) {
        // A missing result would leave the key out of the row, where SQL
        // has NULL.
        addFields[name] = this.__nullIfMissing(
          this.__translateExpression(expr, scope),
        );
      }
      pipeline.push(...scope.lookups, { $addFields: addFields });
      if (scope.lookups.length > 0) {
        pipeline.push({
          $unset: scope.lookups.map((l) => (l.$lookup as { as: string }).as),
        });
      }
    }
    // Deferred $match — runs AFTER every $lookup (joined rows exist) and
    // AFTER the expressions $addFields (alias fields exist), but BEFORE any
    // $group, mirroring SQL's WHERE-then-GROUP-BY evaluation order.
    if (q.where && deferMatch) {
      this.__pushMatch(pipeline, q.where, whereScope, names);
    }
    const aggregates = this.__aggregatesOf(q);
    const grouped = Object.keys(aggregates).length > 0;
    const joinedSorts = grouped ? this.__joinedSorts(q, aggregates) : {};
    if (grouped) {
      const groupId: Record<string, unknown> = {};
      const groupBody: Record<string, unknown> = { _id: groupId };
      const groupedKeys: string[] = [];
      // Auto-GROUP-BY: every projection key not in aggregates is
      // grouped.
      for (const key of Object.keys(q.projection)) {
        const stripped = key.slice(1);
        if (stripped in aggregates) continue;
        if (q.joins && stripped in q.joins) continue;
        // A group key name takes no `.`, so a joined column nests under
        // its alias, `_id.o.sku`, and is put back at `o.sku` below.
        // Nested, a missing value groups apart from null unless made null.
        const path = stripped.replace('.@', '.');
        const [head, sub] = path.split('.');
        groupId[head!] = sub === undefined ? `$${path}` : {
          ...groupId[head!] as object,
          [sub]: { $ifNull: [`$${path}`, null] },
        };
        groupedKeys.push(path);
      }
      const flatten: Record<string, unknown> = {};
      // What each `$group` field holds over no rows at all.
      const empty: Record<string, unknown> = { _id: groupId };
      for (const [name, agg] of Object.entries(aggregates)) {
        const { $$_aggregate: fn, column, distinct } = agg as {
          $$_aggregate: string;
          column?: unknown;
          distinct?: boolean;
        };
        const reduce = distinct === true ? DISTINCT_REDUCERS[fn] : undefined;
        if (reduce !== undefined) {
          // `$group` has no DISTINCT accumulator: collect the group's
          // distinct values, then reduce that set once the group is built.
          groupBody[name] = {
            $addToSet: this.__columnRef(column, columns),
          };
          flatten[name] = reduce(`$${name}`);
          empty[name] = [];
          continue;
        }
        // deno-lint-ignore no-explicit-any
        groupBody[name] = this.__translateAggregate(agg as any, columns);
        empty[name] = fn === 'COUNT' ? 0 : null;
        if (fn === 'STRING_AGG') {
          // SQL skips NULL and gives NULL when nothing is left.
          const separator = (agg as { separator?: string }).separator ?? ',';
          flatten[name] = {
            $reduce: {
              input: {
                $filter: { input: `$${name}`, cond: { $ne: ['$$this', null] } },
              },
              initialValue: null,
              in: {
                $cond: [
                  { $eq: ['$$value', null] },
                  '$$this',
                  {
                    $concat: [
                      '$$value',
                      this.__expressionLiteral(separator),
                      '$$this',
                    ],
                  },
                ],
              },
            },
          };
        }
        if (fn === 'SUM') {
          // `$sum` of no values is 0, SQL's SUM is NULL. The largest
          // value is null exactly then, so it rides along to tell.
          let seen = `__sum_${name}`;
          while (seen in aggregates) seen = `_${seen}`;
          groupBody[seen] = { $max: this.__columnRef(column, columns) };
          flatten[name] = {
            $cond: [{ $gt: [`$${seen}`, null] }, `$${name}`, null],
          };
        }
      }
      // An unprojected joined column is no group key, so its sort value
      // is accumulated in the group.
      for (const [field, op, path] of Object.values(joinedSorts)) {
        groupBody[field] = { [op]: path };
      }
      if (groupedKeys.length > 0) {
        pipeline.push({ $group: groupBody });
      } else {
        // Without a group key SQL returns one row even when no row
        // matched, and `$group` returns none. `$facet` always emits one
        // document, holding the group's row or nothing.
        pipeline.push(
          { $facet: { rows: [{ $group: groupBody }] } },
          {
            $replaceRoot: {
              newRoot: {
                $ifNull: [{ $arrayElemAt: ['$rows', 0] }, {
                  $literal: empty,
                }],
              },
            },
          },
        );
      }
      // After $group, grouped fields live under `_id.<key>`. Flatten
      // them back to their own paths so the subsequent $match / $sort /
      // $project read them as before the group.
      for (const key of groupedKeys) flatten[key] = `$_id.${key}`;
      if (Object.keys(flatten).length > 0) {
        pipeline.push({ $addFields: flatten });
      }
    }
    if (q.having) {
      // After `$group` each aggregate is a field, so a value naming one
      // reads it, as a key does.
      this.__pushMatch(
        pipeline,
        q.having,
        new Set([...columns, ...Object.keys(aggregates)]),
        names,
      );
    }
    // $sort before $project: orderBy names source fields, which an
    // alias or an unprojected column would no longer have after it.
    if (q.orderBy && Object.keys(q.orderBy).length > 0) {
      pipeline.push({ $sort: this.__buildSort(q.orderBy, joinedSorts) });
    }
    const projection = this.__buildProjection(q);
    if (Object.keys(projection).length > 0) {
      pipeline.push({ $project: projection });
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
   * NULL follows SQL in both forms: a column or Expression pair matches
   * a null or missing field only when its key is listed in `nullSafe`.
   *
   * Returns `null` for an empty `on` (nothing to correlate on).
   */
  private __buildLookup(
    alias: string,
    def: NonNullable<NonNullable<Query<'SELECT'>['joins']>[string]>,
    columns: ReadonlySet<string>,
  ): Record<string, unknown> | null {
    const onEntries = Object.entries(def.on);
    if (onEntries.length === 0) return null;
    const from = String(def.table);
    const nullSafe = (def.nullSafe ?? []) as string[];

    if (onEntries.length === 1) {
      const [key, value] = onEntries[0]!;
      const [joined, other] = this.__joinPair(key, value, alias);
      const localField = this.__joinedColumn(other, alias) === null
        ? this.__joinLocalPath(other)
        : null;
      if (joined !== null && localField !== null) {
        const lookup: Record<string, unknown> = {
          from,
          localField,
          foreignField: joined,
        };
        // On its own this form is NULL-safe: a null or missing local
        // field matches every null or missing foreign field. Plain
        // equality never matches NULL, so those foreign rows are dropped.
        if (!nullSafe.includes(key)) {
          lookup.pipeline = [{ $match: { [joined]: { $ne: null } } }];
        }
        lookup.as = alias;
        return { $lookup: lookup };
      }
    }

    // General form. `let` variable names must be valid Mongo variable
    // identifiers (lowercase-initial, alphanumeric), so they're generated
    // positionally rather than derived from the field path.
    const letVars: Record<string, unknown> = {};
    const conditions = this.__joinConditions(
      alias,
      def,
      columns,
      (operand) => {
        const varName = `v${Object.keys(letVars).length}`;
        letVars[varName] = operand;
        return `$$${varName}`;
      },
      (field) => `$${field}`,
    );
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
   * The `$unionWith` stage that adds a RIGHT or FULL join's rows without
   * a match: each document of the joined collection that no row of
   * `rows`, the stages of the joins before it, meets the `on` map with.
   * The document sits under its alias as on a matched row, and every
   * base column is NULL.
   */
  private __unmatchedJoinRows(
    q: Query<'SELECT'>,
    alias: string,
    def: NonNullable<NonNullable<Query<'SELECT'>['joins']>[string]>,
    rows: Record<string, unknown>[],
    columns: ReadonlySet<string>,
  ): Record<string, unknown> {
    let matches = '__matches';
    while (matches === alias) matches = `_${matches}`;
    const conditions = this.__joinConditions(
      alias,
      def,
      columns,
      (operand) => operand,
      (field) => `$$joined.${field}`,
    );
    const base = Array.isArray(q.columns) ? q.columns.map(String) : [];
    return {
      $unionWith: {
        coll: String(def.table),
        pipeline: [
          { $replaceRoot: { newRoot: { [alias]: '$$ROOT' } } },
          {
            $lookup: {
              from: q.table,
              let: { joined: `$${alias}` },
              pipeline: [...rows, {
                $match: {
                  $expr: conditions.length === 1
                    ? conditions[0]
                    : { $and: conditions },
                },
              }, { $limit: 1 }],
              as: matches,
            },
          },
          { $match: { [matches]: { $size: 0 } } },
          {
            $replaceRoot: {
              newRoot: {
                ...Object.fromEntries(base.map((column) => [column, null])),
                [alias]: `$${alias}`,
              },
            },
          },
        ],
      },
    };
  }

  /**
   * The `$expr` conditions of a join's `on` map, one or two per entry.
   * `outer` turns an operand read from the outer row, a `$path` or a
   * translated Expression, into what the conditions use, and `joined`
   * turns a column of the joined collection into its operand.
   */
  private __joinConditions(
    alias: string,
    def: NonNullable<NonNullable<Query<'SELECT'>['joins']>[string]>,
    columns: ReadonlySet<string>,
    outer: (operand: unknown) => unknown,
    joined: (field: string) => string,
  ): unknown[] {
    const nullSafe = (def.nullSafe ?? []) as string[];
    const conditions: unknown[] = [];
    for (const [key, value] of Object.entries(def.on)) {
      const [field, other] = this.__joinPair(key, value, alias);
      const left = field !== null
        ? joined(field)
        : outer(`$${this.__joinLocalPath(key)}`);
      const otherField = this.__joinedColumn(other, alias);
      const localPath = this.__joinLocalPath(other);
      if (otherField !== null) {
        conditions.push(
          ...this.__keyEquals(left, joined(otherField), nullSafe.includes(key)),
        );
        continue;
      }
      if (localPath !== null || this.__isExpressionNode(other)) {
        const right = outer(
          localPath !== null
            ? `$${localPath}`
            : this.__translateExpression(other as Expressions, columns),
        );
        conditions.push(
          ...this.__keyEquals(left, right, nullSafe.includes(key)),
        );
        continue;
      }
      // null is a NULL check: like SQL's IS NULL, it matches a missing
      // field too, which aggregation `$eq` would not.
      if (other === null) {
        conditions.push({ $in: [{ $type: left }, ['null', 'missing']] });
        continue;
      }
      // Literal — a constant condition on the joined collection.
      conditions.push({ $eq: [left, this.__expressionLiteral(other)] });
    }
    return conditions;
  }

  /**
   * One `on` entry as `[joined column, other side]`. SQL takes the
   * joined column on either side, so a key naming an outer column and
   * a value naming the joined one swap. With neither side naming the
   * joined collection, the joined column is `null` and the key stays
   * an outer column compared with the value.
   */
  private __joinPair(
    key: string,
    value: unknown,
    alias: string,
  ): [string | null, unknown] {
    const keyField = this.__joinedColumn(key, alias);
    if (keyField !== null) return [keyField, value];
    const valueField = this.__joinedColumn(value, alias);
    if (valueField !== null) return [valueField, key];
    return [null, value];
  }

  /**
   * The `$expr` conditions that equate two operands the way SQL equates
   * two columns.
   */
  private __keyEquals(
    left: unknown,
    right: unknown,
    nullSafe: boolean,
  ): unknown[] {
    if (nullSafe) {
      // `$ifNull` folds a missing field into null, so null and
      // missing all compare equal — SQL has only the one NULL.
      return [{
        $eq: [{ $ifNull: [left, null] }, { $ifNull: [right, null] }],
      }];
    }
    // Aggregation `$eq` holds null equal to null (and missing to
    // missing), which SQL `=` never does. `$gt: null` is true for
    // every value except null and missing.
    return [{ $eq: [left, right] }, { $gt: [left, null] }];
  }

  /**
   * Build the `$lookup` stage for one `$exists` / `$nexists` node: the
   * first document of `spec.table` that meets the `on` conditions and
   * the sub-`where`, written to `as` as a one-element array, or an
   * empty array when there is none.
   *
   * `on` values resolve against `columns`, the outer scope, exactly as
   * the SQL translators resolve them: a column reference is bound in
   * `let`, a joined column included, as it holds the value of the
   * unwound row, and anything else is data. The sub-`where` sees the
   * subquery table alone, so no outer column is in scope there.
   *
   * @throws {DialectUnsupportedError} For a node in the sub-`where` whose
   *   `on` value is a bare `@name`: on SQL that is a column of this
   *   subquery's table, which this translator does not correlate.
   */
  private __buildExistsLookup(
    spec: ExistsFilter,
    as: string,
    columns: ReadonlySet<string>,
  ): Record<string, unknown> {
    const nullSafe = (spec.nullSafe ?? []) as string[];
    const letVars: Record<string, unknown> = {};
    const conditions: unknown[] = [];
    for (const [key, value] of Object.entries(spec.on)) {
      const foreignField = `$${key.slice(1)}`;
      const outer = this.__valueFieldRef(value, columns);
      if (outer !== null) {
        const varName = `v${Object.keys(letVars).length}`;
        letVars[varName] = outer;
        conditions.push(
          ...this.__keyEquals(
            foreignField,
            `$$${varName}`,
            nullSafe.includes(key),
          ),
        );
        continue;
      }
      conditions.push(
        value === null
          ? { $in: [{ $type: foreignField }, ['null', 'missing']] }
          : { $eq: [foreignField, this.__expressionLiteral(value)] },
      );
    }
    const pipeline: Record<string, unknown>[] = [{
      $match: {
        $expr: conditions.length === 1 ? conditions[0] : { $and: conditions },
      },
    }];
    if (spec.where) {
      this.__refuseParentCorrelation(spec.where);
      this.__pushMatch(
        pipeline,
        spec.where,
        new Set(),
        this.__filterColumns(spec.where),
      );
    }
    pipeline.push({ $limit: 1 });
    const lookup: Record<string, unknown> = { from: spec.table };
    if (Object.keys(letVars).length > 0) lookup.let = letVars;
    lookup.pipeline = pipeline;
    lookup.as = as;
    return { $lookup: lookup };
  }

  /**
   * Throw for an `$exists` / `$nexists` node directly in `where`, or in
   * its `$and` / `$or`, whose `on` value is a bare `@name`.
   */
  private __refuseParentCorrelation(where: QueryFilter): void {
    for (const [key, value] of Object.entries(where)) {
      if (key === '$and' || key === '$or') {
        for (const f of value as QueryFilter[]) {
          this.__refuseParentCorrelation(f);
        }
      } else if (key === '$exists' || key === '$nexists') {
        for (const v of Object.values((value as ExistsFilter).on)) {
          if (typeof v === 'string' && /^@[a-zA-Z_]\w*$/.test(v)) {
            throw new DialectUnsupportedError(
              this.Dialect,
              `a nested '${key}' correlated to its parent subquery by '${v}'`,
            );
          }
        }
      }
    }
  }

  /**
   * The joined collection's field an `on` key or value names
   * (`'@Alias.@userId'` → `'userId'`), or `null` when it names no
   * column of `alias`.
   */
  private __joinedColumn(ref: unknown, alias: string): string | null {
    const prefix = `@${alias}.@`;
    return typeof ref === 'string' && ref.startsWith(prefix)
      ? ref.slice(prefix.length)
      : null;
  }

  /**
   * The local-side field path from an `on` value, or `null` when the
   * value isn't a column reference (literal / `null` / Expression).
   *
   * Unlike a filter value position, a join `on` value that starts with
   * `@` is a column reference by construction — the assert layer has
   * already validated it against the declared column lists.
   */
  private __joinLocalPath(value: unknown): string | null {
    if (typeof value !== 'string' || !value.startsWith('@')) return null;
    return value.slice(1).replace('.@', '.');
  }

  /** Structural check for an OQL Expression node. */
  private __isExpressionNode(value: unknown): boolean {
    return typeof value === 'object' && value !== null &&
      !(value instanceof Date) && !Array.isArray(value) &&
      '$$_expression' in value;
  }

  /**
   * Build a Mongo `projection` document from OQL projection. `1` for
   * include, `0` for exclude. Aliases use `$expr` rename via $project's
   * `{ alias: '$source' }` form. `_id` is left out unless projected.
   */
  private __buildProjection(q: Query<'SELECT'>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(q.projection)) {
      const stripped = key.slice(1);
      const source = stripped.replace('.@', '.');
      const [alias, column] = stripped.split('.@');
      if (column !== undefined && q.joins?.[alias!]) {
        // A joined column is a key of its own, named as SQL names it, and
        // NULL when the row has no joined row.
        out[typeof value === 'string' ? value : column] = {
          $ifNull: [`$${source}`, null],
        };
        continue;
      }
      if (typeof value === 'string') {
        // Alias: { aliasName: '$source.path' }
        out[value] = `$${source}`;
      } else {
        out[source] = 1;
      }
    }
    // A row holds the keys the query projects, as on SQL, so the
    // document's own `_id`, or a group key, stays out of it.
    if (!Object.prototype.hasOwnProperty.call(out, '_id')) out._id = 0;
    return out;
  }

  /**
   * Build the body of an INSERT — single document or array. An insert
   * document cannot evaluate expressions, so clock expressions and UUID
   * are computed here, one instant per statement like SQL's `NOW`.
   */
  private __renderData(
    data: Record<string, unknown> | Array<Record<string, unknown>>,
  ): Record<string, unknown> | Array<Record<string, unknown>> {
    const now = new Date();
    const render = (row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        out[k] = this.__insertValue(k, v, now);
      }
      return out;
    };
    return Array.isArray(data) ? data.map(render) : render(data);
  }

  /**
   * One INSERT value: literals pass through, clock expressions and UUID
   * are computed at `now`.
   *
   * @throws {@link DialectUnsupportedError} For any other expression.
   */
  private __insertValue(column: string, value: unknown, now: Date): unknown {
    if (!this.__isExpression(value)) return value ?? null;
    const expr = value as Expressions;
    switch (expr.$$_expression) {
      case 'NOW':
      case 'CURRENT_TIMESTAMP':
      case 'CURRENT_TIMESTAMPTZ':
        return now;
      case 'CURRENT_TIME':
        return now.toISOString().slice(11, 19);
      case 'CURRENT_DATE':
        return new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        );
      case 'UNIX_TIMESTAMP':
        return this.__unixTimestampUnit(expr) === 'milliseconds'
          ? now.getTime()
          : Math.floor(now.getTime() / 1000);
      case 'UUID':
        return crypto.randomUUID();
      default:
        throw new DialectUnsupportedError(
          this.Dialect,
          `INSERT value for '${column}' is the expression '${expr.$$_expression}', which a Mongo insert document cannot evaluate. Compute it in the application; only NOW, CURRENT_TIMESTAMP(TZ), CURRENT_DATE, CURRENT_TIME, UNIX_TIMESTAMP and UUID are computed at insert.`,
        );
    }
  }

  /**
   * An UPDATE body: a classic `$set` for plain values, or a pipeline
   * `$set` when any value is an expression, which only a pipeline
   * evaluates.
   */
  private __updateBody(
    data: Record<string, unknown>,
    columns: ReadonlySet<string>,
  ): Record<string, unknown> | Array<Record<string, unknown>> {
    if (!Object.values(data).some((v) => this.__isExpression(v))) {
      return { $set: this.__translateUpdateBody(data, columns) };
    }
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      set[k] = this.__pipelineValue(v, columns);
    }
    return [{ $set: set }];
  }

  /** Is `v` an OQL expression node? */
  private __isExpression(v: unknown): boolean {
    return typeof v === 'object' && v !== null && !(v instanceof Date) &&
      '$$_expression' in v;
  }

  /**
   * A value inside a pipeline stage. Expressions translate; literals are
   * wrapped in `$literal`, so a string starting with `$` or a plain
   * object is never read as a field path or an operator.
   */
  private __pipelineValue(
    value: unknown,
    columns: ReadonlySet<string>,
  ): unknown {
    if (value === null || value === undefined) return null;
    if (this.__isExpression(value)) {
      return this.__translateExpression(value as Expressions, columns);
    }
    return { $literal: value };
  }

  /** Translate UPDATE `data` to a Mongo-flat `$set` body. */
  private __translateUpdateBody(
    data: Record<string, unknown>,
    columns: ReadonlySet<string>,
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data)) {
      out[k] = this.__renderValue(v, columns);
    }
    return out;
  }

  /**
   * Render a single primitive / Date / Expression value into the form
   * Mongo expects in the operation body. Most primitives pass through;
   * Expressions become Mongo aggregation operators.
   */
  private __renderValue(
    value: unknown,
    columns: ReadonlySet<string>,
  ): unknown {
    if (value === null || value === undefined) return null;
    if (
      typeof value === 'object' &&
      !(value instanceof Date) &&
      '$$_expression' in value
    ) {
      return this.__translateExpression(value as Expressions, columns);
    }
    return value;
  }

  /**
   * Walk a filter and return `true` if it references one of the supplied
   * join aliases — `'@<Alias>.@<col>'` — in EITHER position:
   *   - a filter KEY (`{ '@Author.@name': … }`), or
   *   - a VALUE (`{ '@createdAt': { $gt: '@Author.@joinedAt' } }`).
   * Both need the joined row to exist, so the aggregate builder uses
   * this to run `$match` AFTER `$lookup`. Scanning only keys (the original
   * bug) routed a value-position joined ref to the early `$match`, where
   * the missing path sorts below all BSON types and the comparison
   * silently matched every document.
   */
  private __filterReferencesJoins(
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
   * Walk a filter and return `true` if any key or value references a
   * declared expression alias (`@<exprName>`). Such a key must be matched
   * AFTER the `$addFields` expressions stage materialises the field — the
   * aggregate builder uses this to defer the `$match`. A value compares the
   * expression itself, and is deferred with the keys.
   */
  private __filterReferencesExpressions(
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
        // Or a value naming one, alone, in a list or under an operator.
        const named = (v: unknown): boolean =>
          (typeof v === 'string' && v.startsWith('@') &&
            names.has(v.slice(1))) ||
          (Array.isArray(v) && v.some(named));
        if (
          named(value) || (typeof value === 'object' && value !== null &&
            Object.values(value).some(named))
        ) return true;
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
  private __columnsOf(
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
   *
   * @throws {@link OqlError} `INVALID_COLUMN_REF` when the string names a
   *   declared expression of an UPDATE or DELETE.
   */
  private __valueFieldRef(
    value: unknown,
    columns: ReadonlySet<string>,
  ): string | null {
    if (typeof value !== 'string' || !value.startsWith('@')) return null;
    const path = value.slice(1).replace('.@', '.');
    this.__assertNotExpression(value, path, columns);
    return columns.has(path) ? `$${path}` : null;
  }

  /**
   * Refuse an `@` value or expression argument of an UPDATE or DELETE that
   * names one of its declared expressions rather than a column. SQL reads
   * it as a column the table lacks and the database fails; MongoDB would
   * compare or store the text.
   *
   * @throws {@link OqlError} `INVALID_COLUMN_REF` for such a reference.
   */
  private __assertNotExpression(
    ref: string,
    path: string,
    columns: ReadonlySet<string>,
  ): void {
    if (
      columns instanceof WriteScope && !columns.has(path) &&
      columns.expressionAt(ref) !== undefined
    ) {
      throw new OqlError(
        `'${ref}' names the declared expression '${path}', not a column: an UPDATE or DELETE reads only columns in a value or an expression argument`,
        { code: 'INVALID_COLUMN_REF', dialect: this.Dialect, ref },
      );
    }
  }

  /**
   * True when a filter carries an `$exists` / `$nexists` node, at any
   * `$and` / `$or` depth.
   */
  private __filterHasExists(filter: QueryFilter | undefined): boolean {
    return filter !== undefined &&
      Object.entries(filter).some(([key, value]) =>
        key === '$exists' || key === '$nexists' ||
        ((key === '$and' || key === '$or') &&
          (value as QueryFilter[]).some((f) => this.__filterHasExists(f)))
      );
  }

  /**
   * Append a filter to a pipeline as a `$match`. Each `$exists` /
   * `$nexists` node in it adds a `$lookup` ahead of the `$match` and its
   * temporary field, named outside `taken`, to the `$unset` after it, so
   * later stages see the documents as they were.
   */
  private __pushMatch(
    pipeline: Record<string, unknown>[],
    filter: QueryFilter,
    columns: ReadonlySet<string>,
    taken: ReadonlySet<string>,
  ): void {
    const lookups: Record<string, unknown>[] = [];
    const match = this.__translateFilter(filter, columns, lookups, taken);
    pipeline.push(...lookups, { $match: match });
    if (lookups.length > 0) {
      pipeline.push({
        $unset: lookups.map((l) => (l.$lookup as { as: string }).as),
      });
    }
  }

  /**
   * The column names a filter's keys name, at any `$and` / `$or` depth:
   * a JSON path or a joined column by its first segment.
   */
  private __filterColumns(filter: QueryFilter): Set<string> {
    const out = new Set<string>();
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and' || key === '$or') {
        for (const sub of value as QueryFilter[]) {
          this.__filterColumns(sub).forEach((c) => out.add(c));
        }
      } else if (key.startsWith('@')) {
        out.add(key.slice(1).split('.@')[0]!);
      }
    }
    return out;
  }

  /**
   * Translate an OQL `QueryFilter` to a Mongo filter document.
   *
   * `$and` / `$or` become Mongo `$and` / `$or` arrays. Per-column
   * conditions translate via {@link __translateColumnCondition}. An
   * `$exists` / `$nexists` node becomes a test on a temporary field,
   * and the `$lookup` that fills the field is appended to
   * `existsLookups` for the caller to run first.
   *
   * @throws {DialectUnsupportedError} For an `$exists` / `$nexists` node
   *   when no `existsLookups` is passed — the filter is not headed for a
   *   pipeline.
   */
  private __translateFilter(
    filter: QueryFilter,
    columns: ReadonlySet<string> = new Set(),
    existsLookups?: Record<string, unknown>[],
    taken: ReadonlySet<string> = new Set(),
  ): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];
    let merged: Record<string, unknown> = {};
    // `$expr` clauses (column-to-column comparisons) are top-level siblings,
    // not per-field specs, so collect and combine them under one `$expr`.
    const exprs: unknown[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$exists' || key === '$nexists') {
        // OQL's `$exists` is a correlated EXISTS *subquery* — not
        // Mongo's field-existence `$exists` operator. It needs a
        // `$lookup` stage, which a plain query filter cannot carry.
        if (existsLookups === undefined) {
          throw new DialectUnsupportedError(
            this.Dialect,
            `filter operator '${key}' outside a SELECT or COUNT (it runs as a $lookup stage, which a query filter cannot carry)`,
          );
        }
        let field = `${EXISTS_FIELD}${existsLookups.length}`;
        while (taken.has(field)) field = `_${field}`;
        existsLookups.push(
          this.__buildExistsLookup(value as ExistsFilter, field, columns),
        );
        merged = {
          ...merged,
          [field]: key === '$exists' ? { $ne: [] } : { $size: 0 },
        };
        continue;
      }
      if (key === '$and') {
        const subs = (value as QueryFilter[]).map((f) =>
          this.__translateFilter(f, columns, existsLookups, taken)
        );
        conditions.push({ $and: subs });
        continue;
      }
      if (key === '$or') {
        const subs = (value as QueryFilter[]).map((f) =>
          this.__translateFilter(f, columns, existsLookups, taken)
        );
        conditions.push({ $or: subs });
        continue;
      }
      const declared = columns instanceof WriteScope
        ? columns.expressionAt(key)
        : undefined;
      if (declared !== undefined) {
        const field = this.__translateExpression(declared, columns);
        exprs.push(...this.__aliasConditions(field, value, columns));
        continue;
      }
      // Per-column condition; key looks like `@col`, `@Alias.@col`, or a
      // JSON path `@col.@key` (deeper allowed). All resolve to Mongo's
      // native dotted-path syntax; JSON paths additionally get the
      // restricted operator set policed.
      const fieldPath = this.__filterFieldPath(key, value, columns);
      const { spec, exprs: colExprs, clashes } = this
        .__translateColumnCondition(fieldPath, value as Operators, columns);
      merged = { ...merged, ...spec };
      exprs.push(...colExprs);
      conditions.push(...clashes);
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
  private __filterFieldPath(
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
   * column references (`@otherCol`), and `clashes`: per-field specs kept
   * out of `spec` because two OQL operators translate to the same Mongo
   * key, each to be ANDed beside it. A column reference, and for the
   * pattern operators an Expression, compares inside `$expr`.
   */
  private __translateColumnCondition(
    fieldPath: string,
    rhs: Operators,
    columns: ReadonlySet<string>,
  ): {
    spec: Record<string, unknown>;
    exprs: unknown[];
    clashes: Record<string, unknown>[];
  } {
    const exprs: unknown[] = [];
    const clashes: Record<string, unknown>[] = [];
    const lhs = `$${fieldPath}`;
    if (rhs === null) return { spec: { [fieldPath]: null }, exprs, clashes };
    if (this.__namesExpression(rhs, columns)) {
      exprs.push(...this.__aliasConditions(lhs, rhs, columns));
      return { spec: {}, exprs, clashes };
    }
    if (Array.isArray(rhs)) {
      // Implicit $in. A column ref inside the list compares in `$expr`.
      if (rhs.some((el) => this.__valueFieldRef(el, columns) !== null)) {
        exprs.push(this.__conditionToExpr(lhs, '$in', rhs, columns));
        return { spec: {}, exprs, clashes };
      }
      return { spec: { [fieldPath]: { $in: rhs } }, exprs, clashes };
    }
    if (typeof rhs !== 'object' || rhs instanceof Date) {
      const ref = this.__valueFieldRef(rhs, columns);
      if (ref !== null) {
        exprs.push(this.__notNull({ $eq: [lhs, ref] }, lhs, ref));
        return { spec: {}, exprs, clashes };
      }
      return { spec: { [fieldPath]: rhs }, exprs, clashes };
    }
    // Multiple operators on the same field merge into a single
    // `{ field: { $op1: …, $op2: … } }` document — deep-merge the inner spec.
    const out: Record<string, unknown> = {};
    // Literal `$ne` / `$nin` values, emitted together as one `$nin`.
    const excluded: unknown[] = [];
    const mergeLiteral = (fragment: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(fragment)) {
        if (
          out[k] !== undefined &&
          typeof out[k] === 'object' && out[k] !== null &&
          !Array.isArray(out[k]) &&
          typeof v === 'object' && v !== null && !Array.isArray(v)
        ) {
          // `$between` and `$gte` both emit `$gte`, two patterns both
          // emit `$regex`: merged, the later would replace the earlier.
          if (Object.keys(v).some((key) => key in (out[k] as object))) {
            clashes.push({ [k]: v });
            continue;
          }
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
        const ref = this.__valueFieldRef(val, columns);
        if (ref !== null) {
          exprs.push(this.__notNull({ [op]: [lhs, ref] }, lhs, ref));
          continue;
        }
        // A computed operand has no per-field form — left there it is a
        // literal document nothing equals — so it compares inside `$expr`.
        if (this.__isExpressionNode(val)) {
          const operand = this.__translateExpression(
            val as Expressions,
            columns,
          );
          exprs.push(this.__notNull({ [op]: [lhs, operand] }, lhs, operand));
          continue;
        }
        if (op === '$ne') {
          excluded.push(val);
          continue;
        }
      } else if (op === '$between') {
        const [lo, hi] = val as [unknown, unknown];
        const loRef = this.__valueFieldRef(lo, columns);
        const hiRef = this.__valueFieldRef(hi, columns);
        if (loRef !== null || hiRef !== null) {
          exprs.push(this.__notNull(
            {
              $and: [
                { $gte: [lhs, loRef ?? this.__expressionLiteral(lo)] },
                { $lte: [lhs, hiRef ?? this.__expressionLiteral(hi)] },
              ],
            },
            lhs,
            ...[loRef, hiRef].filter((ref) => ref !== null),
          ));
          continue;
        }
      } else if (
        op === '$in' || op === '$nin' || op === '$like' || op === '$nlike' ||
        op === '$ilike' || op === '$nilike' || op === '$startsWith' ||
        op === '$endsWith' || op === '$contains'
      ) {
        // A column, or for the pattern operators an Expression, has no
        // per-field form, so it compares inside `$expr`. `$in` and `$nin`
        // take primitive arrays only, no Expression.
        const computed = (op === '$in' || op === '$nin')
          ? (val as unknown[]).some((el) =>
            this.__valueFieldRef(el, columns) !== null
          )
          : this.__valueFieldRef(val, columns) !== null ||
            this.__isExpressionNode(val);
        if (computed) {
          exprs.push(this.__conditionToExpr(lhs, op, val, columns));
          continue;
        }
        if (op === '$nin') {
          excluded.push(...(val as unknown[]));
          continue;
        }
      } else if (op === '$null' && val && Object.keys(rhs).length > 1) {
        // The bare `{ field: null }` spec and another operator's document
        // would replace one another, so beside one it goes in `$expr`.
        exprs.push({ $in: [{ $type: lhs }, ['null', 'missing']] });
        continue;
      }
      mergeLiteral(this.__translateOperator(fieldPath, op, val));
    }
    // Mongo's `$ne` / `$nin` also match a null or missing field, which
    // SQL's `<>` / `NOT IN` never do. Listing null among the excluded
    // values drops those documents.
    if (excluded.length > 0) {
      mergeLiteral({ [fieldPath]: { $nin: [...excluded, null] } });
    }
    return { spec: out, exprs, clashes };
  }

  /**
   * Whether a filter value holds an `@name` naming one of the declared
   * expressions of `columns`, alone, in a list or as an operator's value.
   */
  private __namesExpression(
    value: unknown,
    columns: ReadonlySet<string>,
  ): boolean {
    if (!(columns instanceof ExpressionScope)) return false;
    const names = (v: unknown): boolean =>
      typeof v === 'string' && v.startsWith('@') &&
      columns.expressionAt(v) !== undefined;
    const inList = (v: unknown) => Array.isArray(v) ? v.some(names) : names(v);
    return inList(value) ||
      (typeof value === 'object' && value !== null &&
        Object.values(value).some(inList));
  }

  /**
   * The `$expr` comparisons of `field` against a filter value, each
   * `@name` naming a declared expression of `columns` replaced by that
   * expression, so it compares the expression's value.
   */
  private __aliasConditions(
    field: unknown,
    value: unknown,
    columns: ReadonlySet<string>,
  ): unknown[] {
    const node = (v: unknown): unknown =>
      columns instanceof ExpressionScope && typeof v === 'string' &&
        v.startsWith('@')
        ? columns.expressionAt(v) ?? v
        : v;
    return Object.entries(this.__conditionOps(value)).map(([op, operand]) =>
      this.__conditionToExpr(
        field,
        op,
        Array.isArray(operand) ? operand.map(node) : node(operand),
        columns,
      )
    );
  }

  /**
   * AND a `$expr` comparison with a guard per operand that is true only
   * for a value that is neither null nor missing. BSON orders both below
   * every other value and holds them equal to each other, so an
   * unguarded comparison matches documents SQL's would not: `NULL`
   * compared with anything is never true there.
   */
  private __notNull(comparison: unknown, ...operands: unknown[]): unknown {
    return {
      $and: [comparison, ...operands.map((o) => ({ $gt: [o, null] }))],
    };
  }

  /**
   * Translate a pattern operator whose value is computed, a column or an
   * OQL Expression already translated to `operand`, into an aggregation
   * `$expr` fragment.
   *
   * `$startsWith` / `$endsWith` / `$contains` carry *literal* substring
   * semantics on the SQL side (the `%` / `_` of a bound value and of a
   * computed one are escaped, with an `ESCAPE` clause), so they map onto
   * Mongo's literal string-search operators — no regex, hence nothing to
   * escape.
   *
   * `$like` / `$nlike` / `$ilike` / `$nilike` read their value as a
   * wildcard pattern, as on SQL. The pattern becomes a regex at run time
   * by the same steps {@link __likeToRegex} takes at translation time,
   * and `$regexMatch` applies it.
   */
  private __computedPattern(
    lhs: unknown,
    op: string,
    operand: unknown,
  ): unknown {
    // SQL matches nothing against a NULL operand; `$indexOfCP` and
    // `$strLenCP` throw on one.
    const whenSet = (match: unknown): unknown => ({
      $cond: [{ $gt: [operand, null] }, match, false],
    });
    switch (op) {
      case '$startsWith':
        // `$indexOfCP` returns -1 for "not found" and null when the field
        // is missing; both compare false against 0.
        return whenSet({ $eq: [{ $indexOfCP: [lhs, operand] }, 0] });
      case '$contains':
        return whenSet({ $gte: [{ $indexOfCP: [lhs, operand] }, 0] });
      case '$endsWith': {
        // Mongo has no "last index of", so compare the trailing slice.
        // `$let` binds both operands once — the subject `$ifNull`-coerced
        // so a missing field is no `$strLenCP` type error, the suffix so
        // the expression isn't re-evaluated three times. The coerced ''
        // would end with an empty suffix, hence the guard on the field.
        const subject = '$$subject';
        const suffix = '$$suffix';
        const subjectLen = { $strLenCP: subject };
        const suffixLen = { $strLenCP: suffix };
        return whenSet({
          $let: {
            vars: { subject: { $ifNull: [lhs, ''] }, suffix: operand },
            in: {
              $and: [
                { $gt: [lhs, null] },
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
        });
      }
      default: {
        const source = LIKE_TO_REGEX_STEPS.reduce<unknown>(
          (input, [find, replacement]) => ({
            $replaceAll: {
              input,
              find: this.__expressionLiteral(find),
              replacement,
            },
          }),
          operand,
        );
        const match = {
          $regexMatch: {
            input: lhs,
            regex: { $concat: ['^', source, { $literal: '$' }] },
            ...(op === '$ilike' || op === '$nilike' ? { options: 'i' } : {}),
          },
        };
        return whenSet(
          op === '$nlike' || op === '$nilike'
            ? this.__notNull({ $not: [match] }, lhs)
            : match,
        );
      }
    }
  }

  private __translateOperator(
    fieldPath: string,
    op: string,
    val: unknown,
  ): Record<string, unknown> {
    // The LIKE family splices its value into a regex, so it must be a
    // string by this point. `__translateColumnCondition` has already
    // routed column refs and Expressions to `$expr`; this
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
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte':
      case '$in':
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
          [fieldPath]: this.__likeToRegex(val as string, op === '$nlike'),
        };
      case '$ilike':
      case '$nilike':
        return {
          [fieldPath]: this.__likeToRegex(
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
  private __likeToRegex(
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
    // `$not` alone also matches a null or missing field; NOT LIKE does not.
    return negate ? { $not: inner, $ne: null } : inner;
  }

  /**
   * The `unit` of a `UNIX_TIMESTAMP` node, `'seconds'` when absent.
   *
   * @throws {OqlError} `INVALID_TIME_UNIT` when the unit is present and is
   *   neither `'seconds'` nor `'milliseconds'`.
   */
  private __unixTimestampUnit(expr: Expressions): 'seconds' | 'milliseconds' {
    const unit: unknown = (expr as { unit?: unknown }).unit;
    if (unit !== undefined && unit !== 'seconds' && unit !== 'milliseconds') {
      throw new OqlError(
        `Unknown UNIX_TIMESTAMP unit '${
          String(unit)
        }' — expected one of seconds, milliseconds`,
        { code: 'INVALID_TIME_UNIT', dialect: this.Dialect, unit },
      );
    }
    return unit ?? 'seconds';
  }

  /**
   * Map an OQL {@link TimeUnit} to the unit name Mongo's `$dateAdd`
   * expects. See {@link MONGO_TIME_UNITS}.
   *
   * @throws {OqlError} `INVALID_TIME_UNIT` when the unit isn't a
   *   recognised OQL time unit. The asserts layer already rejects those,
   *   so this only fires on hand-built input that bypassed validation —
   *   and a clean error beats Mongo failing at execution time.
   */
  private __mongoTimeUnit(unit: unknown): string {
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
   * Resolve an expression argument for Mongo. An `@` string is a `$field`
   * path when it names one of `columns`, and text otherwise, as on the SQL
   * dialects: a JSON path such as `'@meta.@tag'` is text, since only a
   * filter key reads into a JSON column. MongoDB reads no `@` string as a
   * field path or an operator. A nested expression object is translated
   * recursively, and anything else is a literal (see
   * {@link __expressionLiteral}).
   *
   * @throws {@link OqlError} `INVALID_COLUMN_REF` when the string names a
   *   declared expression of an UPDATE or DELETE.
   */
  private __resolveExpressionRef(
    v: unknown,
    columns: ReadonlySet<string>,
  ): unknown {
    if (typeof v === 'string' && v.startsWith('@')) {
      const path = v.slice(1).replace('.@', '.');
      this.__assertNotExpression(v, path, columns);
      return columns.has(path) ? `$${path}` : v;
    }
    if (
      typeof v === 'object' && v !== null && !(v instanceof Date) &&
      '$$_expression' in v
    ) {
      return this.__translateExpression(v as Expressions, columns);
    }
    return this.__expressionLiteral(v);
  }

  /**
   * Resolve a column position, a CASE condition's key or an aggregate's
   * column: there an `@` string is a `$field` path whatever it names, as
   * on the SQL dialects, which lets it name an expression alias.
   */
  private __columnRef(v: unknown, columns: ReadonlySet<string>): unknown {
    return typeof v === 'string' && v.startsWith('@')
      ? `$${v.slice(1).replace('.@', '.')}`
      : this.__resolveExpressionRef(v, columns);
  }

  /**
   * A literal operand of an aggregation expression. There a string
   * starting with `$` is a field path or a variable and an object is an
   * operator, so those are wrapped in `$literal`; every other value
   * already reads as itself and is emitted as is.
   */
  private __expressionLiteral(v: unknown): unknown {
    const ambiguous = typeof v === 'string'
      ? v.startsWith('$')
      : typeof v === 'object' && v !== null && !(v instanceof Date);
    return ambiguous ? { $literal: v } : v;
  }

  /** `v`, made null where it would evaluate to missing. */
  private __nullIfMissing(v: unknown): unknown {
    return this.__mayBeMissing(v) ? { $ifNull: [v, null] } : v;
  }

  /**
   * Whether a translated expression can evaluate to missing rather than
   * null: a field path, or an operator that returns one of its operands
   * as it is. Every other operator returns null for a missing input.
   */
  private __mayBeMissing(v: unknown): boolean {
    if (typeof v === 'string') return v.startsWith('$') && !v.startsWith('$$');
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
    const o = v as Record<string, unknown>;
    if ('$ifNull' in o) {
      return this.__mayBeMissing((o.$ifNull as unknown[]).at(-1));
    }
    if ('$cond' in o) {
      const [, then, otherwise] = o.$cond as unknown[];
      return this.__mayBeMissing(then) || this.__mayBeMissing(otherwise);
    }
    if ('$switch' in o) {
      const s = o.$switch as {
        branches: { then: unknown }[];
        default: unknown;
      };
      return s.branches.some((b) => this.__mayBeMissing(b.then)) ||
        this.__mayBeMissing(s.default);
    }
    return false;
  }

  /**
   * Translate a `CASE` condition — a {@link QueryFilter} — to an
   * aggregation boolean expression, which `$switch` needs in place of a
   * find filter. Covers `$and` / `$or` and the comparison, `$in` /
   * `$nin`, `$between`, `$null` and pattern operators, and `$exists` /
   * `$nexists` in a SELECT's `expressions`, which test the size of their
   * lookup's field. A condition is true exactly where SQL's is: each
   * comparison is false on a null or missing input.
   *
   * @throws {DialectUnsupportedError} For an operator outside that set,
   *   an `$exists` / `$nexists` anywhere else, and a pattern operand the
   *   filter path refuses too.
   */
  private __filterToExpr(
    filter: QueryFilter,
    columns: ReadonlySet<string>,
  ): unknown {
    const parts: unknown[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and' || key === '$or') {
        parts.push({
          [key]: (value as QueryFilter[]).map((f) =>
            this.__filterToExpr(f, columns)
          ),
        });
        continue;
      }
      if (
        (key === '$exists' || key === '$nexists') &&
        columns instanceof CaseExistsScope
      ) {
        let field = `${EXISTS_FIELD}${columns.lookups.length}`;
        while (columns.taken.has(field)) field = `_${field}`;
        columns.lookups.push(
          this.__buildExistsLookup(value as ExistsFilter, field, columns),
        );
        parts.push({
          [key === '$exists' ? '$gt' : '$eq']: [{ $size: `$${field}` }, 0],
        });
        continue;
      }
      if (key.startsWith('$')) {
        throw new DialectUnsupportedError(
          this.Dialect,
          `filter operator '${key}' inside a CASE condition`,
        );
      }
      const field = this.__columnRef(key, columns);
      for (const [op, operand] of Object.entries(this.__conditionOps(value))) {
        parts.push(this.__conditionToExpr(field, op, operand, columns));
      }
    }
    return parts.length === 1 ? parts[0] : { $and: parts };
  }

  /**
   * The operators of a filter value, with the shorthands spelled out: a
   * literal is `$eq`, `null` is `$null` and a list is `$in`.
   */
  private __conditionOps(value: unknown): Record<string, unknown> {
    const isOps = typeof value === 'object' && value !== null &&
      !(value instanceof Date) && !Array.isArray(value) &&
      !('$$_expression' in value);
    return isOps
      ? value as Record<string, unknown>
      : value === null
      ? { $null: true }
      : Array.isArray(value)
      ? { $in: value }
      : { $eq: value };
  }

  /** One `field <op> operand` comparison of {@link __filterToExpr}. */
  private __conditionToExpr(
    field: unknown,
    op: string,
    operand: unknown,
    columns: ReadonlySet<string>,
  ): unknown {
    // Guarded against null: the field, and each operand that is a column
    // or an expression. A literal operand is never null, and only a
    // column resolves to a string starting with `$`.
    const guards = [field];
    const r = (v: unknown): unknown => {
      const resolved = this.__resolveExpressionRef(v, columns);
      if (
        (typeof resolved === 'string' && resolved.startsWith('$')) ||
        this.__isExpressionNode(v)
      ) guards.push(resolved);
      return resolved;
    };
    if (LIKE_OPERATORS.has(op)) {
      const ref = this.__valueFieldRef(operand, columns);
      if (ref !== null || this.__isExpressionNode(operand)) {
        return this.__computedPattern(
          field,
          op,
          ref ?? this.__translateExpression(operand as Expressions, columns),
        );
      }
      // The pattern a filter would use, matched by `$regexMatch`. That is
      // false for a null or missing input; its negation needs the guard.
      const spec = this.__translateOperator('f', op, operand).f as Record<
        string,
        unknown
      >;
      const { $regex: regex, $options: options } = (spec.$not ?? spec) as {
        $regex: string;
        $options?: string;
      };
      const match = {
        $regexMatch: { input: field, regex, ...(options ? { options } : {}) },
      };
      return spec.$not ? this.__notNull({ $not: [match] }, field) : match;
    }
    switch (op) {
      case '$eq':
      case '$ne':
      case '$gt':
      case '$gte':
      case '$lt':
      case '$lte': {
        const comparison = { [op]: [field, r(operand)] };
        return this.__notNull(comparison, ...guards);
      }
      case '$in':
        // One equal element makes IN true whatever the others are, so
        // only the field is guarded.
        return this.__notNull(
          { $in: [field, (operand as unknown[]).map(r)] },
          field,
        );
      case '$nin': {
        const list = (operand as unknown[]).map(r);
        return this.__notNull({ $not: [{ $in: [field, list] }] }, ...guards);
      }
      case '$between': {
        const [lo, hi] = (operand as [unknown, unknown]).map(r);
        return this.__notNull(
          { $and: [{ $gte: [field, lo] }, { $lte: [field, hi] }] },
          ...guards,
        );
      }
      case '$null': {
        const isNull = { $in: [{ $type: field }, ['null', 'missing']] };
        return operand === true ? isNull : { $not: [isNull] };
      }
      default:
        throw new DialectUnsupportedError(
          this.Dialect,
          `filter operator '${op}' inside a CASE condition`,
        );
    }
  }

  /**
   * Translate an OQL Expression to Mongo aggregation-operator form.
   * Pipeline / aggregation expressions only — these don't apply to
   * `find` filter syntax (which has different operator names).
   */
  private __translateExpression(
    expr: Expressions,
    columns: ReadonlySet<string>,
  ): unknown {
    const args = ('args' in expr) ? expr.args : undefined;
    const r = (v: unknown): unknown => this.__resolveExpressionRef(v, columns);
    // SQL returns NULL for a NULL input. `$toLower`, `$toUpper` and
    // `$substrCP` return '' for a null or missing one and `$strLenCP`
    // throws; `$gt: null` is true for every value except those two.
    const orNull = (input: unknown, result: unknown): unknown => ({
      $cond: [{ $gt: [input, null] }, result, null],
    });
    switch (expr.$$_expression) {
      // Math
      case 'ADD':
        return { $add: (args as unknown[]).map(r) };
      case 'MULTIPLY':
        return { $multiply: (args as unknown[]).map(r) };
      // `$subtract`, `$divide` and `$mod` take exactly two operands; SQL
      // chains `a - b - c` left to right, so the fold does too.
      case 'SUBTRACT':
      case 'DIVIDE':
      case 'MODULO': {
        const op = {
          SUBTRACT: '$subtract',
          DIVIDE: '$divide',
          MODULO: '$mod',
        }[expr.$$_expression];
        const [first, ...rest] = (args as unknown[]).map(r);
        return rest.reduce((acc, x) => ({ [op]: [acc, x] }), first);
      }
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
        return orNull(r(args), { $strLenCP: r(args) });
      case 'TO_STRING':
        return { $toString: r(args) };
      case 'LOWER':
        return orNull(r(args), { $toLower: r(args) });
      case 'UPPER':
        return orNull(r(args), { $toUpper: r(args) });
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
        return orNull(r(a.string), {
          $substrCP: a.length !== undefined
            ? [r(a.string), start, r(a.length)]
            // No length: the rest of the string. `$substrCP` takes no
            // "to the end" marker, and the string's own length is enough.
            : [r(a.string), start, { $strLenCP: r(a.string) }],
        });
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
      case 'UNIX_TIMESTAMP': {
        // A Long (int64) either way: $$NOW is ms since epoch once cast.
        return this.__unixTimestampUnit(expr) === 'milliseconds'
          ? { $toLong: '$$NOW' }
          : { $toLong: { $floor: { $divide: [{ $toLong: '$$NOW' }, 1000] } } };
      }
      case 'CURRENT_TIME':
        // Mongo has no time-only type: the UTC clock time as 'HH:MM:SS',
        // the string the SQL dialects return.
        return { $dateToString: { date: '$$NOW', format: '%H:%M:%S' } };
      case 'DATE_ADD': {
        const a = args as { date: unknown; amount: unknown; unit: unknown };
        return {
          $dateAdd: {
            startDate: r(a.date),
            unit: this.__mongoTimeUnit(a.unit),
            amount: r(a.amount),
          },
        };
      }
      case 'DATE_TRUNC': {
        const a = args as { date: unknown; unit: unknown };
        if (a.unit !== 'DAYS' && a.unit !== 'MONTHS' && a.unit !== 'YEARS') {
          throw new OqlError(
            `Unknown DATE_TRUNC unit '${
              String(a.unit)
            }' — expected one of DAYS, MONTHS, YEARS`,
            { code: 'INVALID_TIME_UNIT', dialect: this.Dialect, unit: a.unit },
          );
        }
        // Truncates in UTC: no `timezone` is passed.
        return {
          $dateTrunc: { date: r(a.date), unit: MONGO_TIME_UNITS[a.unit] },
        };
      }
      case 'DATE_DIFF': {
        const a = args as { from: unknown; to: unknown; unit: unknown };
        this.__mongoTimeUnit(a.unit); // rejects an unknown unit
        const unit = a.unit as TimeUnit;
        // `$dateDiff` counts unit boundaries crossed, so 00:59 → 01:01 is
        // 1 hour and 31 January → 1 February is 1 month. The SQL engines
        // count complete units and call both 0. Dividing elapsed
        // milliseconds matches them for the fixed-length units; a month
        // or a year has no fixed length, so those divide a calendar
        // position instead (see MONTH_SLOT_MS).
        const calendar = unit === 'MONTHS' || unit === 'YEARS';
        const position = (date: unknown) => ({
          $add: [
            {
              $multiply: [
                {
                  $add: [{ $multiply: [{ $year: date }, 12] }, {
                    $month: date,
                  }],
                },
                MONTH_SLOT_MS,
              ],
            },
            { $subtract: [date, { $dateTrunc: { date, unit: 'month' } }] },
          ],
        });
        const operand = (date: unknown) =>
          calendar ? position(r(date)) : r(date);
        return {
          $toLong: {
            $trunc: {
              $divide: [
                { $subtract: [operand(a.to), operand(a.from)] },
                MONGO_DATE_DIFF_DIVISOR[unit],
              ],
            },
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

      // Conditional
      case 'COALESCE':
        return { $ifNull: (args as unknown[]).map(r) };
      case 'NULLIF': {
        const [a, b] = (args as unknown[]).map(r);
        return { $cond: [{ $eq: [a, b] }, null, a] };
      }
      case 'CASE': {
        const a = args as {
          cases: Array<{ when: QueryFilter; then: unknown }>;
          else?: unknown;
        };
        return {
          $switch: {
            branches: a.cases.map((c) => ({
              case: this.__filterToExpr(c.when, columns),
              then: r(c.then),
            })),
            default: a.else === undefined ? null : r(a.else),
          },
        };
      }

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
  /**
   * The query's aggregates, plus a JSON_ROW of every declared column for
   * each projected join alias, which the SQL translators expand the same
   * way. Either one groups the query.
   */
  private __aggregatesOf(q: Query<'SELECT'>): Record<string, unknown> {
    const out: Record<string, unknown> = { ...q.aggregates };
    for (const key of Object.keys(q.projection)) {
      const alias = key.slice(1);
      const def = q.joins?.[alias];
      if (!def || alias in out || alias in (q.expressions ?? {})) continue;
      out[alias] = {
        $$_aggregate: 'JSON_ROW',
        columns: Object.fromEntries(
          def.columns.map((c) => [String(c), `@${alias}.@${String(c)}`]),
        ),
      };
    }
    return out;
  }

  private __translateAggregate(
    agg: { $$_aggregate: string; [k: string]: unknown },
    columns: ReadonlySet<string>,
  ): unknown {
    const ref = (col: unknown): unknown => this.__columnRef(col, columns);
    const present = (col: unknown): unknown => this.__nullIfMissing(ref(col));
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
      // The values, joined once the group is built (see `__buildAggregate`).
      case 'STRING_AGG':
        return {
          [agg.distinct === true ? '$addToSet' : '$push']: ref(agg.column),
        };
      // `$push` skips a missing value, and an object leaves out a missing
      // field; SQL collects NULL for both, as for a join without a match.
      case 'ARRAY_AGG':
        return {
          [agg.distinct === true ? '$addToSet' : '$push']: present(agg.column),
        };
      case 'JSON_ROW': {
        const cols = agg.columns as Record<string, unknown>;
        const rowObj: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(cols)) {
          rowObj[k] = present(v);
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
