/**
 * Abstract base for SQL OQL translators.
 *
 * The class itself IS the contract: concrete dialects (SQLite, Postgres,
 * MariaDB, …) extend it and supply dialect-specific bits as data
 * (identifier-quoting, parameter style, expression/aggregate/operator
 * emitter maps, support flags) plus a small set of method overrides where
 * the SQL diverges structurally rather than as templated strings (UPSERT,
 * CREATE_TABLE, ALTER_TABLE, view DDL).
 *
 * One public method per query type — `select`, `insert`, `count`,
 * `createTable`, … . Each asserts its input and returns
 * `TranslatedQuery` (DML) or `TranslatedQuery[]` (multi-statement DDL).
 *
 * Naming convention: `protected _foo` for things subclasses should reach;
 * `private __bar` for class-internal helpers.
 *
 * @module translator/AbstractTranslator
 */

import type {
  Aggregates,
  ColumnDefinition,
  ExistsFilter,
  Expressions,
  Operators,
  Query,
  QueryFilter,
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
import { Parameters } from './Parameters.ts';
import type {
  AggregateMap,
  DialectSupport,
  ExpressionMap,
  FilterOperatorMap,
  IdentifierQuote,
  ParameterStyle,
  TranslatedQuery,
} from './types/mod.ts';

/**
 * Base alias for the primary table when JOINs are present. Joined table
 * columns come through as `<alias>.<col>` in the qualified column scope;
 * the primary table's columns get this prefix to disambiguate.
 */
const BASE_ALIAS = '__base__';

/**
 * Internal alias for the synthesised aggregate in a `COUNT` rewrite. The
 * double-underscore wrapper keeps it from colliding with a user column or
 * projection key literally named `Count`.
 */
const COUNT_ALIAS = '__count__';

/**
 * Alias given to the subquery table of a `$exists` / `$nexists` filter.
 * Fixed (not user-chosen) so `on`-map keys can stay bare `@column`
 * refs; the double-underscore wrapper keeps it from colliding with a
 * user table or join alias.
 */
const EXISTS_ALIAS = '__exists__';

/**
 * Context threaded through {@link AbstractTranslator._translateFilter}.
 * `aggregates` / `expressions` are the declared alias maps used to
 * substitute `@alias` refs with their full SQL body (HAVING path);
 * `outerTable` is the bare (unaliased) name of the query's primary
 * table, used by `$exists` translation to qualify outer column refs
 * when the query has no joins — an unqualified ref inside the subquery
 * would be captured by the subquery table's scope.
 */
type FilterContext = {
  aggregates?: Record<string, Aggregates>;
  expressions?: Record<string, Expressions>;
  outerTable?: string;
};

/**
 * Escape character used in the `ESCAPE` clause appended to `$startsWith` /
 * `$endsWith` / `$contains` LIKE patterns so a `%` / `_` in the bound value
 * is matched literally instead of acting as a wildcard.
 */
const LIKE_ESCAPE_CHAR = '\\';

/** LIKE wildcards (plus the escape char itself) that must be escaped. */
const LIKE_WILDCARDS = /[\\%_]/g;

/**
 * Shape a JSON-path segment must have before it is spliced into a SQL
 * string literal (`'$.a.b'`, `'{a,b}'`). Identical to the identifier
 * pattern the asserts layer enforces on every `@`-segment — re-checked
 * here as defence-in-depth for hand-built queries that bypass the
 * asserts, since these segments land inside quoted literals rather than
 * quoted identifiers.
 */
const JSON_PATH_SEGMENT_PATTERN = /^[a-zA-Z_]\w*$/;

/**
 * Turns a validated {@link Query} into dialect SQL plus its bind params.
 *
 * Not instantiable — construct {@link SQLiteTranslator},
 * {@link PostgresTranslator} or {@link MariaTranslator} instead. Subclass
 * it only to add a new SQL dialect: supply the abstract data members
 * (quoting, param style, emitter maps, {@link DialectSupport} flags) and
 * the abstract `_build*` methods, and every public entry point comes for
 * free. Mongo is not a subclass — see {@link MongoTranslator}.
 *
 * Instances are stateless and reusable; each public call allocates its own
 * {@link Parameters}.
 *
 * @example
 * ```typescript
 * import { SQLiteTranslator } from '@tundralibs/oql/translator';
 *
 * const t: AbstractTranslator = new SQLiteTranslator();
 * const { sql, params } = t.select({
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'name'],
 *   projection: { '@id': true, '@name': true },
 *   where: { '@name': { $eq: 'Ada' } },
 * });
 * // SELECT "id" AS "id", "name" AS "name" FROM "users" WHERE "name" = :p_0:
 * ```
 */
export abstract class AbstractTranslator {
  /** Human-readable dialect name (`'sqlite'`, `'postgres'`, `'maria'`, …). */
  public abstract readonly Dialect: string;

  /** Identifier delimiter pair plus its embedded-quote escape sequence. */
  protected abstract readonly _identifierQuote: IdentifierQuote;

  /** Parameter placeholder style. See {@link ParameterStyle}. */
  protected abstract readonly _parameterStyle: ParameterStyle;

  /** Per-expression SQL emitters. */
  protected abstract readonly _expressionMap: ExpressionMap;

  /** Per-aggregate SQL emitters. */
  protected abstract readonly _aggregateMap: AggregateMap;

  /** Per-filter-operator SQL emitters (`$eq`, `$gt`, `$like`, …). */
  protected abstract readonly _filterOperatorMap: FilterOperatorMap;

  /** Feature flags. */
  protected abstract readonly _support: DialectSupport;

  /**
   * Row-count to synthesise for `LIMIT` when a query sets `offset`
   * without `limit`.
   *
   * `OFFSET` is not a standalone clause on most engines — SQLite's
   * grammar only accepts it *after* a `LIMIT`, and MySQL / MariaDB
   * reject a bare `OFFSET` outright. Both document an "all remaining
   * rows" sentinel for exactly this case (SQLite: a negative limit;
   * MySQL / MariaDB: the max unsigned BIGINT), so an offset-only query
   * — a legitimate intent — emits valid SQL instead of a syntax error.
   *
   * `null` — the default — means the dialect accepts a bare `OFFSET` and
   * nothing is synthesised (Postgres). Dialects that need the sentinel
   * override with their documented row-count.
   *
   * @see {@link AbstractTranslator.__buildLimitOffset}
   */
  protected readonly _offsetOnlyLimit: string | null = null;

  // =========================================================================
  // Public API — one method per query type
  // =========================================================================

  /**
   * Translate a `SELECT` query.
   *
   * @throws {TypeError} When `q` is not a valid `SELECT` query.
   */
  public select(q: Query<'SELECT'>): TranslatedQuery {
    assertSelect(q);
    const params = new Parameters();
    return { sql: this._buildSelect(q, params), params: params.asRecord() };
  }

  /**
   * Translate an `INSERT` query. Includes a `RETURNING` clause.
   *
   * @throws {TypeError} When `q` is not a valid `INSERT` query.
   */
  public insert(q: Query<'INSERT'>): TranslatedQuery {
    assertInsert(q);
    const params = new Parameters();
    return { sql: this._buildInsert(q, params), params: params.asRecord() };
  }

  /**
   * Translate an `INSERT ... SELECT ...` query.
   *
   * @throws {TypeError} When `q` is not a valid `INSERT_FROM_QUERY` query.
   */
  public insertQuery(q: Query<'INSERT_FROM_QUERY'>): TranslatedQuery {
    assertInsertFromQuery(q);
    const params = new Parameters();
    return {
      sql: this._buildInsertFromQuery(q, params),
      params: params.asRecord(),
    };
  }

  /**
   * Translate an `UPDATE` query. Includes `RETURNING` where supported.
   *
   * @throws {TypeError} When `q` is not a valid `UPDATE` query.
   */
  public update(q: Query<'UPDATE'>): TranslatedQuery {
    assertUpdate(q);
    const params = new Parameters();
    return { sql: this._buildUpdate(q, params), params: params.asRecord() };
  }

  /**
   * Translate a `DELETE` query. Includes `RETURNING` where supported.
   *
   * @throws {TypeError} When `q` is not a valid `DELETE` query.
   */
  public delete(q: Query<'DELETE'>): TranslatedQuery {
    assertDelete(q);
    const params = new Parameters();
    return { sql: this._buildDelete(q, params), params: params.asRecord() };
  }

  /**
   * Translate an `UPSERT` query. Includes `RETURNING` where supported.
   *
   * @throws {TypeError} When `q` is not a valid `UPSERT` query.
   */
  public upsert(q: Query<'UPSERT'>): TranslatedQuery {
    assertUpsert(q);
    const params = new Parameters();
    return { sql: this._buildUpsert(q, params), params: params.asRecord() };
  }

  /**
   * Translate a `COUNT` query by rewriting it as a `SELECT` with a
   * `COUNT(1)` aggregate. This means COUNT inherits all of SELECT's
   * features (joins, WHERE, expressions) without duplicating logic.
   *
   * `q.distinct` (a single-element column tuple, enforced upstream)
   * rewrites the aggregate to `COUNT(DISTINCT <col>)` instead — the
   * deduplicating form for queries whose joins fan the base rows out.
   *
   * @throws {TypeError} When `q` is not a valid `COUNT` query.
   */
  public count(q: Query<'COUNT'>): TranslatedQuery {
    assertCount(q);
    // The `@`-prefixed column form is what the COUNT aggregate branch
    // of `Aggregates` accepts; the assert already guaranteed the name
    // is a declared base column, so the cast is shape-narrowing only.
    const countAggregate = (q.distinct && q.distinct.length > 0
      ? {
        $$_aggregate: 'COUNT',
        column: `@${String(q.distinct[0])}`,
        distinct: true,
      }
      : { $$_aggregate: 'COUNT' }) as Aggregates;
    const rewritten: Query<'SELECT'> = {
      type: 'SELECT',
      table: q.table,
      schema: q.schema,
      columns: q.columns,
      expressions: q.expressions,
      joins: q.joins,
      where: q.where,
      aggregates: { [COUNT_ALIAS]: countAggregate },
      projection: { [`@${COUNT_ALIAS}`]: true },
    };
    return this.select(rewritten);
  }

  /**
   * Translate a `CREATE_SCHEMA`. Throws on dialects without schemas.
   *
   * @throws {TypeError} When `q` is not a valid `CREATE_SCHEMA` query.
   * @throws {@link DialectUnsupportedError} When the dialect does not
   *   support schemas.
   */
  public createSchema(q: Query<'CREATE_SCHEMA'>): TranslatedQuery {
    assertCreateSchema(q);
    if (!this._support.schema) {
      throw new DialectUnsupportedError(this.Dialect, 'CREATE_SCHEMA');
    }
    return { sql: this._buildCreateSchema(q), params: {} };
  }

  /**
   * Translate a `DROP_SCHEMA`. Throws on dialects without schemas.
   *
   * @throws {TypeError} When `q` is not a valid `DROP_SCHEMA` query.
   * @throws {@link DialectUnsupportedError} When the dialect does not
   *   support schemas.
   */
  public dropSchema(q: Query<'DROP_SCHEMA'>): TranslatedQuery {
    assertDropSchema(q);
    if (!this._support.schema) {
      throw new DialectUnsupportedError(this.Dialect, 'DROP_SCHEMA');
    }
    return { sql: this._buildDropSchema(q), params: {} };
  }

  /**
   * Translate a `CREATE_TABLE`. Returns an array because a dialect may
   * need to emit the table plus separate index/constraint statements that
   * can't go inline.
   *
   * @throws {TypeError} When `q` is not a valid `CREATE_TABLE` query.
   */
  public createTable(q: Query<'CREATE_TABLE'>): TranslatedQuery[] {
    assertCreateTable(q);
    return this._buildCreateTable(q).map((sql) => ({ sql, params: {} }));
  }

  /**
   * Translate an `ALTER_TABLE`. Returns an array — SQLite splits each op
   * into its own statement; even Postgres/MariaDB sometimes prefer
   * sequential statements over one combined ALTER.
   *
   * @throws {TypeError} When `q` is not a valid `ALTER_TABLE` query.
   */
  public alterTable(q: Query<'ALTER_TABLE'>): TranslatedQuery[] {
    assertAlterTable(q);
    return this._buildAlterTable(q).map((sql) => ({ sql, params: {} }));
  }

  /**
   * Translate a `DROP_TABLE`.
   *
   * @throws {TypeError} When `q` is not a valid `DROP_TABLE` query.
   */
  public dropTable(q: Query<'DROP_TABLE'>): TranslatedQuery {
    assertDropTable(q);
    return { sql: this._buildDropTable(q), params: {} };
  }

  /**
   * Translate a `TRUNCATE`. Throws on dialects without TRUNCATE.
   *
   * @throws {TypeError} When `q` is not a valid `TRUNCATE` query.
   * @throws {@link DialectUnsupportedError} When the dialect does not
   *   support `TRUNCATE`.
   */
  public truncate(q: Query<'TRUNCATE'>): TranslatedQuery {
    assertTruncate(q);
    if (!this._support.truncate) {
      throw new DialectUnsupportedError(this.Dialect, 'TRUNCATE');
    }
    return { sql: this._buildTruncate(q), params: {} };
  }

  /**
   * Translate a `CREATE_INDEX`.
   *
   * Partial-index `WHERE` predicates cannot carry parameter placeholders
   * on Postgres + SQLite (the index definition needs a stable, immutable
   * predicate at create time — Postgres reports `there is no parameter
   * $1`). MariaDB has no partial indexes and throws upstream when `where`
   * is set. The translator therefore inlines any params into the
   * predicate body the same way it does for {@link createView}, and
   * returns `params: {}`.
   *
   * @throws {TypeError} When `q` is not a valid `CREATE_INDEX` query.
   */
  public createIndex(q: Query<'CREATE_INDEX'>): TranslatedQuery {
    assertCreateIndex(q);
    const params = new Parameters();
    const sql = this._buildCreateIndex(q, params);
    return { sql: this._inlineParams(sql, params), params: {} };
  }

  /**
   * Translate a `DROP_INDEX`.
   *
   * @throws {TypeError} When `q` is not a valid `DROP_INDEX` query.
   */
  public dropIndex(q: Query<'DROP_INDEX'>): TranslatedQuery {
    assertDropIndex(q);
    return { sql: this._buildDropIndex(q), params: {} };
  }

  /**
   * Translate a `CREATE_VIEW`.
   *
   * Crucially: literals inside the embedded SELECT are **inlined**
   * rather than parameterised. SQLite + Postgres reject parameter
   * placeholders inside a stored view body (`parameters are not
   * allowed in views` / `there is no parameter $1`); MariaDB tolerates
   * them but the resulting view stores the bound value as a literal
   * anyway. Inlining at translation time gives every dialect the same
   * stored body, makes views deterministic, and means {@link createView}
   * always returns `params: {}`.
   *
   * @throws {TypeError} When `q` is not a valid `CREATE_VIEW` query.
   */
  public createView(q: Query<'CREATE_VIEW'>): TranslatedQuery {
    assertCreateView(q);
    const params = new Parameters();
    const sql = this._buildCreateView(q, params);
    return { sql: this._inlineParams(sql, params), params: {} };
  }

  /**
   * Translate a `DROP_VIEW`.
   *
   * @throws {TypeError} When `q` is not a valid `DROP_VIEW` query.
   */
  public dropView(q: Query<'DROP_VIEW'>): TranslatedQuery {
    assertDropView(q);
    return { sql: this._buildDropView(q), params: {} };
  }

  /**
   * Translate an `ALTER_VIEW`. Returns an array — SQLite has no ALTER
   * VIEW so it emits DROP+CREATE; Postgres can do it inline.
   *
   * Same param-inlining rule as {@link createView}: the CREATE VIEW
   * statement(s) embedded in the result must not carry placeholders.
   *
   * @throws {TypeError} When `q` is not a valid `ALTER_VIEW` query.
   */
  public alterView(q: Query<'ALTER_VIEW'>): TranslatedQuery[] {
    assertAlterView(q);
    const params = new Parameters();
    const stmts = this._buildAlterView(q, params);
    return stmts.map((sql) => ({
      sql: this._inlineParams(sql, params),
      params: {},
    }));
  }

  /**
   * Translate a `REFRESH_MATERIALIZED_VIEW`. The dispatch layer no
   * longer gates on `_support.materializedView` — concrete dialects
   * decide what to do when they don't have real materialized views
   * (typically a no-op `SELECT 1` since `CREATE_VIEW { materialized:
   * true }` falls back to a regular view there too).
   *
   * @throws {TypeError} When `q` is not a valid `REFRESH_MATERIALIZED_VIEW`
   *   query.
   */
  public refreshMaterializedView(
    q: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): TranslatedQuery {
    assertRefreshMaterializedView(q);
    return { sql: this._buildRefreshMaterializedView(q), params: {} };
  }

  // =========================================================================
  // DML builders — concrete in base; concretes can override if needed
  // =========================================================================

  /**
   * Build a `SELECT`. Subclasses should rarely override — dialect-specific
   * behaviour lives in `_parameterStyle`, `_identifierQuote`, and the
   * emitter maps. Override only when the SELECT structure itself
   * diverges (LIMIT/OFFSET ordering, etc).
   */
  protected _buildSelect(q: Query<'SELECT'>, params: Parameters): string {
    const hasJoins = !!(q.joins && Object.keys(q.joins).length > 0);
    const scope = this.__buildScope(q, hasJoins);
    // Projection source bodies (expressions, aggregates, and auto-expanded
    // join aliases) are cached by projection key so __buildGroupBy and
    // __buildOrderBy can reuse them instead of re-translating — which would
    // also re-append the body's literal params (e.g. a STRING_AGG separator)
    // a second time.
    const exprCache = new Map<string, string>();

    // `distinct: true` → `SELECT DISTINCT`. The validator rejects the
    // combination with aggregates / auto-expanded join projections, so
    // DISTINCT and the auto-GROUP-BY never appear together.
    const distinctSql = q.distinct === true ? 'DISTINCT ' : '';
    const projectionSql = this.__buildProjection(
      q,
      scope,
      params,
      hasJoins,
      exprCache,
    );
    const fromSql = this.__buildFrom(q, hasJoins, scope, params);
    // Pre-declared `expressions` may be referenced in WHERE by their `@key`
    // alias; we pass them so `_translateFilter` substitutes the alias with
    // the full SQL body. Aggregates are not allowed in WHERE (validator
    // already rejects them) — passing only `expressions`. `outerTable`
    // lets `$exists` subqueries qualify their outer correlation refs.
    const whereSql = q.where
      ? ` WHERE ${
        this._translateFilter(q.where, scope, params, hasJoins, {
          expressions: q.expressions as
            | Record<string, Expressions>
            | undefined,
          outerTable: q.table,
        })
      }`
      : '';
    const groupBySql = this.__buildGroupBy(
      q,
      hasJoins,
      scope,
      params,
      exprCache,
    );
    // HAVING runs before SELECT in standard SQL evaluation, so SELECT
    // aliases (`COUNT(…) AS "cnt"`) aren't in scope yet. We pass the
    // declared aggregate + expression maps so `_translateFilter` can
    // substitute alias refs with their full SQL body.
    const havingSql = q.having
      ? ` HAVING ${
        this._translateFilter(q.having, scope, params, hasJoins, {
          aggregates: q.aggregates as Record<string, Aggregates> | undefined,
          expressions: q.expressions as
            | Record<string, Expressions>
            | undefined,
          outerTable: q.table,
        })
      }`
      : '';
    const orderBySql = this.__buildOrderBy(
      q,
      hasJoins,
      scope,
      params,
      exprCache,
    );
    const limitSql = this.__buildLimitOffset(q.limit, q.offset);

    return `SELECT ${distinctSql}${projectionSql} FROM ${fromSql}${whereSql}${groupBySql}${havingSql}${orderBySql}${limitSql}`;
  }

  /**
   * Build an `INSERT`. Insert columns are taken from the data rows
   * themselves (the union of keys across all rows), not blindly from
   * `q.columns`. `q.columns` is the table schema and is used only to
   * validate that the data keys are real columns and to emit RETURNING.
   *
   * Per-row value rules:
   * - `null` → `NULL`
   * - `undefined` (key missing in this row but present in others) → `DEFAULT`
   * - object with `type` → translate as expression
   * - anything else → parameterise
   */
  protected _buildInsert(q: Query<'INSERT'>, params: Parameters): string {
    const rows = Array.isArray(q.data) ? q.data : [q.data];
    const { colList, valuesSql } = this._renderInsertColsAndValues(
      rows,
      q.columns as string[],
      params,
    );
    const tableSql = this._qualifiedTable(q.table, q.schema);
    // `projection` narrows the RETURNING clause; defaults to every
    // column when omitted.
    const returnCols = (q.projection as ReadonlyArray<string> | undefined) ??
      (q.columns as string[]);
    const returning = this._buildReturning(returnCols, 'insert');
    return `INSERT INTO ${tableSql} (${colList}) VALUES ${valuesSql}${returning}`;
  }

  /** Build an `INSERT INTO ... SELECT ...`. */
  protected _buildInsertFromQuery(
    q: Query<'INSERT_FROM_QUERY'>,
    params: Parameters,
  ): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const colList = (q.columns as string[])
      .map((c) => this._quoteIdentifier(c))
      .join(', ');
    const inner = this._buildSelect(q.query, params);
    return `INSERT INTO ${tableSql} (${colList}) ${inner}`;
  }

  /** Build an `UPDATE`. */
  protected _buildUpdate(q: Query<'UPDATE'>, params: Parameters): string {
    const cols = q.columns as string[];
    const exprKeys = q.expressions ? Object.keys(q.expressions) : [];
    const scope = [...cols, ...exprKeys];
    const tableSql = this._qualifiedTable(q.table, q.schema);

    const setClauses = Object.entries(q.data).map(([col, value]) => {
      const sql = this._translateValue(value, scope, params, true);
      return `${this._quoteIdentifier(col)} = ${sql}`;
    });

    const whereSql = q.where
      ? ` WHERE ${
        this._translateFilter(q.where, scope, params, false, {
          expressions: q.expressions,
          outerTable: q.table,
        })
      }`
      : '';
    return `UPDATE ${tableSql} SET ${setClauses.join(', ')}${whereSql}`;
  }

  /** Build a `DELETE`. */
  protected _buildDelete(q: Query<'DELETE'>, params: Parameters): string {
    const cols = q.columns as string[];
    const exprKeys = q.expressions ? Object.keys(q.expressions) : [];
    const scope = [...cols, ...exprKeys];
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const whereSql = q.where
      ? ` WHERE ${
        this._translateFilter(q.where, scope, params, false, {
          expressions: q.expressions,
          outerTable: q.table,
        })
      }`
      : '';
    return `DELETE FROM ${tableSql}${whereSql}`;
  }

  /** Build an `UPSERT`. Dialect-divergent — concretes must implement. */
  protected abstract _buildUpsert(
    q: Query<'UPSERT'>,
    params: Parameters,
  ): string;

  // =========================================================================
  // DDL builders — abstract, concretes own them
  // =========================================================================

  /**
   * Reached only when `_support.schema` is true — the public
   * {@link createSchema} throws first otherwise, so implementations need
   * no support check of their own. The same holds for every sibling
   * builder guarded by a {@link DialectSupport} flag.
   */
  protected abstract _buildCreateSchema(q: Query<'CREATE_SCHEMA'>): string;

  /** Counterpart to {@link _buildCreateSchema}. */
  protected abstract _buildDropSchema(q: Query<'DROP_SCHEMA'>): string;

  /**
   * One statement per requested action. Dialects that could combine
   * actions into a single `ALTER TABLE` deliberately don't, so a partial
   * failure is easy to locate.
   */
  protected abstract _buildAlterTable(q: Query<'ALTER_TABLE'>): string[];

  /** Build a `DROP TABLE`. */
  protected abstract _buildDropTable(q: Query<'DROP_TABLE'>): string;

  /** Reached only when `_support.truncate` is true. */
  protected abstract _buildTruncate(q: Query<'TRUNCATE'>): string;

  /**
   * `params` is threaded through for the partial-index `WHERE` body, but
   * {@link createIndex} inlines rather than binds those values and
   * discards the collected record — see its note.
   */
  protected abstract _buildCreateIndex(
    q: Query<'CREATE_INDEX'>,
    params: Parameters,
  ): string;

  /** Build a `DROP INDEX`. */
  protected abstract _buildDropIndex(q: Query<'DROP_INDEX'>): string;

  /**
   * Dialects without materialized views ignore `q.materialized` and emit a
   * plain view rather than throwing — see {@link DialectSupport}.
   */
  protected abstract _buildCreateView(
    q: Query<'CREATE_VIEW'>,
    params: Parameters,
  ): string;

  /** Build a `DROP VIEW`. */
  protected abstract _buildDropView(q: Query<'DROP_VIEW'>): string;

  /**
   * Returns an array because no dialect can both rename and redefine a
   * view in one statement.
   */
  protected abstract _buildAlterView(
    q: Query<'ALTER_VIEW'>,
    params: Parameters,
  ): string[];

  /**
   * Dialects without materialized views emit a no-op `SELECT 1` so the
   * caller's statement sequence keeps its shape.
   */
  protected abstract _buildRefreshMaterializedView(
    q: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): string;

  // =========================================================================
  // Shared helpers — protected so dialects can call them
  // =========================================================================

  /** Quote a single identifier, escaping any embedded quote chars. */
  protected _quoteIdentifier(name: string): string {
    const { open, close, escape } = this._identifierQuote;
    return `${open}${name.replaceAll(close, escape)}${close}`;
  }

  /**
   * Quote a `[schema.]table.column` chain. Caller passes raw segments;
   * each is quoted individually and joined with `.`.
   */
  protected _quoteQualified(...parts: Array<string | undefined>): string {
    return parts
      .filter((p): p is string => typeof p === 'string' && p.length > 0)
      .map((p) => this._quoteIdentifier(p))
      .join('.');
  }

  /**
   * The ` ESCAPE '…'` clause appended to `$startsWith` / `$endsWith` /
   * `$contains` patterns. The clause is raw SQL text, so dialects that treat
   * the backslash as a string-literal escape (MariaDB / MySQL) must override
   * to double it (` ESCAPE '\\'`). The escape char itself is
   * {@link LIKE_ESCAPE_CHAR}.
   */
  protected _likeEscapeClause(): string {
    return ` ESCAPE '${LIKE_ESCAPE_CHAR}'`;
  }

  /**
   * Assemble the `CASE <unit> WHEN 'DAYS' THEN … … 'YEARS' THEN … END`
   * skeleton the date-arithmetic emitters (`DATE_ADD` / `DATE_DIFF`)
   * otherwise hand-roll identically on every SQL dialect. `unitSql` is
   * the already-rendered unit operand; `cases` supplies each unit's
   * `THEN` value — a scale factor on Postgres/SQLite, a SQL interval
   * keyword (`DAY`, `HOUR`, …) on MariaDB.
   */
  protected _timeUnitCase(
    unitSql: string,
    cases: {
      DAYS: string;
      HOURS: string;
      MINUTES: string;
      SECONDS: string;
      MONTHS: string;
      YEARS: string;
    },
  ): string {
    return (
      `CASE ${unitSql} ` +
      `WHEN 'DAYS' THEN ${cases.DAYS} ` +
      `WHEN 'HOURS' THEN ${cases.HOURS} ` +
      `WHEN 'MINUTES' THEN ${cases.MINUTES} ` +
      `WHEN 'SECONDS' THEN ${cases.SECONDS} ` +
      `WHEN 'MONTHS' THEN ${cases.MONTHS} ` +
      `WHEN 'YEARS' THEN ${cases.YEARS} ` +
      `END`
    );
  }

  /**
   * `[schema.]table` rendering. SQLite has no schema concept (uses
   * ATTACH); subclasses can override if they want different semantics.
   */
  protected _qualifiedTable(table: string, schema?: string): string {
    return schema
      ? this._quoteQualified(schema, table)
      : this._quoteIdentifier(table);
  }

  /**
   * Translate a column reference (`@col` or `@Alias.@col`) to qualified
   * SQL. When `hasJoins` is true the base table's columns get the
   * {@link BASE_ALIAS} prefix to disambiguate from joined columns.
   */
  protected _resolveColumnRef(ref: string, hasJoins: boolean): string {
    if (!ref.startsWith('@')) {
      throw new OqlError(
        `Expected column ref starting with '@', got '${ref}'`,
        { code: 'INVALID_COLUMN_REF', ref },
      );
    }
    const stripped = ref.slice(1);
    if (stripped.includes('.@')) {
      // Split on every `.@` so deeply-nested refs (`@a.@b.@c`) keep all
      // segments; quote each (including the alias) for defence-in-depth.
      return stripped
        .split('.@')
        .map((seg) => this._quoteIdentifier(seg))
        .join('.');
    }
    if (hasJoins) {
      return `${BASE_ALIAS}.${this._quoteIdentifier(stripped)}`;
    }
    return this._quoteIdentifier(stripped);
  }

  /**
   * Parameterize a value that must be TYPED as text at the server —
   * JSON object keys (variadic `jsonb_build_object` slots) and
   * `string_agg` separators (ambiguous text/bytea overloads). The
   * base implementation is a plain parameter; dialects whose drivers
   * bind strings with an UNSPECIFIED type override to add an explicit
   * cast, because the server cannot infer these positions.
   */
  protected _textParameterize(value: string, params: Parameters): string {
    return this._parameterize(value, params);
  }

  /**
   * Add `value` to `params` and return the placeholder text the dialect
   * uses (`:p_3` / `$3` / `?`).
   */
  protected _parameterize(value: unknown, params: Parameters): string {
    const name = params.add(value);
    const { format, prefix, suffix } = this._parameterStyle;
    if (format === 'numbered') {
      // `name` is `p_N`; convert to 1-based index.
      const idx = Number(name.slice(name.lastIndexOf('_') + 1)) + 1;
      return `${prefix}${idx}${suffix}`;
    }
    if (format === 'positional') {
      return prefix; // typically `?`
    }
    // named
    return `${prefix}${name}${suffix}`;
  }

  /**
   * Replace every parameter placeholder in `sql` with the literal form
   * of its value, returning a fully-inlined SQL string. Used by
   * {@link createView} / {@link alterView} where stored DDL bodies
   * cannot carry placeholders.
   *
   * One-pass regex substitution so a value containing the placeholder
   * pattern (e.g. a string like `':p_1:'`) cannot be re-substituted
   * by a later iteration.
   *
   * Currently only the `'named'` placeholder format is supported —
   * which is the format every shipped SQL dialect uses on the way out
   * of this layer (the engine layer rewrites to driver-native).
   */
  protected _inlineParams(sql: string, params: Parameters): string {
    if (params.size === 0) return sql;
    const { format, prefix, suffix } = this._parameterStyle;
    if (format !== 'named') {
      throw new OqlError(
        `_inlineParams: cannot inline placeholder format '${format}' ` +
          `(only 'named' supported). The dialect should override this ` +
          `method if it needs different behaviour.`,
        { code: 'PARAM_INLINE_UNSUPPORTED', format },
      );
    }
    const record = params.asRecord();
    const REGEX_META = /[.*+?^${}()|[\]\\]/g;
    const META_REPLACEMENT = String.raw`\$&`;
    const escapedPrefix = prefix.replaceAll(REGEX_META, META_REPLACEMENT);
    const escapedSuffix = suffix.replaceAll(REGEX_META, META_REPLACEMENT);
    const NAME_GROUP = String.raw`(\w+)`;
    const re = new RegExp(`${escapedPrefix}${NAME_GROUP}${escapedSuffix}`, 'g');
    return sql.replace(re, (match, name) => {
      if (!(name in record)) return match;
      return this._formatLiteral(record[name]);
    });
  }

  /**
   * Format a JS value as a SQL literal. Used by {@link _inlineParams}
   * for view-DDL bodies. Handles the common scalar cases; dialects
   * with stricter literal syntax (e.g. Postgres `b'…'` for bytes)
   * can override.
   */
  protected _formatLiteral(value: unknown): string {
    if (value === null || value === undefined) return 'NULL';
    if (typeof value === 'string') {
      return `'${value.replaceAll("'", "''")}'`;
    }
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        throw new OqlError(
          `_formatLiteral: cannot inline non-finite number ${value}`,
          { code: 'NON_FINITE_LITERAL', value },
        );
      }
      return String(value);
    }
    if (typeof value === 'bigint') return value.toString();
    if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
    if (value instanceof Date) {
      // ISO 8601 — accepted by every shipped SQL dialect.
      return `'${value.toISOString()}'`;
    }
    if (value instanceof Uint8Array) {
      const hex = Array.from(value, (b) => b.toString(16).padStart(2, '0'))
        .join('');
      return `X'${hex}'`;
    }
    // Fallback: serialise as JSON and quote. Rare path for view bodies.
    return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  }

  /**
   * Translate an Expression node to SQL. Recurses into nested args and
   * looks the type up in the dialect's emitter map.
   */
  protected _translateExpression(
    expr: Expressions,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string {
    const emit = this._expressionMap.get(expr.$$_expression);
    if (!emit) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `expression '${expr.$$_expression}'`,
      );
    }
    const args = this.__flattenExprArgs(expr, scope, params, hasJoins);
    return emit(args);
  }

  /**
   * Translate an Aggregate node to SQL. `distinct` is spliced into the
   * function call centrally; `COUNT()` without a column emits `COUNT(1)`
   * via the dialect's emitter map.
   */
  protected _translateAggregate(
    agg: Aggregates,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string {
    const emit = this._aggregateMap.get(agg.$$_aggregate);
    if (!emit) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `aggregate '${agg.$$_aggregate}'`,
      );
    }
    const args = this.__flattenAggregateArgs(agg, scope, params, hasJoins);
    const sql = emit(args);
    if ('distinct' in agg && agg.distinct) {
      return sql.replace('(', '(DISTINCT ');
    }
    return sql;
  }

  /**
   * Translate a `QueryFilter` to a SQL boolean expression.
   *
   * Recognises `$and` / `$or` arrays (recursed), `$exists` / `$nexists`
   * correlated-subquery predicates, and per-column conditions.
   *
   * `context.aggregates` / `context.expressions`, when supplied, let
   * the filter substitute references to aggregate / expression aliases
   * declared on the SELECT for their full SQL body. This is required
   * for HAVING — standard SQL evaluates HAVING **before** the SELECT
   * list is materialised, so the alias `"cnt"` from
   * `aggregates: { cnt: { $$_aggregate: 'COUNT', … } }` is not yet in
   * scope; the predicate must restate the aggregate as
   * `HAVING COUNT("id") >= …`. Postgres enforces this strictly; MariaDB
   * and SQLite tolerate the alias form but accept the substituted form
   * just as happily, so we substitute uniformly.
   *
   * `context.outerTable` is required for `$exists` correlation when
   * the query has no joins — see {@link FilterContext}.
   */
  protected _translateFilter(
    filter: QueryFilter,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
    context?: FilterContext,
    depth = 0,
  ): string {
    if (depth > 50) {
      throw new OqlError('Maximum recursion depth exceeded in filter', {
        code: 'FILTER_DEPTH_EXCEEDED',
        depth,
      });
    }
    const parts: string[] = [];
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$exists' || key === '$nexists') {
        parts.push(
          this.__translateExists(
            value as ExistsFilter,
            key === '$nexists',
            scope,
            params,
            hasJoins,
            context?.outerTable,
            depth,
          ),
        );
        continue;
      }
      if (key === '$and' || key === '$or') {
        const arr = value as QueryFilter[];
        const sub = arr
          .map((f) =>
            `(${
              this._translateFilter(
                f,
                scope,
                params,
                hasJoins,
                context,
                depth + 1,
              )
            })`
          )
          .join(key === '$and' ? ' AND ' : ' OR ');
        // Wrap the assembled group in outer parens. Critical for `$or`:
        // the surrounding context joins `parts` with AND, and SQL `AND`
        // binds tighter than `OR`. Without the wrap, `A AND $or:[B,C] AND D`
        // would emit `A AND (B) OR (C) AND D`, which parses as
        // `(A AND B) OR (C AND D)`. The wrap forces the intended
        // `A AND ((B) OR (C)) AND D` grouping. Redundant for `$and` but
        // applied uniformly for readability.
        parts.push(`(${sub})`);
        continue;
      }
      // JSON-path keys (`@col.@key` where `col` is a declared base
      // column) are resolved BEFORE the plain column-ref path. The
      // matcher applies the disambiguation precedence — join alias,
      // then base table name, then declared column — so it only fires
      // where the key would otherwise be an unknown qualified ref.
      const jsonPath = this.__matchJsonPathKey(key, scope, hasJoins, context);
      if (jsonPath !== null) {
        const disallowed = findDisallowedJsonPathOperator(value);
        if (disallowed !== null) {
          throw new OqlError(
            `Operator '${disallowed}' is not supported on JSON path '${key}' — extraction yields text on Postgres/MariaDB but native types on SQLite, so ordered comparisons would differ per dialect. Allowed: ${
              [...JSON_PATH_ALLOWED_OPERATORS].join(', ')
            }`,
            {
              code: 'JSON_PATH_UNSUPPORTED_OPERATOR',
              operator: disallowed,
              path: key,
            },
          );
        }
        const extractSql = this._renderJsonPath(
          this._resolveColumnRef(`@${jsonPath.column}`, hasJoins),
          jsonPath.path,
        );
        parts.push(
          this.__translateColumnCondition(
            extractSql,
            value as Operators,
            scope,
            params,
            hasJoins,
          ),
        );
        continue;
      }
      const colSql = this.__resolveFilterKey(
        key,
        scope,
        params,
        hasJoins,
        context,
      );
      parts.push(
        this.__translateColumnCondition(
          colSql,
          value as Operators,
          scope,
          params,
          hasJoins,
        ),
      );
    }
    return parts.join(' AND ');
  }

  /**
   * Resolve the LHS of a `'@key': RHS` filter entry. Default behaviour
   * is just `_resolveColumnRef` (the existing WHERE / JOIN ON contract).
   * When `context` carries alias maps (HAVING path), check the declared
   * aggregate / expression maps first and emit the substituted SQL —
   * see {@link _translateFilter} for the rationale.
   */
  private __resolveFilterKey(
    key: string,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
    context?: FilterContext,
  ): string {
    if (context && key.startsWith('@')) {
      const stripped = key.slice(1);
      if (context.aggregates && stripped in context.aggregates) {
        return this._translateAggregate(
          context.aggregates[stripped]!,
          scope,
          params,
          hasJoins,
        );
      }
      if (context.expressions && stripped in context.expressions) {
        return this._translateExpression(
          context.expressions[stripped]!,
          scope,
          params,
          hasJoins,
        );
      }
    }
    return this._resolveColumnRef(key, hasJoins);
  }

  /**
   * Decide whether a filter key is a JSON path extraction, applying the
   * disambiguation precedence for multi-segment keys (`@a.@b`, deeper):
   *
   * 1. `a` is a join alias (any `a.<col>` entry in `scope`) → NOT a JSON
   *    path — the existing qualified-column resolution applies.
   * 2. `a` is the base table name (`context.outerTable`) → NOT a JSON
   *    path — the existing table-qualified resolution applies.
   * 3. `a` is a declared base column (in `scope`, with the
   *    {@link BASE_ALIAS} prefix when joined) → JSON path: returns the
   *    column plus the remaining path segments.
   * 4. Anything else → `null`; the caller falls through to the existing
   *    resolution (which the asserts layer has already policed).
   *
   * Path segments are re-validated against
   * {@link JSON_PATH_SEGMENT_PATTERN} because they are spliced into SQL
   * string literals by {@link _renderJsonPath}.
   *
   * @throws {@link OqlError} `INVALID_COLUMN_REF` when a matched path
   *   carries a non-identifier segment (hand-built input only — the
   *   asserts reject this earlier on the public path).
   */
  private __matchJsonPathKey(
    key: string,
    scope: string[],
    hasJoins: boolean,
    context?: FilterContext,
  ): { column: string; path: string[] } | null {
    if (!key.startsWith('@')) return null;
    const stripped = key.slice(1);
    if (!stripped.includes('.@')) return null;
    const segments = stripped.split('.@');
    const first = segments[0]!;
    // Precedence 1: the full qualified name resolves in scope (a joined
    // column, or an internal `__base__` / `__exists__` qualification),
    // or the first segment is a join alias with declared columns.
    if (this.__columnInScope(stripped, scope, hasJoins)) return null;
    if (scope.some((c) => c.startsWith(`${first}.`))) return null;
    // Precedence 2: base-table qualification keeps its meaning even when
    // the table shares its name with a declared column.
    if (context?.outerTable !== undefined && first === context.outerTable) {
      return null;
    }
    // Precedence 3: first segment names a declared base column.
    if (!this.__columnInScope(first, scope, hasJoins)) return null;
    const path = segments.slice(1);
    for (const seg of path) {
      if (!JSON_PATH_SEGMENT_PATTERN.test(seg)) {
        throw new OqlError(
          `JSON path '${key}' has an invalid segment '${seg}' — segments must be identifier-shaped`,
          { code: 'INVALID_COLUMN_REF', ref: key, segment: seg },
        );
      }
    }
    return { column: first, path };
  }

  /**
   * Render a JSON path extraction over an already-qualified column.
   * `columnSql` is the quoted (and, when joined, `__base__`-prefixed)
   * column; `path` is the ordered list of JSON keys to descend
   * (identifier-shaped, at least one — both guaranteed by
   * {@link AbstractTranslator.__matchJsonPathKey}). The result is used
   * as the LEFT-HAND SIDE of the standard filter-operator emitters, so
   * every dialect returns an expression that compares as text.
   *
   * The base implementation refuses — each shipped SQL dialect overrides
   * with its native accessor (`->>` / `#>>`, `json_extract`,
   * `JSON_UNQUOTE(JSON_EXTRACT(…))`).
   *
   * @throws {@link DialectUnsupportedError} Always, in the base class.
   */
  protected _renderJsonPath(columnSql: string, path: string[]): string {
    void columnSql;
    void path;
    throw new DialectUnsupportedError(this.Dialect, 'JSON path extraction');
  }

  /**
   * Translate a `$exists` / `$nexists` entry into a correlated
   * `EXISTS (SELECT 1 FROM <table> AS "__exists__" WHERE …)` predicate
   * (`NOT EXISTS` when `negate`).
   *
   * The subquery's WHERE is built from two sources, ANDed in order:
   * 1. The `on` correlation map — each key is a column of the subquery
   *    table (qualified with the {@link EXISTS_ALIAS}); each value
   *    resolves against the OUTER scope with the join-value rule
   *    (column ref iff it names a column in scope, literal otherwise).
   * 2. The optional `where` — keys are subquery-table columns
   *    (rewritten onto the {@link EXISTS_ALIAS}); values are always
   *    literals / expressions, never outer refs — correlation happens
   *    exclusively through `on`.
   */
  private __translateExists(
    spec: ExistsFilter,
    negate: boolean,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
    outerTable: string | undefined,
    depth: number,
  ): string {
    const tableSql = this._qualifiedTable(spec.table, spec.schema);
    const aliasSql = this._quoteIdentifier(EXISTS_ALIAS);
    const conditions: string[] = [];
    for (const [subKey, outerVal] of Object.entries(spec.on)) {
      // `subKey` is a bare `@col` ref into the subquery table — splice
      // in the EXISTS alias so it resolves as `"__exists__"."col"`.
      const left = this._resolveColumnRef(`@${EXISTS_ALIAS}.${subKey}`, true);
      const right = this.__renderExistsOuterValue(
        outerVal,
        scope,
        params,
        hasJoins,
        outerTable,
      );
      conditions.push(`${left} = ${right}`);
    }
    if (spec.where) {
      conditions.push(
        this._translateFilter(
          this.__prefixExistsKeys(spec.where),
          // Empty scope: value-position `@x` strings inside the
          // subquery's own filter never resolve to columns — they fall
          // through to parameterised literals (the standard rule).
          [],
          params,
          true,
          undefined,
          depth + 1,
        ),
      );
    }
    const keyword = negate ? 'NOT EXISTS' : 'EXISTS';
    return `${keyword} (SELECT 1 FROM ${tableSql} AS ${aliasSql} WHERE ${
      conditions.join(' AND ')
    })`;
  }

  /**
   * Render the outer-scope side of an EXISTS `on` entry. Same rule as
   * join values — a string `@x` is a column reference iff `x` names a
   * column in the outer scope; everything else is parameterised — with
   * one addition: inside a subquery an UNQUALIFIED outer ref would be
   * captured by the subquery table's scope (innermost FROM wins), so
   * when the outer query has no joins the ref is qualified with the
   * outer table's own name (a table's bare name is its implicit SQL
   * alias on every shipped dialect). With joins, the standard
   * `__base__` / join-alias qualification is already unambiguous.
   */
  private __renderExistsOuterValue(
    value: unknown,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
    outerTable: string | undefined,
  ): string {
    if (value === null) return 'NULL';
    if (typeof value === 'string' && value.startsWith('@')) {
      const stripped = value.slice(1);
      if (this.__columnInScope(stripped, scope, hasJoins)) {
        if (hasJoins) {
          return this._resolveColumnRef(value, true);
        }
        if (outerTable === undefined) {
          // No joins and no outer-table context (e.g. a partial-index
          // predicate) — an unqualified ref would silently bind to the
          // subquery table. Refuse loudly instead.
          throw new OqlError(
            `EXISTS filter cannot correlate '${value}': no outer table context is available in this position`,
            { code: 'EXISTS_NO_OUTER_TABLE', ref: value },
          );
        }
        return `${this._quoteIdentifier(outerTable)}.${
          this._quoteIdentifier(stripped)
        }`;
      }
    }
    return this._parameterize(value, params);
  }

  /**
   * Rewrite an EXISTS sub-`where` so its column keys resolve against
   * the subquery table: `'@col'` → `'@__exists__.@col'`. `$and` / `$or`
   * branches recurse; nested `$exists` / `$nexists` specs pass through
   * untouched — each introduces its own (shadowing) `__exists__` alias
   * and, via its own `on` map, correlates ONLY to columns of its
   * immediate outer (parent-subquery) scope; a value that names no such
   * column is parameterised as a literal, NOT correlated back to the
   * query root.
   */
  private __prefixExistsKeys(filter: QueryFilter): QueryFilter {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(filter)) {
      if (key === '$and' || key === '$or') {
        out[key] = (value as QueryFilter[]).map((f) =>
          this.__prefixExistsKeys(f)
        );
        continue;
      }
      if (key === '$exists' || key === '$nexists') {
        out[key] = value;
        continue;
      }
      out[`@${EXISTS_ALIAS}.${key}`] = value;
    }
    return out as QueryFilter;
  }

  /**
   * Translate a single value as it appears on the right-hand side of an
   * operator, in INSERT VALUES, or in UPDATE SET.
   *
   * `null`/`undefined` → `NULL`; an Expression object → recurse;
   * everything else → parameterise.
   *
   * `allowExpressions` is `true` for UPDATE/UPSERT (where expressions
   * referencing other columns are valid) and `false` for INSERT (where
   * a row has no other rows to reference).
   */
  protected _translateValue(
    value: unknown,
    scope: string[],
    params: Parameters,
    allowExpressions: boolean,
  ): string {
    if (value === null || value === undefined) return 'NULL';
    if (allowExpressions && this.__isExpressionNode(value)) {
      return this._translateExpression(value, scope, params, false);
    }
    return this._parameterize(value, params);
  }

  // =========================================================================
  // Privates (double-underscore convention)
  // =========================================================================

  /**
   * True when `v` is an Expression node — a non-null, non-Date object
   * carrying the `$$_expression` discriminant. Centralises the shape test
   * every value-rendering path performs before recursing into
   * {@link _translateExpression}.
   */
  private __isExpressionNode(v: unknown): v is Expressions {
    return typeof v === 'object' && v !== null && !(v instanceof Date) &&
      '$$_expression' in v;
  }

  /**
   * True when the bare column name `stripped` (an `@ref` minus its `@`)
   * names a column in `scope` — directly, or, when joins are present,
   * under the {@link BASE_ALIAS} qualification the base table's columns
   * carry. THE scope test shared by every value-position ref resolver.
   */
  private __columnInScope(
    stripped: string,
    scope: string[],
    hasJoins: boolean,
  ): boolean {
    const flatRef = stripped.replace('.@', '.');
    return scope.includes(flatRef) ||
      (hasJoins && scope.includes(`${BASE_ALIAS}.${stripped}`));
  }

  /**
   * Build the column scope for a SELECT — base columns (qualified with
   * BASE_ALIAS when joins are present) plus joined columns plus any
   * declared expression keys.
   */
  private __buildScope(q: Query<'SELECT'>, hasJoins: boolean): string[] {
    const scope: string[] = [];
    for (const col of q.columns as string[]) {
      scope.push(hasJoins ? `${BASE_ALIAS}.${col}` : col);
    }
    if (q.joins) {
      for (const [alias, def] of Object.entries(q.joins)) {
        if (def && Array.isArray(def.columns)) {
          for (const col of def.columns) {
            scope.push(`${alias}.${String(col)}`);
          }
        }
      }
    }
    return scope;
  }

  /**
   * Build the projection list. Resolution order per key (without the `@`):
   * 1. Aggregate name → emit aggregate.
   * 2. Expression name → emit expression.
   * 3. Join alias → auto-expand to a `JSON_ROW` of every column declared
   *    on that join (lets `@Profile: true` collapse the joined row into
   *    a single JSON column).
   * 4. Joined column ref (`Alias.@col` form) → qualified column.
   * 5. Bare column → quoted column (with BASE_ALIAS prefix when joined).
   */
  private __buildProjection(
    q: Query<'SELECT'>,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
    exprCache: Map<string, string>,
  ): string {
    const items: string[] = [];
    for (const [key, value] of Object.entries(q.projection)) {
      const stripped = key.slice(1);
      const aliasName = typeof value === 'string'
        ? value
        : stripped.includes('.@')
        ? stripped.split('.@').at(-1)!
        : stripped;
      const sourceSql = this.__resolveProjectionSource(
        stripped,
        q,
        scope,
        params,
        hasJoins,
        exprCache,
      );
      items.push(`${sourceSql} AS ${this._quoteIdentifier(aliasName)}`);
    }
    return items.join(', ');
  }

  /**
   * Resolve one projection key to its SQL source, trying aggregate alias →
   * expression alias → join alias (auto-expanded to a `JSON_ROW` over the
   * join's declared columns) → plain column ref. Everything but the last
   * lands in `exprCache` so GROUP BY / ORDER BY can reuse the body instead
   * of re-translating it and double-binding its literal params.
   *
   * @throws {@link OqlError} `JOIN_NO_COLUMNS` when a join alias is
   *   projected but the join declares no columns to expand.
   */
  private __resolveProjectionSource(
    stripped: string,
    q: Query<'SELECT'>,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
    exprCache: Map<string, string>,
  ): string {
    if (q.aggregates && stripped in q.aggregates) {
      const sql = this._translateAggregate(
        q.aggregates[stripped]!,
        scope,
        params,
        hasJoins,
      );
      // Cache for __buildOrderBy so an aggregate alias referenced in
      // ORDER BY reuses the body instead of re-translating (which would
      // re-append the aggregate's literal params, e.g. a STRING_AGG
      // separator, a second time).
      exprCache.set(stripped, sql);
      return sql;
    }
    if (q.expressions && stripped in q.expressions) {
      const sql = this._translateExpression(
        q.expressions[stripped]!,
        scope,
        params,
        hasJoins,
      );
      // Cache for __buildGroupBy so a projected-and-grouped expression is
      // translated exactly once.
      exprCache.set(stripped, sql);
      return sql;
    }
    // Join-alias auto-expand: `@Profile` → JSON_ROW aggregate of every
    // column declared on that join. JSON_ROW is itself an aggregate that
    // collects across rows (array of per-row JSON objects), so this works
    // safely for both 1-1 and 1-many joins. Callers who know it's 1-1
    // take `result[0]` from the array.
    if (q.joins && stripped in q.joins) {
      const joinDef = q.joins[stripped];
      if (!joinDef || !joinDef.columns || joinDef.columns.length === 0) {
        throw new OqlError(
          `Join '${stripped}' has no columns to auto-expand into JSON`,
          { code: 'JOIN_NO_COLUMNS', join: stripped },
        );
      }
      const jsonRow: Aggregates = {
        $$_aggregate: 'JSON_ROW',
        columns: Object.fromEntries(
          joinDef.columns.map((
            col,
          ) => [String(col), `@${stripped}.@${String(col)}`]),
        ) as Record<string, `@${string}`>,
      };
      const sql = this._translateAggregate(jsonRow, scope, params, hasJoins);
      exprCache.set(stripped, sql);
      return sql;
    }
    return this._resolveColumnRef(`@${stripped}`, hasJoins);
  }

  /**
   * Build the `FROM` clause. Without joins that is the bare qualified
   * table; with joins the base table takes {@link BASE_ALIAS} and each
   * join contributes an `AS <alias> ON …` chain.
   *
   * @throws {@link DialectUnsupportedError} On a `RIGHT` / `FULL` join the
   *   dialect's {@link DialectSupport} flags disclaim.
   */
  private __buildFrom(
    q: Query<'SELECT'>,
    hasJoins: boolean,
    scope: string[],
    params: Parameters,
  ): string {
    const baseTable = this._qualifiedTable(q.table, q.schema);
    if (!hasJoins) return baseTable;

    let from = `${baseTable} AS ${BASE_ALIAS}`;
    for (const [alias, def] of Object.entries(q.joins!)) {
      if (!def) continue;
      const joinType = def.type ?? 'INNER';
      if (joinType === 'RIGHT' && !this._support.rightJoin) {
        throw new DialectUnsupportedError(this.Dialect, 'RIGHT JOIN');
      }
      if (joinType === 'FULL' && !this._support.fullJoin) {
        throw new DialectUnsupportedError(this.Dialect, 'FULL JOIN');
      }
      const joinTable = this._qualifiedTable(String(def.table), def.schema);
      const onParts: string[] = [];
      for (const [leftKey, rightVal] of Object.entries(def.on)) {
        const left = this._resolveColumnRef(leftKey, true);
        const right = this.__renderJoinValue(rightVal, scope, params);
        onParts.push(`${left} = ${right}`);
      }
      from += ` ${joinType} JOIN ${joinTable} AS ${
        this._quoteIdentifier(alias)
      } ON ${onParts.join(' AND ')}`;
    }
    return from;
  }

  /**
   * Render the right-hand side of one `ON` pair. A string naming a column
   * in scope becomes a column ref, so `on: { '@Profile.@userId': '@id' }`
   * joins two columns rather than binding the literal `'@id'`. Anything
   * else falls through to expression / literal handling — the same rule
   * value positions in `WHERE` follow.
   */
  private __renderJoinValue(
    value: unknown,
    scope: string[],
    params: Parameters,
  ): string {
    if (value === null) return 'NULL';
    // Column ref iff it names a column in scope; otherwise fall through to
    // expression / literal handling — the same rule as WHERE value positions.
    const ref = this.__valueColumnRef(value, scope, true);
    if (ref !== null) return ref;
    if (this.__isExpressionNode(value)) {
      return this._translateExpression(value, scope, params, true);
    }
    return this._parameterize(value, params);
  }

  /**
   * Auto-GROUP-BY: every projection key that isn't itself an aggregate is
   * grouped on. Triggered when at least one aggregate is declared OR any
   * projection key auto-expands a join alias to a JSON aggregate.
   */
  private __buildGroupBy(
    q: Query<'SELECT'>,
    hasJoins: boolean,
    scope: string[],
    params: Parameters,
    exprCache: Map<string, string>,
  ): string {
    const hasAggregates = !!q.aggregates &&
      Object.keys(q.aggregates).length > 0;
    const hasAutoExpandedJoin = !!q.joins &&
      Object.keys(q.projection).some((k) => k.slice(1) in (q.joins ?? {}));
    if (!hasAggregates && !hasAutoExpandedJoin) return '';
    const groupBy: string[] = [];
    for (const key of Object.keys(q.projection)) {
      const stripped = key.slice(1);
      if (q.aggregates && stripped in q.aggregates) continue;
      // Auto-expanded join aliases also get aggregated; skip them.
      if (q.joins && stripped in q.joins) continue;
      // A declared expression projected alongside an aggregate must be
      // grouped on by its full SQL body — a bare quoted alias would be an
      // undefined column (e.g. on Postgres). Reuse the body translated in
      // __buildProjection (always cached, since group-by only touches
      // projected keys); the fallback re-translate is purely defensive.
      if (q.expressions && stripped in q.expressions) {
        const body = exprCache.get(stripped) ??
          this._translateExpression(
            q.expressions[stripped]!,
            scope,
            params,
            hasJoins,
          );
        groupBy.push(body);
        continue;
      }
      groupBy.push(this._resolveColumnRef(`@${stripped}`, hasJoins));
    }
    return groupBy.length > 0 ? ` GROUP BY ${groupBy.join(', ')}` : '';
  }

  /** Build the ` ORDER BY` clause, or `''` when `q.orderBy` is empty. */
  private __buildOrderBy(
    q: Query<'SELECT'>,
    hasJoins: boolean,
    scope: string[],
    params: Parameters,
    exprCache: Map<string, string>,
  ): string {
    if (!q.orderBy || Object.keys(q.orderBy).length === 0) return '';
    const parts: string[] = [];
    for (const [key, dir] of Object.entries(q.orderBy)) {
      parts.push(
        `${
          this.__resolveOrderByKey(q, key, hasJoins, scope, params, exprCache)
        } ${dir}`,
      );
    }
    return ` ORDER BY ${parts.join(', ')}`;
  }

  /**
   * Resolve one ORDER BY key to SQL. A key that names an aggregate,
   * declared expression, or auto-expanded join alias has NO base-table
   * column of that name — resolving it as a plain column ref would emit
   * `__base__."alias"` (an undefined column) as soon as joins force the
   * {@link BASE_ALIAS} prefix, an execution-time error on every dialect.
   * Order by the underlying SQL body instead — the same substitution
   * {@link __buildGroupBy} applies. The body was translated and cached by
   * {@link __buildProjection} (ORDER BY keys are always projection keys),
   * so this reuses it; the re-translate fallbacks are purely defensive.
   */
  private __resolveOrderByKey(
    q: Query<'SELECT'>,
    key: string,
    hasJoins: boolean,
    scope: string[],
    params: Parameters,
    exprCache: Map<string, string>,
  ): string {
    const stripped = key.slice(1);
    const isProjectedAlias = (q.aggregates && stripped in q.aggregates) ||
      (q.expressions && stripped in q.expressions) ||
      (q.joins && stripped in q.joins);
    if (isProjectedAlias) {
      const cached = exprCache.get(stripped);
      if (cached !== undefined) return cached;
      if (q.aggregates && stripped in q.aggregates) {
        return this._translateAggregate(
          q.aggregates[stripped]!,
          scope,
          params,
          hasJoins,
        );
      }
      if (q.expressions && stripped in q.expressions) {
        return this._translateExpression(
          q.expressions[stripped]!,
          scope,
          params,
          hasJoins,
        );
      }
    }
    return this._resolveColumnRef(key, hasJoins);
  }

  /**
   * `LIMIT` / `OFFSET` tail. An offset without a limit is valid OQL, but
   * not valid SQL everywhere — dialects that need a `LIMIT` in front of
   * an `OFFSET` supply an "all remaining rows" sentinel via
   * {@link AbstractTranslator._offsetOnlyLimit} and it is spliced in here.
   */
  private __buildLimitOffset(limit?: number, offset?: number): string {
    if (offset === undefined) {
      return limit === undefined ? '' : ` LIMIT ${limit}`;
    }
    if (limit === undefined) {
      const sentinel = this._offsetOnlyLimit;
      return sentinel === null
        ? ` OFFSET ${offset}`
        : ` LIMIT ${sentinel} OFFSET ${offset}`;
    }
    return ` LIMIT ${limit} OFFSET ${offset}`;
  }

  /**
   * Collect the ordered union of column names appearing across every row
   * of an INSERT's `data` array, validating each is in the schema's
   * `columns`. Order is preserved by first occurrence.
   */
  protected _collectInsertColumns(
    rows: Array<Record<string, unknown>>,
    schemaColumns: string[],
  ): string[] {
    // `Set` membership instead of `Array.includes` — this runs in a
    // nested loop (every key of every row), so the O(1) lookup matters
    // for wide tables / large multi-row inserts.
    const schemaSet = new Set(schemaColumns);
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (seen.has(key)) continue;
        if (!schemaSet.has(key)) {
          throw new OqlError(
            `INSERT data has column '${key}' not declared in 'columns'`,
            { code: 'INSERT_COLUMN_NOT_IN_SCHEMA', column: key },
          );
        }
        seen.add(key);
        out.push(key);
      }
    }
    return out;
  }

  /**
   * Render a single row's value for an INSERT VALUES tuple.
   * - `present === false` (key missing entirely from this row) → `DEFAULT`
   * - `null` → `NULL`
   * - Expression object → translate (no column scope; INSERT can't ref
   *   other rows' columns)
   * - everything else → parameterise
   */
  protected _renderInsertValue(
    value: unknown,
    present: boolean,
    params: Parameters,
  ): string {
    if (!present) return 'DEFAULT';
    if (value === null) return 'NULL';
    if (this.__isExpressionNode(value)) {
      return this._translateExpression(value, [], params, false);
    }
    return this._parameterize(value, params);
  }

  /**
   * Render the shared INSERT prelude — the collected column list plus the
   * `(v, …), (v, …)` VALUES tuples — from a set of data rows. Used by
   * {@link _buildInsert}, {@link _buildOnConflictUpsert}, and MariaDB's
   * `ON DUPLICATE KEY UPDATE` upsert, which all open with an identical
   * `INSERT INTO … (cols) VALUES …` head. Returns `insertCols` too so
   * callers can derive the default conflict-update set from it.
   */
  protected _renderInsertColsAndValues(
    rows: Array<Record<string, unknown>>,
    schemaColumns: string[],
    params: Parameters,
  ): { insertCols: string[]; colList: string; valuesSql: string } {
    const insertCols = this._collectInsertColumns(rows, schemaColumns);
    const colList = insertCols
      .map((c) => this._quoteIdentifier(c))
      .join(', ');
    const valuesSql = rows
      .map((row) =>
        `(${
          insertCols
            .map((c) => this._renderInsertValue(row[c], c in row, params))
            .join(', ')
        })`
      )
      .join(', ');
    return { insertCols, colList, valuesSql };
  }

  /**
   * Build the trailing ` RETURNING col1, col2, ...` clause when the
   * dialect supports RETURNING for the given DML kind. Only `insert` and
   * `upsert` are supported here — UPDATE and DELETE never emit RETURNING
   * regardless of dialect.
   *
   * Callers pass the resolved column list (typically `q.projection ??
   * q.columns`); this method just quotes and joins.
   */
  protected _buildReturning(
    cols: ReadonlyArray<string>,
    op: 'insert' | 'upsert',
  ): string {
    if (!this._support.returning[op]) return '';
    const list = cols.map((c) => this._quoteIdentifier(c)).join(', ');
    return ` RETURNING ${list}`;
  }

  /**
   * The keyword used to reference the conflicting (proposed) row inside an
   * `ON CONFLICT … DO UPDATE SET` clause. Postgres spells it `EXCLUDED`;
   * SQLite spells it `excluded`. Used by {@link _buildOnConflictUpsert}.
   */
  protected get _excludedKeyword(): string {
    return 'EXCLUDED';
  }

  /**
   * Build an `INSERT … ON CONFLICT (…) DO UPDATE SET …` (or `DO NOTHING`)
   * upsert. Shared by the Postgres and SQLite translators, which differ only
   * in the {@link _excludedKeyword} case. MariaDB uses
   * `ON DUPLICATE KEY UPDATE` instead and supplies its own `_buildUpsert`.
   */
  protected _buildOnConflictUpsert(
    q: Query<'UPSERT'>,
    params: Parameters,
  ): string {
    const cols = q.columns as string[];
    const rows = Array.isArray(q.data) ? q.data : [q.data];
    const { insertCols, colList, valuesSql } = this._renderInsertColsAndValues(
      rows,
      cols,
      params,
    );
    const tableSql = this._qualifiedTable(q.table, q.schema);

    const conflictKeys = q.conflictKeys.map((k) => k.slice(1));
    const conflictCols = conflictKeys
      .map((c) => this._quoteIdentifier(c))
      .join(', ');
    const updateCols = q.updateOnConflict
      ? q.updateOnConflict.map((k) => k.slice(1))
      : insertCols.filter((c) => !conflictKeys.includes(c));

    const excluded = this._excludedKeyword;
    const onConflict = updateCols.length > 0
      ? `ON CONFLICT (${conflictCols}) DO UPDATE SET ${
        updateCols
          .map((c) => {
            const quoted = this._quoteIdentifier(c);
            return `${quoted} = ${excluded}.${quoted}`;
          })
          .join(', ')
      }`
      : `ON CONFLICT (${conflictCols}) DO NOTHING`;

    const returnCols = (q.projection as ReadonlyArray<string> | undefined) ??
      cols;
    const returning = this._buildReturning(returnCols, 'upsert');
    return `INSERT INTO ${tableSql} (${colList}) VALUES ${valuesSql} ${onConflict}${returning}`;
  }

  /**
   * Build a `CREATE TABLE`. The statement skeleton — `IF NOT EXISTS`, the
   * comma-joined column definitions, the table-level constraints — is
   * identical across every SQL dialect; only the per-column rendering
   * ({@link _renderColumnDefinition}: type mapping, comment syntax)
   * differs, so that stays abstract.
   */
  protected _buildCreateTable(q: Query<'CREATE_TABLE'>): string[] {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const ifNotExists = q.ifNotExists ? 'IF NOT EXISTS ' : '';
    const columnDefs = Object.entries(q.columns).map(([name, def]) =>
      this._renderColumnDefinition(name, def as ColumnDefinition)
    );
    const constraints = this._renderTableConstraints(q);
    const body = [...columnDefs, ...constraints].join(', ');
    return [`CREATE TABLE ${ifNotExists}${tableSql} (${body})`];
  }

  /**
   * Render one `"name" <type> [NOT NULL] [comment]` column definition.
   * Dialect-specific (type mapping, comment syntax), so concretes own it;
   * {@link _buildCreateTable} and the ALTER-TABLE builders emit it.
   */
  protected abstract _renderColumnDefinition(
    name: string,
    def: ColumnDefinition,
  ): string;

  /**
   * Append a length / precision+scale suffix to an already-mapped base
   * SQL type: `VARCHAR` + `{ length: 255 }` → `VARCHAR(255)`; `DECIMAL` +
   * `{ precision: 10, scale: 2 }` → `DECIMAL(10, 2)`. Shared by every
   * dialect's column-type rendering.
   */
  protected _renderTypeSuffix(baseType: string, def: ColumnDefinition): string {
    if ('length' in def && def.length !== undefined) {
      return `${baseType}(${def.length})`;
    }
    if ('precision' in def && def.precision !== undefined) {
      const scale = (def as { scale?: number }).scale;
      return scale === undefined
        ? `${baseType}(${def.precision})`
        : `${baseType}(${def.precision}, ${scale})`;
    }
    return baseType;
  }

  /**
   * Render the table-level constraints (PRIMARY KEY, UNIQUE, FOREIGN KEY)
   * for a `CREATE TABLE`. Shared across the SQL dialects.
   */
  protected _renderTableConstraints(q: Query<'CREATE_TABLE'>): string[] {
    const constraints: string[] = [];
    if (q.primaryKey && q.primaryKey.length > 0) {
      const cols = (q.primaryKey as string[])
        .map((c) => this._quoteIdentifier(c))
        .join(', ');
      constraints.push(`PRIMARY KEY (${cols})`);
    }
    if (q.uniqueKeys) {
      for (const [name, cols] of Object.entries(q.uniqueKeys)) {
        const colList = (cols as string[])
          .map((c) => this._quoteIdentifier(c))
          .join(', ');
        constraints.push(
          `CONSTRAINT ${this._quoteIdentifier(name)} UNIQUE (${colList})`,
        );
      }
    }
    if (q.foreignKeys) {
      for (const [name, fk] of Object.entries(q.foreignKeys)) {
        constraints.push(this._renderForeignKey(name, fk));
      }
    }
    return constraints;
  }

  /**
   * Render a single `CONSTRAINT … FOREIGN KEY (…) REFERENCES …` clause.
   * Shared across the SQL dialects.
   */
  protected _renderForeignKey(name: string, fk: unknown): string {
    const fkObj = fk as {
      columns: string[];
      references: { table: string; schema?: string; columns: string[] };
      onDelete?: string;
      onUpdate?: string;
    };
    const cols = fkObj.columns.map((c) => this._quoteIdentifier(c)).join(', ');
    const refTable = fkObj.references.schema
      ? this._quoteQualified(fkObj.references.schema, fkObj.references.table)
      : this._quoteIdentifier(fkObj.references.table);
    const refCols = fkObj.references.columns
      .map((c) => this._quoteIdentifier(c))
      .join(', ');
    let sql = `CONSTRAINT ${
      this._quoteIdentifier(name)
    } FOREIGN KEY (${cols}) REFERENCES ${refTable} (${refCols})`;
    if (fkObj.onDelete) {
      sql += ` ON DELETE ${fkObj.onDelete.replace('_', ' ')}`;
    }
    if (fkObj.onUpdate) {
      sql += ` ON UPDATE ${fkObj.onUpdate.replace('_', ' ')}`;
    }
    return sql;
  }

  /**
   * Best-effort scope for partial-index `where` clauses. We don't have
   * the table's column list at this layer, so harvest column names from
   * the filter keys themselves — the database enforces real existence.
   */
  protected _scopeFromFilterKeys(
    filter: Record<string, unknown>,
  ): string[] {
    const out: string[] = [];
    const visit = (f: Record<string, unknown>) => {
      for (const [key, value] of Object.entries(f)) {
        if (key === '$and' || key === '$or') {
          for (const sub of value as Array<Record<string, unknown>>) {
            visit(sub);
          }
          continue;
        }
        if (key.startsWith('@')) {
          const stripped = key.slice(1);
          out.push(
            stripped.includes('.@') ? stripped.replace('.@', '.') : stripped,
          );
        }
      }
    };
    visit(filter);
    return out;
  }

  /**
   * Translate the right-hand side of a `'@col': RHS` filter entry.
   * RHS may be a literal, an array (implicit `$in`), `null` (implicit
   * IS NULL), or an Operators object.
   */
  private __translateColumnCondition(
    colSql: string,
    rhs: Operators,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string {
    if (rhs === null) return `${colSql} IS NULL`;
    if (Array.isArray(rhs)) {
      const placeholders = rhs
        .map((v) => this.__renderOperatorValue(v, scope, params, hasJoins))
        .join(', ');
      return `${colSql} IN (${placeholders})`;
    }
    if (typeof rhs !== 'object' || rhs instanceof Date) {
      return `${colSql} = ${
        this.__renderOperatorValue(rhs, scope, params, hasJoins)
      }`;
    }
    const opParts: string[] = [];
    for (const [op, val] of Object.entries(rhs)) {
      opParts.push(
        this.__emitOperator(colSql, op, val, scope, params, hasJoins),
      );
    }
    return opParts.join(' AND ');
  }

  /**
   * Emit one `<column> <op> <value>` predicate. `$null`, `$between`, `$in`
   * and `$nin` are handled here because their SQL shape isn't a simple
   * binary infix; everything else defers to the dialect's
   * `_filterOperatorMap`, which is also what makes an unknown operator a
   * per-dialect rather than a global failure.
   *
   * @throws {@link DialectUnsupportedError} When `op` has no entry in the
   *   dialect's operator map.
   */
  private __emitOperator(
    colSql: string,
    op: string,
    val: unknown,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string {
    if (op === '$null') {
      return val ? `${colSql} IS NULL` : `${colSql} IS NOT NULL`;
    }
    if (op === '$between') {
      const [lo, hi] = val as [unknown, unknown];
      const loSql = this.__renderOperatorValue(lo, scope, params, hasJoins);
      const hiSql = this.__renderOperatorValue(hi, scope, params, hasJoins);
      return `${colSql} BETWEEN ${loSql} AND ${hiSql}`;
    }
    if (op === '$in' || op === '$nin') {
      const arr = val as unknown[];
      const placeholders = arr
        .map((v) => this.__renderOperatorValue(v, scope, params, hasJoins))
        .join(', ');
      const opSql = op === '$in' ? 'IN' : 'NOT IN';
      return `${colSql} ${opSql} (${placeholders})`;
    }
    const emit = this._filterOperatorMap.get(op);
    if (!emit) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `filter operator '${op}'`,
      );
    }
    // $startsWith / $endsWith / $contains splice the bound value into a LIKE
    // pattern. A column ref (or expression) keeps the standard path; a string
    // literal has its `%`/`_` (and the escape char) escaped with a trailing
    // ESCAPE clause so it matches verbatim.
    if (op === '$startsWith' || op === '$endsWith' || op === '$contains') {
      const ref = this.__valueColumnRef(val, scope, hasJoins);
      if (ref !== null) return emit(colSql, ref);
      if (typeof val !== 'string') {
        return emit(
          colSql,
          this.__renderOperatorValue(val, scope, params, hasJoins),
        );
      }
      const escaped = val.replace(
        LIKE_WILDCARDS,
        (ch) => `${LIKE_ESCAPE_CHAR}${ch}`,
      );
      const valueSql = this._parameterize(escaped, params);
      return `${emit(colSql, valueSql)}${this._likeEscapeClause()}`;
    }
    return emit(
      colSql,
      this.__renderOperatorValue(val, scope, params, hasJoins),
    );
  }

  /**
   * Resolve a value-position column reference. THE single rule for every value
   * position (shorthand `{'@a': '@b'}`, arrays / `$in`, operator RHS,
   * `$between`, and join `ON`): a string `@x` is a column reference **iff `x`
   * is a column in `scope`**; anything else — including an `@`-string whose
   * name is not a known column — is data. Returns the qualified column SQL, or
   * `null` when the value should be treated as a literal and parameterised.
   *
   * Note: value-position column references are an SQL-dialect feature. The
   * Mongo dialect treats every find-filter value as a literal (it cannot
   * compare two fields in a `$match` without `$expr`); use an Expression for a
   * portable column-to-column comparison.
   */
  private __valueColumnRef(
    value: unknown,
    scope: string[],
    hasJoins: boolean,
  ): string | null {
    if (typeof value !== 'string' || !value.startsWith('@')) return null;
    if (this.__columnInScope(value.slice(1), scope, hasJoins)) {
      return this._resolveColumnRef(value, hasJoins);
    }
    return null;
  }

  /**
   * Render an operator's right-hand value as SQL: expression objects are
   * translated, `@x` strings naming a column in `scope` become qualified
   * column refs (via {@link AbstractTranslator.__valueColumnRef}), and
   * everything else is parameterised.
   */
  private __renderOperatorValue(
    value: unknown,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string {
    if (value === null) return 'NULL';
    if (this.__isExpressionNode(value)) {
      return this._translateExpression(value, scope, params, hasJoins);
    }
    return this.__valueColumnRef(value, scope, hasJoins) ??
      this._parameterize(value, params);
  }

  /** Walk an Expression's `args` into an ordered array of SQL fragments. */
  private __flattenExprArgs(
    expr: Expressions,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string[] {
    if (!('args' in expr) || expr.args === undefined) return [];
    const args = expr.args as unknown;
    if (typeof args === 'object' && args !== null && !Array.isArray(args)) {
      return this.__flattenObjectArgs(
        expr.$$_expression,
        args as Record<string, unknown>,
        scope,
        params,
        hasJoins,
      );
    }
    if (Array.isArray(args)) {
      return args.map((a) => this.__renderExprArg(a, scope, params, hasJoins));
    }
    return [this.__renderExprArg(args, scope, params, hasJoins)];
  }

  /**
   * Flatten a named-argument expression node into the positional array its
   * emitter expects. This is where each expression's argument order is
   * pinned, and where optional args (`SUBSTR.length`, `LPAD.fill`) decide
   * the emitter's arity.
   *
   * @throws {@link OqlError} `UNHANDLED_EXPRESSION` if an expression type
   *   takes object args but is missing a case here — a translator bug, not
   *   bad caller input.
   */
  private __flattenObjectArgs(
    type: Expressions['$$_expression'],
    args: Record<string, unknown>,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string[] {
    const r = (v: unknown) => this.__renderExprArg(v, scope, params, hasJoins);
    switch (type) {
      case 'POWER':
        return [r(args.base), r(args.exponent)];
      case 'DATE_ADD':
        return [r(args.date), r(args.amount), r(args.unit)];
      case 'DATE_DIFF':
        return [r(args.from), r(args.to), r(args.unit)];
      case 'SUBSTR':
        return args.length !== undefined
          ? [r(args.string), r(args.start), r(args.length)]
          : [r(args.string), r(args.start)];
      case 'REPLACE':
        return [r(args.string), r(args.search), r(args.replace)];
      case 'LPAD':
      case 'RPAD':
        return args.fill !== undefined
          ? [r(args.string), r(args.length), r(args.fill)]
          : [r(args.string), r(args.length)];
      case 'ENCRYPT':
      case 'DECRYPT':
        return [r(args.data), r(args.secret)];
      default:
        throw new OqlError(`Unhandled object-arg expression: ${type}`, {
          code: 'UNHANDLED_EXPRESSION',
          expression: type,
        });
    }
  }

  /**
   * Render one expression argument. An `@`-prefixed string is a column ref
   * only if it is actually in scope — otherwise it binds as a literal, so
   * user data that happens to start with `@` can't be smuggled into an
   * identifier position.
   */
  private __renderExprArg(
    value: unknown,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string {
    if (value === null) return 'NULL';
    if (typeof value === 'string' && value.startsWith('@')) {
      if (this.__columnInScope(value.slice(1), scope, hasJoins)) {
        return this._resolveColumnRef(value, hasJoins);
      }
      return this._parameterize(value, params);
    }
    if (this.__isExpressionNode(value)) {
      return this._translateExpression(value, scope, params, hasJoins);
    }
    return this._parameterize(value, params);
  }

  /**
   * Flatten an aggregate node into its emitter's positional args. Bare
   * `COUNT` yields none; `JSON_ROW` yields an alternating key/value run;
   * `STRING_AGG` appends its separator (default `','`). Keys and the
   * separator go through `_textParameterize` because they land in
   * overload-ambiguous positions on some dialects.
   */
  private __flattenAggregateArgs(
    agg: Aggregates,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string[] {
    if (agg.$$_aggregate === 'COUNT' && !('column' in agg)) return [];
    if (agg.$$_aggregate === 'JSON_ROW') {
      const out: string[] = [];
      for (const [key, source] of Object.entries(agg.columns)) {
        out.push(this._textParameterize(key, params));
        out.push(this.__renderAggregateColumn(source, scope, params, hasJoins));
      }
      return out;
    }
    if (agg.$$_aggregate === 'STRING_AGG') {
      return [
        this.__renderAggregateColumn(agg.column, scope, params, hasJoins),
        this._textParameterize(agg.separator ?? ',', params),
      ];
    }
    return [
      this.__renderAggregateColumn(
        (agg as { column: unknown }).column,
        scope,
        params,
        hasJoins,
      ),
    ];
  }

  /**
   * Render an aggregate's operand. Unlike a filter value position, a
   * literal is never bound here — aggregating over a constant is a
   * mistake in the query, not a shorthand — so only a column ref or an
   * expression node is accepted.
   *
   * @throws {@link OqlError} `INVALID_AGGREGATE_COLUMN` for a non-string,
   *   non-expression operand; `INVALID_COLUMN_REF` (from
   *   {@link _resolveColumnRef}) for a string missing its `@` prefix.
   */
  private __renderAggregateColumn(
    column: unknown,
    scope: string[],
    params: Parameters,
    hasJoins: boolean,
  ): string {
    if (typeof column === 'string') {
      return this._resolveColumnRef(column, hasJoins);
    }
    if (this.__isExpressionNode(column)) {
      return this._translateExpression(column, scope, params, hasJoins);
    }
    throw new OqlError('Aggregate column must be a column ref or expression', {
      code: 'INVALID_AGGREGATE_COLUMN',
    });
  }
}

export { BASE_ALIAS, COUNT_ALIAS, EXISTS_ALIAS };
