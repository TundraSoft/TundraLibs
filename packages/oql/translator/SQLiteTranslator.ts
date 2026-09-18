/**
 * SQLite OQL translator. Targets SQLite 3.39+ (FULL JOIN, native
 * `ON CONFLICT DO UPDATE`, JSON1, RETURNING).
 *
 * Compatibility notes (full breakdown in `packages/oql/docs/OQL-Compatibility.md`):
 * - Schemas: SQLite has no schema object at all, so `CREATE_SCHEMA` /
 *   `DROP_SCHEMA` are refused (`DialectUnsupportedError`). The OQL
 *   `schema` a query carries is instead folded into the physical
 *   identifier as a `<schema>_<name>` prefix — see `_qualifiedTable`
 *   below — so every table, view, and index lives in the one physical
 *   file, with cross-"schema" foreign keys enforced like any other.
 * - Materialized views: not supported. CREATE_VIEW with `materialized: true`
 *   silently falls back to a regular view; REFRESH_MATERIALIZED_VIEW emits
 *   a no-op `SELECT 1`.
 * - TRUNCATE: emulated as `DELETE FROM`.
 * - UUID(): emits a `crypto.randomUUID()` literal at translate time. Each
 *   call materialises a fresh value — fine for INSERT/UPDATE; surprising
 *   inside SELECT (the same UUID for every row).
 * - HASH/ENCRYPT/DECRYPT: passthrough — the value is emitted as-is. SQLite
 *   has no built-in crypto; callers must hash/encrypt client-side.
 * - RETURNING: only emitted on INSERT/UPSERT, never on UPDATE/DELETE.
 *
 * @module translator/SQLiteTranslator
 */

import type {
  AggregateFunction,
  ColumnDefinition,
  Expressions,
  Query,
} from '../types/mod.ts';
import { DialectUnsupportedError } from '../errors/mod.ts';
import { AbstractTranslator } from './AbstractTranslator.ts';
import type {
  AggregateMap,
  DialectSupport,
  ExpressionMap,
  FilterOperatorMap,
  IdentifierQuote,
  ParameterStyle,
} from './types/mod.ts';
import { Parameters } from './Parameters.ts';

/**
 * SQL data-type map. SQLite's storage classes (TEXT, INTEGER, REAL, BLOB,
 * NUMERIC) are advisory but kept readable for portability.
 */
const SQL_TYPE_MAP: Record<string, string> = {
  CHAR: 'TEXT',
  VARCHAR: 'TEXT',
  TEXT: 'TEXT',
  CLOB: 'TEXT',
  TINYINT: 'INTEGER',
  SMALLINT: 'INTEGER',
  INTEGER: 'INTEGER',
  INT: 'INTEGER',
  BIGINT: 'INTEGER',
  DECIMAL: 'NUMERIC',
  NUMERIC: 'NUMERIC',
  FLOAT: 'REAL',
  DOUBLE: 'REAL',
  REAL: 'REAL',
  BINARY: 'BLOB',
  VARBINARY: 'BLOB',
  BLOB: 'BLOB',
  DATE: 'TEXT',
  TIME: 'TEXT',
  DATETIME: 'TEXT',
  TIMESTAMP: 'TEXT',
  TIMESTAMPTZ: 'TEXT',
  BOOLEAN: 'INTEGER',
  BIT: 'INTEGER',
  JSON: 'TEXT',
  JSONB: 'TEXT',
  UUID: 'TEXT',
  XML: 'TEXT',
};

/**
 * Emits SQLite SQL. Stateless and reusable — see {@link AbstractTranslator}
 * for the shared method surface and the module header above for the
 * emulations SQLite needs (schemas, TRUNCATE, materialized views).
 */
export class SQLiteTranslator extends AbstractTranslator {
  /** Dialect tag, reported on every error this translator raises. */
  public override readonly Dialect = 'sqlite';

  /** Double quotes; an embedded quote doubles to `""`. */
  protected override readonly _identifierQuote: IdentifierQuote = {
    open: '"',
    close: '"',
    escape: '""',
  };

