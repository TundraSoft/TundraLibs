/**
 * MariaDB / MySQL OQL translator. Targets MariaDB 10.5+ (RETURNING for
 * INSERT and INSERT … ON DUPLICATE KEY UPDATE, JSON functions). MySQL is
 * a near-superset for the OQL surface but doesn't have RETURNING — the
 * engine layer compensates.
 *
 * Compatibility notes (full breakdown in `packages/oql/docs/Compatibility.md`):
 * - Schemas in MariaDB are databases; CREATE_SCHEMA emits `CREATE DATABASE`.
 * - No materialized views. CREATE_VIEW with `materialized: true` silently
 *   falls back to a regular view; REFRESH_MATERIALIZED_VIEW emits the
 *   no-op `SELECT 1`.
 * - TRUNCATE: native (`TRUNCATE TABLE`).
 * - JOINs: RIGHT JOIN yes, FULL JOIN no (must be emulated with UNION; we
 *   throw rather than emit subtly-wrong SQL).
 * - RETURNING: emitted on INSERT and UPSERT (cross-dialect rule — never
 *   on UPDATE/DELETE).
 * - Partial indexes: not supported (`CREATE_INDEX` with `where` throws).
 *
 * @module translator/MariaTranslator
 */

import type {
  AggregateFunction,
  ColumnDefinition,
  Expressions,
  Query,
} from '../types/mod.ts';
import { DialectUnsupportedError, OqlError } from '../errors/mod.ts';
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

/** SQL data-type map for MariaDB / MySQL. */
const SQL_TYPE_MAP: Record<string, string> = {
  CHAR: 'CHAR',
  VARCHAR: 'VARCHAR',
  TEXT: 'TEXT',
  CLOB: 'LONGTEXT',
  TINYINT: 'TINYINT',
  SMALLINT: 'SMALLINT',
  INTEGER: 'INT',
  INT: 'INT',
  BIGINT: 'BIGINT',
  DECIMAL: 'DECIMAL',
  NUMERIC: 'DECIMAL',
  FLOAT: 'FLOAT',
  DOUBLE: 'DOUBLE',
  REAL: 'DOUBLE',
  BINARY: 'BINARY',
  VARBINARY: 'VARBINARY',
  BLOB: 'BLOB',
  DATE: 'DATE',
  // Fractional seconds are EXPLICIT on MariaDB — bare TIME/DATETIME/
  // TIMESTAMP truncate to whole seconds, which breaks monotonic
  // audit columns (two writes in one second compare equal) and
  // diverges from Postgres microseconds / SQLite ISO-with-millis.
  TIME: 'TIME(6)',
  DATETIME: 'DATETIME(6)',
  TIMESTAMP: 'TIMESTAMP(6)',
  // MariaDB TIMESTAMP is tz-aware (stored UTC, converted to session tz).
  TIMESTAMPTZ: 'TIMESTAMP(6)',
  BOOLEAN: 'TINYINT(1)',
  BIT: 'BIT',
  JSON: 'JSON',
  JSONB: 'JSON', // MariaDB has no JSONB; alias to JSON
  UUID: 'UUID', // MariaDB 10.7+; MySQL emits CHAR(36)
  XML: 'TEXT',
};

/**
 * Index methods MariaDB recognises in the `USING <method>` clause.
 * `FULLTEXT` is deliberately NOT here — it is an index KIND
 * (`CREATE FULLTEXT INDEX …`), not a `USING` value, and MariaDB's
 * index_type grammar only accepts `USING {BTREE | HASH}`.
 */
const MARIA_INDEX_METHODS = new Set(['BTREE', 'HASH']);

/**
 * OQL time-unit → MariaDB interval keyword for the `TIMESTAMPADD` /
 * `TIMESTAMPDIFF` unit argument (which must be an inlined keyword, not a
 * bound parameter). Fed to {@link AbstractTranslator._timeUnitCase} by
 * both date-arithmetic emitters.
 */
const MARIA_INTERVAL_UNITS = {
  DAYS: 'DAY',
  HOURS: 'HOUR',
  MINUTES: 'MINUTE',
  SECONDS: 'SECOND',
  MONTHS: 'MONTH',
  YEARS: 'YEAR',
} as const;

/**
 * Emits MariaDB / MySQL SQL. Stateless and reusable — see
 * {@link AbstractTranslator} for the shared method surface and the module
 * header above for the gaps (no FULL JOIN, no materialized views, no
 * partial indexes).
 */
export class MariaTranslator extends AbstractTranslator {
  /** Dialect tag; `'maria'` covers MySQL too — there is no separate one. */
  public override readonly Dialect = 'maria';

  /** Backticks, not the SQL-standard double quote; `` ` `` doubles to ` `` `. */
  protected override readonly _identifierQuote: IdentifierQuote = {
    open: '`',
    close: '`',
    escape: '``',
  };

  /** Named placeholders in the engine-compat `:name:` form. */
  protected override readonly _parameterStyle: ParameterStyle = {
    // Engine-compat `:name:` form. The maria engine's `_standardizeQuery`
    // rewrites to `:name` (one colon — what the mariadb client expects
    // with `namedPlaceholders: true`).
    format: 'named',
    prefix: ':',
    suffix: ':',
  };

  /**
   * `fullJoin` and `materializedView` are the two off. A FULL JOIN throws
   * rather than being emulated with a UNION, since the emulation changes
   * the plan and the duplicate-row semantics.
   */
  protected override readonly _support: DialectSupport = {
    schema: true, // CREATE DATABASE
    materializedView: false,
    truncate: true,
    rightJoin: true,
    fullJoin: false,
    // MariaDB 10.5+ supports RETURNING on both INSERT and INSERT … ON
    // DUPLICATE KEY UPDATE.
    returning: { insert: true, upsert: true },
  };

  /**
   * MariaDB / MySQL reject a bare `OFFSET` — it is only valid as part of a
   * `LIMIT` clause. The manual's documented workaround for "all rows from
   * an offset to the end" is the max-unsigned-BIGINT row count, so an
   * offset-only query emits `LIMIT 18446744073709551615 OFFSET n`.
   */
  protected override readonly _offsetOnlyLimit: string | null =
    '18446744073709551615';