  /** Named placeholders in the engine-compat `:name:` form. */
  protected override readonly _parameterStyle: ParameterStyle = {
    // `:name:` form is what the engine layer's `_standardizeQuery`
    // rewrites to dialect-native. Emitting it from every translator means
    // OQL output flows through the engine pipeline without an extra hop.
    // SQLite's native form is `:name` (one colon); the engine drops the
    // trailing colon for us via parameterReplacement.
    format: 'named',
    prefix: ':',
    suffix: ':',
  };

  /**
   * `schema` is genuinely off — SQLite has no schema object to create or
   * drop, so `CREATE_SCHEMA` / `DROP_SCHEMA` throw
   * `DialectUnsupportedError` (see `_buildCreateSchema` /
   * `_buildDropSchema`). This does NOT stop a query from carrying a
   * `schema` field elsewhere (CREATE_TABLE, SELECT, …) — `schema` there
   * is folded into the physical name as a prefix by `_qualifiedTable`,
   * unconditionally on every dialect. `truncate` reads as supported
   * because it's emulated, not native — see `_buildTruncate`.
   */
  protected override readonly _support: DialectSupport = {
    schema: false,
    materializedView: false, // emulated as regular view (see _buildCreateView)
    truncate: true, // emulated as `DELETE FROM` (see _buildTruncate)
    rightJoin: true,
    fullJoin: true,
    // RETURNING is only emitted on INSERT and UPSERT across all dialects.
    // SQLite 3.35+ technically supports it on UPDATE/DELETE too, but we
    // deliberately don't use it for cross-dialect uniformity.
    returning: { insert: true, upsert: true },
  };

  /**
   * SQLite's grammar only accepts `OFFSET` as part of a `LIMIT` clause, so
   * an offset-only query needs a limit in front of it. A negative limit is
   * SQLite's documented "no upper bound" form: "If the LIMIT expression
   * evaluates to a negative value, then there is no upper bound on the
   * number of rows returned."
   */
  protected override readonly _offsetOnlyLimit: string | null = '-1';