  /**
   * MariaDB expression emitters. Crypto is native but not interchangeable
   * with the other dialects': `HASH` is `SHA2(…, 256)` and
   * `ENCRYPT` / `DECRYPT` are `AES_*`, so ciphertext written here will not
   * decrypt under Postgres's `pgp_sym_*`.
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
    ['CONCAT', (a) => `CONCAT(${a.join(', ')})`],
    ['LENGTH', (a) => `CHAR_LENGTH(${a[0]})`],
    ['LOWER', (a) => `LOWER(${a[0]})`],
    ['UPPER', (a) => `UPPER(${a[0]})`],
    ['TRIM', (a) => `TRIM(${a[0]})`],
    ['LTRIM', (a) => `LTRIM(${a[0]})`],
    ['RTRIM', (a) => `RTRIM(${a[0]})`],
    [
      'SUBSTR',
      (a) =>
        a.length === 3
          ? `SUBSTRING(${a[0]}, ${a[1]}, ${a[2]})`
          : `SUBSTRING(${a[0]}, ${a[1]})`,
    ],
    ['REPLACE', (a) => `REPLACE(${a[0]}, ${a[1]}, ${a[2]})`],
    [
      'LPAD',
      (a) =>
        a.length === 3
          ? `LPAD(${a[0]}, ${a[1]}, ${a[2]})`
          : `LPAD(${a[0]}, ${a[1]}, ' ')`,
    ],
    [
      'RPAD',
      (a) =>
        a.length === 3
          ? `RPAD(${a[0]}, ${a[1]}, ${a[2]})`
          : `RPAD(${a[0]}, ${a[1]}, ' ')`,
    ],
    ['NOW', () => 'NOW()'],
    ['CURRENT_DATE', () => 'CURRENT_DATE()'],
    ['CURRENT_TIME', () => 'CURRENT_TIME()'],
    ['CURRENT_TIMESTAMP', () => 'CURRENT_TIMESTAMP()'],
    ['CURRENT_TIMESTAMPTZ', () => 'CURRENT_TIMESTAMP()'], // no native TZ
    ['DATE_ADD', (a) => {
      // MariaDB: TIMESTAMPADD(unit, amount, date). The unit keyword must be
      // inlined, not parameterised, so a CASE maps the OQL unit string to
      // the SQL keyword.
      const [date, amount, unit] = a;
      const unitKeyword = this._timeUnitCase(unit, MARIA_INTERVAL_UNITS);
      return `TIMESTAMPADD(${unitKeyword}, ${amount}, ${date})`;
    }],
    ['DATE_DIFF', (a) => {
      // MariaDB: TIMESTAMPDIFF(unit, from, to) — unit can't be parameterised.
      const [from, to, unit] = a;
      const unitKeyword = this._timeUnitCase(unit, MARIA_INTERVAL_UNITS);
      return `TIMESTAMPDIFF(${unitKeyword}, ${from}, ${to})`;
    }],
    ['UUID', () => 'UUID()'],
    ['HASH', (a) => `SHA2(${a[0]}, 256)`],
    ['ENCRYPT', (a) => `AES_ENCRYPT(${a[0]}, ${a[1]})`],
    ['DECRYPT', (a) => `AES_DECRYPT(${a[0]}, ${a[1]})`],
  ]);

  /**
   * MariaDB aggregate emitters. `STRING_AGG` becomes `GROUP_CONCAT`, whose
   * result is truncated at `group_concat_max_len` (1024 bytes by default)
   * — silently, without an error.
   */
  protected override readonly _aggregateMap: AggregateMap = new Map<
    AggregateFunction,
    (args: string[]) => string
  >([
    ['COUNT', (a) => (a.length === 0 ? 'COUNT(1)' : `COUNT(${a[0]})`)],
    ['SUM', (a) => `SUM(${a[0]})`],
    ['AVG', (a) => `AVG(${a[0]})`],
    ['MIN', (a) => `MIN(${a[0]})`],
    ['MAX', (a) => `MAX(${a[0]})`],
    ['STRING_AGG', (a) => `GROUP_CONCAT(${a[0]} SEPARATOR ${a[1]})`],
    ['ARRAY_AGG', (a) => `JSON_ARRAYAGG(${a[0]})`],
    // JSON_ROW is an *aggregate* — collects rows into a JSON array of
    // per-row objects. JSON_OBJECT builds each; JSON_ARRAYAGG collects.
    ['JSON_ROW', (a) => `JSON_ARRAYAGG(JSON_OBJECT(${a.join(', ')}))`],
  ]);

  /**
   * MariaDB filter-operator emitters. Case sensitivity here is a property
   * of the column's collation, not the operator: `$like` is already
   * case-*insensitive* under the default `_ci` collations, which is why
   * `$ilike` maps to the same `LIKE`.
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
    // MariaDB LIKE is case-insensitive by default for non-binary collations.
    ['$ilike', (c, v) => `${c} LIKE ${v}`],
    ['$nilike', (c, v) => `${c} NOT LIKE ${v}`],
    ['$startsWith', (c, v) => `${c} LIKE CONCAT(${v}, '%')`],
    ['$endsWith', (c, v) => `${c} LIKE CONCAT('%', ${v})`],
    ['$contains', (c, v) => `${c} LIKE CONCAT('%', ${v}, '%')`],
  ]);

  // ---------------------------------------------------------------------------
  // DML: UPSERT — MariaDB uses `INSERT ... ON DUPLICATE KEY UPDATE`.
  // ---------------------------------------------------------------------------

  /**
   * `INSERT … ON DUPLICATE KEY UPDATE`, not the `ON CONFLICT` form the
   * other SQL dialects share. Two consequences: `q.conflictKeys` names no
   * target in the SQL (MariaDB matches against *any* unique key), and the
   * DO-NOTHING case is faked with a self-assignment — see below.
   */
  protected override _buildUpsert(
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
    const updateCols = q.updateOnConflict
      ? q.updateOnConflict.map((k) => k.slice(1))
      : insertCols.filter((c) => !conflictKeys.includes(c));

    // ON DUPLICATE KEY UPDATE has no DO NOTHING; we emit an idempotent
    // self-assignment when there's nothing to update (col = col is a
    // standard MySQL trick for the ignore case, lighter than INSERT IGNORE).
    const setClause = updateCols.length > 0
      ? updateCols
        .map((c) => {
          const quoted = this._quoteIdentifier(c);
          return `${quoted} = VALUES(${quoted})`;
        })
        .join(', ')
      : `${this._quoteIdentifier(conflictKeys[0]!)} = ${
        this._quoteIdentifier(conflictKeys[0]!)
      }`;

    const returnCols = (q.projection as ReadonlyArray<string> | undefined) ??
      cols;
    const returning = this._buildReturning(returnCols, 'upsert');
    return `INSERT INTO ${tableSql} (${colList}) VALUES ${valuesSql} ON DUPLICATE KEY UPDATE ${setClause}${returning}`;
  }