  /**
   * SQLite expression emitters. `HASH` / `ENCRYPT` / `DECRYPT` are
   * identity — SQLite ships no crypto, so the value passes through
   * untransformed rather than failing.
   */
  protected override readonly _expressionMap: ExpressionMap = new Map<
    Expressions['$$_expression'],
    (args: string[]) => string
  >([
    ['ADD', (a) => `(${a.join(' + ')})`],
    ['SUBTRACT', (a) => `(${a.join(' - ')})`],
    ['MULTIPLY', (a) => `(${a.join(' * ')})`],
    ['DIVIDE', (a) => `(${a.join(' / ')})`],
    ['MODULO', (a) => `(${a.join(' % ')})`],
    ['POWER', (a) => `POWER(${a[0]}, ${a[1]})`],
    ['SQRT', (a) => `SQRT(${a[0]})`],
    ['ABS', (a) => `ABS(${a[0]})`],
    ['CEIL', (a) => `CEIL(${a[0]})`],
    ['FLOOR', (a) => `FLOOR(${a[0]})`],
    [
      'ROUND',
      (a) => a.length > 1 ? `ROUND(${a[0]}, ${a[1]})` : `ROUND(${a[0]})`,
    ],
    ['CONCAT', (a) => a.join(' || ')],
    ['LENGTH', (a) => `LENGTH(${a[0]})`],
    ['LOWER', (a) => `LOWER(${a[0]})`],
    ['UPPER', (a) => `UPPER(${a[0]})`],
    ['TRIM', (a) => `TRIM(${a[0]})`],
    ['LTRIM', (a) => `LTRIM(${a[0]})`],
    ['RTRIM', (a) => `RTRIM(${a[0]})`],
    [
      'SUBSTR',
      (a) =>
        a.length === 3
          ? `SUBSTR(${a[0]}, ${a[1]}, ${a[2]})`
          : `SUBSTR(${a[0]}, ${a[1]})`,
    ],
    ['REPLACE', (a) => `REPLACE(${a[0]}, ${a[1]}, ${a[2]})`],
    // SQLite has no native LPAD/RPAD; both are composed in
    // `__padExpression` so a custom fill pads with the fill the caller
    // asked for, exactly as it does on Postgres and MariaDB.
    ['LPAD', (a) => this.__padExpression(a, 'left')],
    ['RPAD', (a) => this.__padExpression(a, 'right')],
    ['NOW', () => `datetime('now')`],
    ['CURRENT_DATE', () => `date('now')`],
    ['CURRENT_TIME', () => `time('now')`],
    ['CURRENT_TIMESTAMP', () => `datetime('now')`],
    ['CURRENT_TIMESTAMPTZ', () => `datetime('now')`],
    [
      'DATE_ADD',
      (a) => {
        // datetime(date, '+' || amount || ' ' || unit)
        const [date, amount, unit] = a;
        return `datetime(${date}, '+' || ${amount} || ' ' || ${unit})`;
      },
    ],
    [
      'DATE_DIFF',
      (a) => {
        const [from, to, unit] = a;
        const scale = this._timeUnitCase(unit, {
          DAYS: '1',
          HOURS: '24',
          MINUTES: '1440',
          SECONDS: '86400',
          MONTHS: '1.0/30',
          YEARS: '1.0/365',
        });
        return `CAST((julianday(${to}) - julianday(${from})) * ${scale} AS INTEGER)`;
      },
    ],
    // UUID: SQLite has no native uuid generator. We pre-generate a value
    // at translation time via `crypto.randomUUID()` and inline it as a
    // SQL string literal. Caveat: when used inside a SELECT projection
    // or WHERE expression, every row sees the SAME generated UUID since
    // it's resolved once per `translate()` call. Useful for INSERT/
    // UPDATE values; risky for SELECT — caller's responsibility.
    ['UUID', () => `'${crypto.randomUUID()}'`],
    // HASH / ENCRYPT / DECRYPT: SQLite has no built-in cryptographic
    // primitives, so we emit the input as-is (no hashing, no encryption,
    // no decryption — the value round-trips unchanged). This keeps OQL
    // queries cross-dialect-portable at the cost of silently degrading
    // to plaintext on SQLite. For real column-level crypto, encrypt in
    // application code before INSERT and after SELECT. (SQLCipher
    // encrypts the whole database file but doesn't help at the column
    // level.)
    ['HASH', (a) => a[0]!],
    // ENCRYPT/DECRYPT object args flatten to [data, secret] — emit data.
    ['ENCRYPT', (a) => a[0]!],
    ['DECRYPT', (a) => a[0]!],
  ]);

  /**
   * SQLite aggregate emitters. `STRING_AGG` and `ARRAY_AGG` are spelled
   * `group_concat` / `json_group_array` here, so results come back as a
   * JSON string rather than a native array.
   */
  protected override readonly _aggregateMap: AggregateMap = new Map<
    AggregateFunction,
    (args: string[]) => string
  >([
    // No-arg COUNT → COUNT(1) (better optimiser path than COUNT(*) on most
    // engines; same semantics for non-NULL row count).
    ['COUNT', (a) => (a.length === 0 ? 'COUNT(1)' : `COUNT(${a[0]})`)],
    ['SUM', (a) => `SUM(${a[0]})`],
    ['AVG', (a) => `AVG(${a[0]})`],
    ['MIN', (a) => `MIN(${a[0]})`],
    ['MAX', (a) => `MAX(${a[0]})`],
    ['STRING_AGG', (a) => `group_concat(${a[0]}, ${a[1]})`],
    ['ARRAY_AGG', (a) => `json_group_array(${a[0]})`],
    // JSON_ROW is an *aggregate* — it collects rows into a JSON array, one
    // object per row. The inner json_object builds the per-row object;
    // json_group_array aggregates them.
    ['JSON_ROW', (a) => `json_group_array(json_object(${a.join(', ')}))`],
  ]);