  // ---------------------------------------------------------------------------
  // DDL
  // ---------------------------------------------------------------------------

  /**
   * A MariaDB schema *is* a database, so this emits `CREATE DATABASE` —
   * a heavier object than Postgres's schema, and not nestable under one.
   */
  protected override _buildCreateSchema(q: Query<'CREATE_SCHEMA'>): string {
    return `CREATE DATABASE IF NOT EXISTS ${this._quoteIdentifier(q.schema)}`;
  }

  /**
   * `DROP DATABASE` — unconditionally destructive. `q.cascade` is
   * irrelevant here (see below), so this drops a populated schema where
   * Postgres would refuse.
   */
  protected override _buildDropSchema(q: Query<'DROP_SCHEMA'>): string {
    // MariaDB has no CASCADE on DROP DATABASE — it always drops the contents.
    return `DROP DATABASE IF EXISTS ${this._quoteIdentifier(q.schema)}`;
  }

  /**
   * Covers every `ALTER_TABLE` action. `alterColumns` uses
   * `MODIFY COLUMN`, which replaces the whole definition — anything the
   * caller omits from the new definition is reset, not preserved.
   */
  protected override _buildAlterTable(q: Query<'ALTER_TABLE'>): string[] {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const stmts: string[] = [];
    if (q.dropForeignKeys) {
      for (const name of q.dropForeignKeys) {
        stmts.push(
          `ALTER TABLE ${tableSql} DROP FOREIGN KEY ${
            this._quoteIdentifier(name)
          }`,
        );
      }
    }
    if (q.renameColumns) {
      for (const [oldName, newName] of Object.entries(q.renameColumns)) {
        stmts.push(
          `ALTER TABLE ${tableSql} RENAME COLUMN ${
            this._quoteIdentifier(oldName)
          } TO ${this._quoteIdentifier(newName)}`,
        );
      }
    }
    if (q.alterColumns) {
      // MODIFY COLUMN takes the FULL new definition (type + nullability
      // in one go) — MariaDB re-derives everything from it.
      for (const [name, def] of Object.entries(q.alterColumns)) {
        stmts.push(
          `ALTER TABLE ${tableSql} MODIFY COLUMN ${
            this._renderColumnDefinition(name, def as ColumnDefinition)
          }`,
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
    if (q.addForeignKeys) {
      for (const [name, fk] of Object.entries(q.addForeignKeys)) {
        stmts.push(
          `ALTER TABLE ${tableSql} ADD ${this._renderForeignKey(name, fk)}`,
        );
      }
    }
    if (q.renameTo) {
      // Qualify the target with the source schema. In MariaDB/MySQL an
      // unqualified `RENAME TO` target resolves against the session's
      // default database, so a schema-qualified source with a bare target
      // would relocate the table into the default DB (or fail 1046). Match
      // the source schema so the object stays put.
      stmts.push(
        `ALTER TABLE ${tableSql} RENAME TO ${
          this._qualifiedTable(q.renameTo, q.schema)
        }`,
      );
    }
    return stmts;
  }

  /**
   * `q.cascade` emits the `CASCADE` keyword, which MariaDB parses for
   * porting compatibility and then ignores — it does not cascade to
   * dependent objects the way Postgres does.
   */
  protected override _buildDropTable(q: Query<'DROP_TABLE'>): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    const cascade = q.cascade ? ' CASCADE' : '';
    return `DROP TABLE ${ifExists}${tableSql}${cascade}`;
  }

  /** Native `TRUNCATE TABLE`; `q.cascade` is dropped — see below. */
  protected override _buildTruncate(q: Query<'TRUNCATE'>): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    // MariaDB's TRUNCATE has no CASCADE; users must DROP foreign keys first.
    return `TRUNCATE TABLE ${tableSql}`;
  }

  /**
   * `q.method` splits two ways: `'FULLTEXT'` is an index *kind* and
   * replaces `UNIQUE`, while `BTREE` / `HASH` become a trailing `USING`
   * clause. Any other method is dropped.
   *
   * @throws {@link DialectUnsupportedError} When `q.where` is set —
   *   MariaDB has no partial indexes.
   */
  protected override _buildCreateIndex(
    q: Query<'CREATE_INDEX'>,
    params: Parameters,
  ): string {
    if (q.where) {
      throw new DialectUnsupportedError(
        this.Dialect,
        `CREATE_INDEX with WHERE (MariaDB has no partial indexes)`,
      );
    }
    void params;
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const indexSql = this._quoteIdentifier(q.index);
    const ifNotExists = q.ifNotExists ? 'IF NOT EXISTS ' : '';
    const unique = q.unique ? 'UNIQUE ' : '';
    const cols = q.columns
      .map((c) => this._quoteIdentifier(c.slice(1)))
      .join(', ');
    // FULLTEXT is an index KIND prefix (`CREATE FULLTEXT INDEX …`), never a
    // `USING FULLTEXT` clause (which is a syntax error). A FULLTEXT index
    // cannot also be UNIQUE, so the kind keyword replaces `unique`.
    const fulltext = q.method === 'FULLTEXT';
    const kind = fulltext ? 'FULLTEXT ' : unique;
    const method = !fulltext && q.method && MARIA_INDEX_METHODS.has(q.method)
      ? ` USING ${q.method}`
      : '';
    return `CREATE ${kind}INDEX ${ifNotExists}${indexSql} ON ${tableSql} (${cols})${method}`;
  }

  /**
   * The one dialect that needs `q.table` in the SQL — MariaDB scopes index
   * names per-table. `q.ifExists` and `q.cascade` are accepted and
   * ignored; see below.
   */
  protected override _buildDropIndex(q: Query<'DROP_INDEX'>): string {
    // MariaDB scopes indexes per-table, so DROP INDEX requires the
    // owning table in the SQL. `q.table` is guaranteed by the OQL
    // contract (asserts/DROP_INDEX) — no per-dialect validation needed.
    // `q.cascade` and `q.ifExists` are accepted but ignored: MariaDB
    // exposes neither on DROP INDEX.
    const indexName = q.schema
      ? this._quoteQualified(q.schema, q.index)
      : this._quoteIdentifier(q.index);
    const tableName = q.schema
      ? this._quoteQualified(q.schema, q.table)
      : this._quoteIdentifier(q.table);
    return `DROP INDEX ${indexName} ON ${tableName}`;
  }

  /**
   * MariaDB has no materialized views. When `q.materialized === true`
   * we silently fall back to a regular view — query still works, but
   * data isn't cached and there's no `REFRESH` to run.
   */
  protected override _buildCreateView(
    q: Query<'CREATE_VIEW'>,
    params: Parameters,
  ): string {
    void q.materialized; // accepted but not honoured — see JSDoc.
    const viewSql = this._qualifiedTable(q.view, q.schema);
    const orReplace = q.orReplace ? 'OR REPLACE ' : '';
    const inner = this._buildSelect(q.query, params);
    return `CREATE ${orReplace}VIEW ${viewSql} AS ${inner}`;
  }

  /**
   * `q.materialized` needs no special case — a `materialized: true`
   * CREATE_VIEW already fell back to a plain view on MariaDB.
   */
  protected override _buildDropView(q: Query<'DROP_VIEW'>): string {
    const viewSql = this._qualifiedTable(q.view, q.schema);
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    return `DROP VIEW ${ifExists}${viewSql}`;
  }

  /**
   * MariaDB has both `ALTER VIEW` (rename via RENAME TABLE since MariaDB
   * 10.4 isn't reliable for views) and `CREATE OR REPLACE VIEW` for
   * redefining. We emit RENAME TABLE for renames and CREATE OR REPLACE
   * for redefinitions.
   */
  protected override _buildAlterView(
    q: Query<'ALTER_VIEW'>,
    params: Parameters,
  ): string[] {
    const oldName = this._qualifiedTable(q.view, q.schema);
    const stmts: string[] = [];
    if (q.renameTo) {
      // Qualify the target with the source schema — an unqualified
      // `RENAME TABLE` target resolves against the session default
      // database in MariaDB/MySQL, which would relocate the view out of
      // `q.schema` (or fail 1046). This matches the redefine branch below,
      // which already qualifies the new name with `q.schema`.
      stmts.push(
        `RENAME TABLE ${oldName} TO ${
          this._qualifiedTable(q.renameTo, q.schema)
        }`,
      );
    }
    if (q.query) {
      const newName = q.renameTo
        ? this._qualifiedTable(q.renameTo, q.schema)
        : oldName;
      const inner = this._buildSelect(q.query, params);
      stmts.push(`CREATE OR REPLACE VIEW ${newName} AS ${inner}`);
    }
    if (stmts.length === 0) {
      throw new OqlError(
        `ALTER_VIEW requires at least one of 'renameTo' or 'query'`,
        { code: 'ALTER_VIEW_EMPTY', dialect: this.Dialect },
      );
    }
    return stmts;
  }

  /**
   * MariaDB has no materialized views; the matching CREATE_VIEW silently
   * created a regular view, so REFRESH is a no-op. We emit `SELECT 1` so
   * callers don't need a dialect branch.
   */
  protected override _buildRefreshMaterializedView(
    _q: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): string {
    return 'SELECT 1';
  }

  /**
   * MariaDB / MySQL treat a backslash as a string-literal escape by default
   * (`NO_BACKSLASH_ESCAPES` off), so the base ` ESCAPE '\'` would leave the
   * literal open. Double the backslash so the LIKE escape char is a single
   * backslash at parse time.
   */
  protected override _likeEscapeClause(): string {
    return ` ESCAPE '\\\\'`;
  }

  // ---------------------------------------------------------------------------
  // Literal formatting
  // ---------------------------------------------------------------------------

  /**
   * MariaDB / MySQL treat a backslash as a string escape inside string
   * literals by default (`NO_BACKSLASH_ESCAPES` is off), so the base
   * {@link AbstractTranslator._formatLiteral} — which only doubles single
   * quotes — would let a value like `\'; DROP TABLE …` break out of the
   * quoted literal during DDL inlining ({@link createView} /
   * {@link createIndex}). For string and JSON-fallback literals we escape
   * every backslash to two backslashes **and** every single quote to two
   * single quotes; all other types (number, bigint, boolean, Date,
   * Uint8Array, NULL) are identical to the base, so we delegate to
   * `super` for them.
   */
  protected override _formatLiteral(value: unknown): string {
    if (typeof value === 'string') {
      return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
    }
    if (
      value !== null && value !== undefined &&
      typeof value !== 'number' && typeof value !== 'bigint' &&
      typeof value !== 'boolean' &&
      !(value instanceof Date) && !(value instanceof Uint8Array)
    ) {
      // JSON fallback — same path the base takes for unrecognised values,
      // but with backslash escaping for MariaDB's string-escape semantics.
      const json = JSON.stringify(value);
      return `'${json.replaceAll('\\', '\\\\').replaceAll("'", "''")}'`;
    }
    return super._formatLiteral(value);
  }

  // ---------------------------------------------------------------------------
  // Privates
  // ---------------------------------------------------------------------------

  /**
   * The only dialect with a real inline `COMMENT` clause. Types come from
   * `SQL_TYPE_MAP`, falling back to `TEXT`; note that the temporal types
   * carry an explicit `(6)` precision — see the map's note.
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
      // MariaDB has inline COMMENT on column definitions — proper syntax.
      // MariaDB / MySQL treat a backslash as a string-literal escape by
      // default (`NO_BACKSLASH_ESCAPES` off), so a comment ending in (or
      // containing) a backslash would escape the closing quote and break
      // the DDL. Double every backslash and every single quote, matching
      // {@link _formatLiteral} and {@link _likeEscapeClause}.
      const safe = def.comment.replaceAll('\\', '\\\\').replaceAll("'", "''");
      sql += ` COMMENT '${safe}'`;
    }
    return sql;
  }
}