  /**
   * SQLite filter-operator emitters. `$ilike` / `$nilike` fall back to
   * plain `LIKE`, which SQLite folds case-insensitively for ASCII only —
   * accented and non-Latin text compares case-*sensitively*.
   */
  protected override readonly _filterOperatorMap: FilterOperatorMap = new Map<
    string,
    (column: string, value: string) => string
  >([
    ['$eq', (c, v) => `${c} = ${v}`],
    ['$ne', (c, v) => `${c} <> ${v}`],
    ['$gt', (c, v) => `${c} > ${v}`],
    ['$gte', (c, v) => `${c} >= ${v}`],
    ['$lt', (c, v) => `${c} < ${v}`],
    ['$lte', (c, v) => `${c} <= ${v}`],
    ['$like', (c, v) => `${c} LIKE ${v}`],
    ['$nlike', (c, v) => `${c} NOT LIKE ${v}`],
    ['$ilike', (c, v) => `${c} LIKE ${v}`], // ASCII LIKE is CI by default
    ['$nilike', (c, v) => `${c} NOT LIKE ${v}`],
    ['$startsWith', (c, v) => `${c} LIKE (${v} || '%')`],
    ['$endsWith', (c, v) => `${c} LIKE ('%' || ${v})`],
    ['$contains', (c, v) => `${c} LIKE ('%' || ${v} || '%')`],
  ]);

  // ---------------------------------------------------------------------------
  // Filters: JSON path extraction
  // ---------------------------------------------------------------------------

  /**
   * JSON path extraction for a `@col.@key` filter key:
   * `json_extract("col", '$.a.b')`. Unlike Postgres/MariaDB's text
   * accessors, `json_extract` returns the value with its native SQLite
   * type (INTEGER/REAL/TEXT) — one reason the ordered comparison
   * operators are refused on JSON paths in v1.
   */
  protected override _renderJsonPath(
    columnSql: string,
    path: string[],
  ): string {
    return `json_extract(${columnSql}, '$.${path.join('.')}')`;
  }

  // ---------------------------------------------------------------------------
  // DML: INSERT — SQLite-specific value rendering
  // ---------------------------------------------------------------------------

  /**
   * SQLite (any version) doesn't accept `DEFAULT` as a value in
   * `INSERT … VALUES (…)`. Per the SQLite grammar, defaults are only
   * applied when the column is absent from the INSERT column list — but
   * OQL's multi-row INSERT collects the column union and emits one
   * VALUES tuple per row. To keep the contract intact, missing keys
   * emit `NULL` on SQLite instead. Trade-off: a column with a `DEFAULT`
   * clause will get NULL rather than its default when at least one
   * other row in the same INSERT supplies that column. Callers that
   * rely on column defaults should keep all rows uniform.
   */
  protected override _renderInsertValue(
    value: unknown,
    present: boolean,
    params: Parameters,
  ): string {
    if (!present) return 'NULL';
    return this._translateValue(value, [], params, true);
  }

  // ---------------------------------------------------------------------------
  // DML: UPSERT
  // ---------------------------------------------------------------------------

  /**
   * SQLite spells the conflicting-row reference in lowercase (`excluded`),
   * unlike Postgres's `EXCLUDED`. Otherwise the upsert is identical, so we
   * reuse the shared `_buildOnConflictUpsert`.
   */
  protected override get _excludedKeyword(): string {
    return 'excluded';
  }

  /** `INSERT … ON CONFLICT DO UPDATE`, via the shared builder. */
  protected override _buildUpsert(
    q: Query<'UPSERT'>,
    params: Parameters,
  ): string {
    return this._buildOnConflictUpsert(q, params);
  }

  // ---------------------------------------------------------------------------
  // DDL
  // ---------------------------------------------------------------------------

  /**
   * Unreachable in practice — `_support.schema` is `false`, so the public
   * {@link AbstractTranslator.createSchema} throws first. Kept only to
   * satisfy the abstract contract; throws directly as a defense-in-depth
   * backstop.
   *
   * @throws {@link DialectUnsupportedError} always.
   */
  protected override _buildCreateSchema(_q: Query<'CREATE_SCHEMA'>): string {
    throw new DialectUnsupportedError(this.Dialect, 'CREATE_SCHEMA');
  }

  /** Counterpart to {@link _buildCreateSchema} — see its JSDoc. */
  protected override _buildDropSchema(_q: Query<'DROP_SCHEMA'>): string {
    throw new DialectUnsupportedError(this.Dialect, 'DROP_SCHEMA');
  }

  /**
   * SQLite has no schema object, so a query's `schema` is folded into the
   * physical identifier as a `<schema>_<name>` prefix instead of a
   * `schema.name` dot-qualification — every table/view/index this
   * translator names lives in the one physical file. Applies uniformly
   * to table/view names (via {@link AbstractTranslator._qualifiedTable})
   * and to index names (`_buildCreateIndex` / `_buildDropIndex` below,
   * which SQLite scopes globally rather than per-table).
   *
   * Caveat shared with any prefix scheme: a schema/name pair is not
   * bijective with the resulting identifier — schema `'a'` + name `'b_c'`
   * and schema `'a_b'` + name `'c'` both produce `a_b_c`. Callers that
   * pick schema and table names independently and then rely on both
   * existing side-by-side in the same physical file should avoid
   * underscores at the schema/name boundary.
   */
  protected override _qualifiedTable(table: string, schema?: string): string {
    return this._quoteIdentifier(schema ? `${schema}_${table}` : table);
  }

  /**
   * Covers rename-column, add-column, drop-column and rename-table only.
   *
   * @throws {@link DialectUnsupportedError} `ALTER COLUMN` when
   *   `alterColumns` is set, `ALTER CONSTRAINT` when foreign keys are
   *   added or dropped.
   */
  protected override _buildAlterTable(q: Query<'ALTER_TABLE'>): string[] {
    // SQLite cannot modify a column in place or touch constraints on
    // an existing table — both require the full table-rebuild dance
    // (create new shape, copy, drop, rename). Refuse loudly instead
    // of emitting SQL that silently does nothing.
    if (q.alterColumns !== undefined) {
      throw new DialectUnsupportedError(this.Dialect, 'ALTER COLUMN');
    }
    if (q.addForeignKeys !== undefined || q.dropForeignKeys !== undefined) {
      throw new DialectUnsupportedError(this.Dialect, 'ALTER CONSTRAINT');
    }
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const stmts: string[] = [];
    if (q.renameColumns) {
      for (const [oldName, newName] of Object.entries(q.renameColumns)) {
        stmts.push(
          `ALTER TABLE ${tableSql} RENAME COLUMN ${
            this._quoteIdentifier(oldName)
          } TO ${this._quoteIdentifier(newName)}`,
        );
      }
    }
    if (q.addColumns) {
      for (const [name, def] of Object.entries(q.addColumns)) {
        stmts.push(
          `ALTER TABLE ${tableSql} ADD COLUMN ${
            this._renderColumnDefinition(name, def as ColumnDefinition)
          }`,
        );
      }
    }
    if (q.dropColumns) {
      for (const col of q.dropColumns as string[]) {
        stmts.push(
          `ALTER TABLE ${tableSql} DROP COLUMN ${this._quoteIdentifier(col)}`,
        );
      }
    }
    if (q.renameTo) {
      // Stay within the same schema prefix — OQL has no "move to a
      // different schema" op, and unprefixing on rename would silently
      // strand the table outside its logical schema.
      stmts.push(
        `ALTER TABLE ${tableSql} RENAME TO ${
          this._qualifiedTable(q.renameTo, q.schema)
        }`,
      );
    }
    return stmts;
  }

  /** `q.cascade` is accepted and dropped — see the note below. */
  protected override _buildDropTable(q: Query<'DROP_TABLE'>): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    // SQLite has no CASCADE on DROP TABLE; FK-cascade kicks in when the
    // pragma is on, so we silently drop the keyword.
    return `DROP TABLE ${ifExists}${tableSql}`;
  }

  /**
   * SQLite has no `TRUNCATE`. Emulate as `DELETE FROM <table>` — same
   * caller-visible effect (every row gone). Matches the
   * Compatibility.md contract that the OQL surface is uniform across
   * dialects.
   */
  protected override _buildTruncate(q: Query<'TRUNCATE'>): string {
    return `DELETE FROM ${this._qualifiedTable(q.table, q.schema)}`;
  }

  /**
   * SQLite has partial indexes, so `q.where` becomes a `WHERE` clause on
   * the index. `q.method` has no SQLite equivalent and is ignored.
   *
   * Index names share one flat, database-wide namespace on SQLite (not
   * a per-table one), so — like the table itself — `q.index` is
   * schema-prefixed via {@link _qualifiedTable}: two logical schemas
   * each naming an index `idx_email` would otherwise collide once both
   * live in the same physical file.
   */
  protected override _buildCreateIndex(
    q: Query<'CREATE_INDEX'>,
    params: Parameters,
  ): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const indexSql = this._qualifiedTable(q.index, q.schema);
    const ifNotExists = q.ifNotExists ? 'IF NOT EXISTS ' : '';
    const unique = q.unique ? 'UNIQUE ' : '';
    const cols = q.columns
      .map((c) => this._quoteIdentifier(c.slice(1)))
      .join(', ');
    let sql =
      `CREATE ${unique}INDEX ${ifNotExists}${indexSql} ON ${tableSql} (${cols})`;
    if (q.where) {
      const scope = this._scopeFromFilterKeys(q.where);
      sql += ` WHERE ${this._translateFilter(q.where, scope, params, false)}`;
    }
    return sql;
  }

  /** `q.table` is accepted and ignored — see the note below. */
  protected override _buildDropIndex(q: Query<'DROP_INDEX'>): string {
    // `q.table` is part of the OQL contract for API uniformity but
    // SQLite identifies indexes by name alone — accepted, ignored.
    // `q.schema` still narrows WHICH index, since names are prefixed at
    // creation (see _buildCreateIndex).
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    const name = this._qualifiedTable(q.index, q.schema);
    return `DROP INDEX ${ifExists}${name}`;
  }

  /**
   * SQLite has no materialized views. When `q.materialized === true`
   * we silently fall back to a regular view — the user's query still
   * works, but data isn't cached and there's no `REFRESH` to run.
   *
   * SQLite's `CREATE VIEW` grammar supports only `[TEMP] [IF NOT EXISTS]`
   * — there is no `OR REPLACE` (a Postgres/MariaDB feature). Emitting it
   * would be a syntax error at execution, so `orReplace` is refused here.
   * Redefinition is available via `ALTER_VIEW` (DROP VIEW IF EXISTS +
   * CREATE VIEW).
   */
  protected override _buildCreateView(
    q: Query<'CREATE_VIEW'>,
    params: Parameters,
  ): string {
    void q.materialized; // accepted but not honoured — see JSDoc.
    if (q.orReplace) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `CREATE_VIEW with 'orReplace' (SQLite has no CREATE OR REPLACE VIEW — use ALTER_VIEW to redefine, which emits DROP VIEW IF EXISTS + CREATE VIEW)`,
      );
    }
    const viewSql = this._qualifiedTable(q.view, q.schema);
    const ifNotExists = q.ifNotExists ? 'IF NOT EXISTS ' : '';
    const inner = this._buildSelect(q.query, params);
    return `CREATE VIEW ${ifNotExists}${viewSql} AS ${inner}`;
  }

  /**
   * `q.materialized` needs no special case — a `materialized: true`
   * CREATE_VIEW already fell back to a plain view on SQLite.
   */
  protected override _buildDropView(q: Query<'DROP_VIEW'>): string {
    const viewSql = this._qualifiedTable(q.view, q.schema);
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    return `DROP VIEW ${ifExists}${viewSql}`;
  }

  /**
   * SQLite has no `ALTER VIEW`. Redefining a view is `DROP VIEW IF EXISTS
   * + CREATE VIEW`. A bare rename without redefinition isn't supported
   * portably and we throw rather than write to `sqlite_master` directly.
   */
  protected override _buildAlterView(
    q: Query<'ALTER_VIEW'>,
    params: Parameters,
  ): string[] {
    if (!q.query) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `ALTER_VIEW without a 'query' (no rename-only support; supply a SELECT to redefine)`,
      );
    }
    const oldName = this._qualifiedTable(q.view, q.schema);
    const newName = q.renameTo
      ? this._qualifiedTable(q.renameTo, q.schema)
      : oldName;
    const inner = this._buildSelect(q.query, params);
    return [
      `DROP VIEW IF EXISTS ${oldName}`,
      `CREATE VIEW ${newName} AS ${inner}`,
    ];
  }

  /**
   * No-op refresh — SQLite emulates materialized views as regular ones,
   * which need no refresh. We emit a harmless `SELECT 1` so the engine
   * pipeline doesn't break.
   */
  protected override _buildRefreshMaterializedView(
    _q: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): string {
    return 'SELECT 1';
  }

  // ---------------------------------------------------------------------------
  // Privates
  // ---------------------------------------------------------------------------

  /**
   * Types collapse to SQLite's storage classes via `SQL_TYPE_MAP`, with
   * `TEXT` as the fallback for anything unrecognised. `def.comment` has no
   * SQLite DDL syntax, so it is emitted as a trailing block comment.
   */
  protected override _renderColumnDefinition(
    name: string,
    def: ColumnDefinition,
  ): string {
    const baseType = SQL_TYPE_MAP[(def as { type: string }).type] ?? 'TEXT';
    const typeSql = this._renderTypeSuffix(baseType, def);
    let sql = `${this._quoteIdentifier(name)} ${typeSql}`;
    if (def.nullable === false) sql += ' NOT NULL';
    if (def.comment !== undefined) {
      const safe = def.comment.replaceAll('*/', String.raw`*\/`);
      sql += ` /* ${safe} */`;
    }
    return sql;
  }

  /**
   * Compose SQLite's missing `LPAD` / `RPAD` out of the functions it does
   * ship, matching Postgres/MariaDB semantics rather than approximating
   * them.
   *
   * `printf('%*s', n, '')` materialises a run of `n` spaces and
   * `replace()` swaps each space for the fill, so a multi-character fill
   * repeats and is then cut mid-sequence by the inner `substr` — the same
   * rule the other dialects follow (`LPAD('x', 6, 'abc')` → `abcabx`).
   * The outer `substr` reproduces their truncation of an input that is
   * already longer than the target width (`LPAD('hello world', 5)` →
   * `hello`), which keeps the leftmost characters for both directions.
   *
   * `max(0, …)` clamps both widths, because SQLite reads a negative
   * `printf` width as "left justify" and a negative `substr` length as
   * "count backwards" — neither of which is "no padding".
   *
   * NULL propagates without an explicit guard: a NULL length or fill
   * makes the inner `substr` NULL, and a NULL input makes the
   * concatenation NULL, so all three yield NULL as they do elsewhere.
   * The width reaches `printf` as an argument (`%*s`) rather than being
   * concatenated into the format string, so a length that arrives as a
   * column value cannot inject `printf` directives.
   *
   * Two edges are unreachable for every dialect at once, because
   * Postgres and MariaDB disagree there: on a negative length and on an
   * empty fill Postgres yields `''` / the untouched input while MariaDB
   * yields NULL. This follows Postgres.
   *
   * @param args Rendered arguments — `[string, length]`, or
   *   `[string, length, fill]` when the caller supplied a fill.
   * @param side `'left'` to pad in front (`LPAD`), `'right'` to pad
   *   behind (`RPAD`).
   * @returns The SQLite expression implementing the pad.
   */
  private __padExpression(args: string[], side: 'left' | 'right'): string {
    const [str, len] = args;
    const fill = args.length === 3 ? args[2] : `' '`;
    // Clamped target width, reused for the pad run and the truncation.
    const width = `max(0, ${len})`;
    // How many characters are actually missing from the input.
    const shortfall = `max(0, ${len} - length(${str}))`;
    const pad =
      `substr(replace(printf('%*s', ${width}, ''), ' ', ${fill}), 1, ${shortfall})`;
    const joined = side === 'left' ? `${pad} || ${str}` : `${str} || ${pad}`;
    return `substr(${joined}, 1, ${width})`;
  }
}
