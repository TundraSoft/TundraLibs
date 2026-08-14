/**
 * PostgreSQL OQL translator. Targets Postgres 12+ (generated columns,
 * native JSONB operators).
 *
 * Compatibility notes (full breakdown in `packages/oql/docs/Compatibility.md`):
 * - Native: schemas, TRUNCATE, RIGHT/FULL JOIN, materialized views with
 *   `REFRESH MATERIALIZED VIEW [CONCURRENTLY]`, partial indexes,
 *   crypto via pgcrypto (`gen_random_uuid()`, `digest()`, `pgp_sym_encrypt`).
 * - RETURNING: emitted on INSERT and UPSERT only — never on UPDATE/DELETE
 *   (cross-dialect rule for consistency, even though Postgres supports it).
 *
 * @module translator/PostgresTranslator
 */

import type {
  AggregateFunction,
  ColumnDefinition,
  Expressions,
  Query,
} from '../types/mod.ts';
import { AbstractTranslator } from './AbstractTranslator.ts';
import { OqlError } from '../errors/mod.ts';
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
 * SQL data-type map. Postgres has the broadest type system of the SQL
 * dialects we target — most OQL types map 1:1.
 */
const SQL_TYPE_MAP: Record<string, string> = {
  CHAR: 'CHAR',
  VARCHAR: 'VARCHAR',
  TEXT: 'TEXT',
  CLOB: 'TEXT',
  TINYINT: 'SMALLINT', // Postgres has no TINYINT
  SMALLINT: 'SMALLINT',
  INTEGER: 'INTEGER',
  INT: 'INTEGER',
  BIGINT: 'BIGINT',
  DECIMAL: 'NUMERIC',
  NUMERIC: 'NUMERIC',
  FLOAT: 'REAL',
  DOUBLE: 'DOUBLE PRECISION',
  REAL: 'REAL',
  BINARY: 'BYTEA',
  VARBINARY: 'BYTEA',
  BLOB: 'BYTEA',
  DATE: 'DATE',
  TIME: 'TIME',
  DATETIME: 'TIMESTAMP',
  TIMESTAMP: 'TIMESTAMP',
  TIMESTAMPTZ: 'TIMESTAMPTZ',
  BOOLEAN: 'BOOLEAN',
  BIT: 'BIT',
  JSON: 'JSON',
  JSONB: 'JSONB',
  UUID: 'UUID',
  XML: 'XML',
};

/**
 * Postgres base types that accept a `(length)` typmod. Everything else —
 * notably `BYTEA` (from `binary`/`varbinary`/`blob`) and `TEXT` — rejects
 * one, so a stray `length` on such a column must be dropped rather than
 * emitted as `BYTEA(32)`.
 */
const PG_LENGTH_TYPES = new Set(['CHAR', 'VARCHAR', 'BIT']);

/** Index methods Postgres recognises in `USING <method>`. */
const PG_INDEX_METHODS = new Set([
  'BTREE',
  'HASH',
  'GIN',
  'GIST',
  'BRIN',
]);

/**
 * Emits PostgreSQL SQL. Stateless and reusable — see
 * {@link AbstractTranslator} for the shared method surface. This is the
 * dialect with the fewest emulations: schemas, TRUNCATE, FULL JOIN,
 * materialized views and partial indexes are all native.
 */
export class PostgresTranslator extends AbstractTranslator {
  /** Dialect tag, reported on every error this translator raises. */
  public override readonly Dialect = 'postgres';

  /** Double quotes; an embedded quote doubles to `""`. */
  protected override readonly _identifierQuote: IdentifierQuote = {
    open: '"',
    close: '"',
    escape: '""',
  };

  /**
   * Named `:name:` placeholders, not Postgres's native `$N` — the engine
   * layer does that rewrite.
   */
  protected override readonly _parameterStyle: ParameterStyle = {
    // Engine-compat `:name:` form. The Postgres engine's overridden
    // `_standardizeQuery` rewrites this to `$N` and stashes the encoded
    // parameter array — see drivers/engines/postgres/Engine.ts.
    format: 'named',
    prefix: ':',
    suffix: ':',
  };

  /** Everything on except `RETURNING` for UPDATE / DELETE — see below. */
  protected override readonly _support: DialectSupport = {
    schema: true,
    materializedView: true,
    truncate: true,
    rightJoin: true,
    fullJoin: true,
    // RETURNING is emitted on INSERT and UPSERT only across all dialects.
    // Postgres supports it everywhere, but we disable on UPDATE/DELETE
    // for cross-dialect uniformity.
    returning: { insert: true, upsert: true },
  };

  /**
   * Postgres accepts `OFFSET` as a standalone clause (`OFFSET start
   * [ ROW | ROWS ]`), so an offset-only query needs no synthesised
   * `LIMIT`.
   */
  protected override readonly _offsetOnlyLimit: string | null = null;

  /**
   * Postgres expression emitters. Unlike SQLite's pass-throughs, the
   * crypto ones emit real calls: `HASH` → `digest()` and
   * `ENCRYPT` / `DECRYPT` → `pgp_sym_*`, all of which need the `pgcrypto`
   * extension installed. `UUID` → `gen_random_uuid()`, core since PG 13
   * and pgcrypto before that.
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
          ? `SUBSTRING(${a[0]} FROM ${a[1]} FOR ${a[2]})`
          : `SUBSTRING(${a[0]} FROM ${a[1]})`,
    ],
    ['REPLACE', (a) => `REPLACE(${a[0]}, ${a[1]}, ${a[2]})`],
    [
      'LPAD',
      (a) =>
        a.length === 3
          ? `LPAD(${a[0]}, ${a[1]}, ${a[2]})`
          : `LPAD(${a[0]}, ${a[1]})`,
    ],
    [
      'RPAD',
      (a) =>
        a.length === 3
          ? `RPAD(${a[0]}, ${a[1]}, ${a[2]})`
          : `RPAD(${a[0]}, ${a[1]})`,
    ],
    ['NOW', () => 'CURRENT_TIMESTAMP'],
    ['CURRENT_DATE', () => 'CURRENT_DATE'],
    ['CURRENT_TIME', () => 'CURRENT_TIME'],
    ['CURRENT_TIMESTAMP', () => 'CURRENT_TIMESTAMP'],
    ['CURRENT_TIMESTAMPTZ', () => 'CURRENT_TIMESTAMP'],
    ['DATE_ADD', (a) => {
      // Postgres: date + interval. Build the interval as a string concat
      // since amount/unit may be parameterised.
      const [date, amount, unit] = a;
      return `(${date} + (${amount}::text || ' ' || ${unit})::interval)`;
    }],
    ['DATE_DIFF', (a) => {
      // EXTRACT(EPOCH FROM (to - from)) gives seconds; scale by unit.
      const [from, to, unit] = a;
      const scale = this._timeUnitCase(unit, {
        DAYS: '1.0/86400',
        HOURS: '1.0/3600',
        MINUTES: '1.0/60',
        SECONDS: '1',
        MONTHS: '1.0/(86400*30)',
        YEARS: '1.0/(86400*365)',
      });
      return `CAST(EXTRACT(EPOCH FROM (${to} - ${from})) * ${scale} AS BIGINT)`;
    }],
    ['UUID', () => 'gen_random_uuid()'],
    ['HASH', (a) => `encode(digest(${a[0]}, 'sha256'), 'hex')`],
    ['ENCRYPT', (a) => `pgp_sym_encrypt(${a[0]}, ${a[1]})`],
    ['DECRYPT', (a) => `pgp_sym_decrypt(${a[0]}, ${a[1]})`],
  ]);

  /**
   * Postgres aggregate emitters. `ARRAY_AGG` returns a native array and
   * `JSON_ROW` a `jsonb` value, so neither needs client-side parsing the
   * way SQLite's JSON-string equivalents do.
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
    ['STRING_AGG', (a) => `STRING_AGG(${a[0]}, ${a[1]})`],
    ['ARRAY_AGG', (a) => `ARRAY_AGG(${a[0]})`],
    // JSON_ROW is an *aggregate* — collects rows into a JSON array of
    // per-row objects. jsonb_build_object builds each object;
    // jsonb_agg collects them.
    ['JSON_ROW', (a) => `jsonb_agg(jsonb_build_object(${a.join(', ')}))`],
  ]);

  /**
   * Postgres filter-operator emitters. The only dialect where `$ilike` is
   * genuinely case-insensitive for non-ASCII text — Postgres has a real
   * `ILIKE`, where SQLite and MariaDB fall back to `LIKE`.
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
    ['$ilike', (c, v) => `${c} ILIKE ${v}`],
    ['$nilike', (c, v) => `${c} NOT ILIKE ${v}`],
    ['$startsWith', (c, v) => `${c} LIKE (${v} || '%')`],
    ['$endsWith', (c, v) => `${c} LIKE ('%' || ${v})`],
    ['$contains', (c, v) => `${c} LIKE ('%' || ${v} || '%')`],
  ]);

  // ---------------------------------------------------------------------------
  // DML: UPSERT
  // ---------------------------------------------------------------------------

  // Postgres references the proposed row as `EXCLUDED` (the
  // AbstractTranslator default), so it relies on the shared
  // `_buildOnConflictUpsert` without overriding `_excludedKeyword`.
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
   * Native `CREATE SCHEMA`. `IF NOT EXISTS` is unconditional, so this is
   * idempotent regardless of what the caller asked for.
   */
  protected override _buildCreateSchema(q: Query<'CREATE_SCHEMA'>): string {
    return `CREATE SCHEMA IF NOT EXISTS ${this._quoteIdentifier(q.schema)}`;
  }

  /**
   * Native `DROP SCHEMA`, always `IF EXISTS`. Without `q.cascade` Postgres
   * refuses to drop a schema that still contains objects.
   */
  protected override _buildDropSchema(q: Query<'DROP_SCHEMA'>): string {
    const cascade = q.cascade ? ' CASCADE' : '';
    return `DROP SCHEMA IF EXISTS ${this._quoteIdentifier(q.schema)}${cascade}`;
  }

  /**
   * Covers every `ALTER_TABLE` action — Postgres is the only dialect here
   * with no gaps, including in-place column modification and foreign-key
   * constraint changes.
   */
  protected override _buildAlterTable(q: Query<'ALTER_TABLE'>): string[] {
    // Postgres can take multiple actions in one ALTER TABLE statement, but
    // we emit one statement per action for parity with SQLite/MariaDB and
    // because failures are easier to reason about.
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const stmts: string[] = [];
    if (q.dropForeignKeys) {
      for (const name of q.dropForeignKeys) {
        stmts.push(
          `ALTER TABLE ${tableSql} DROP CONSTRAINT ${
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
      for (const [name, def] of Object.entries(q.alterColumns)) {
        const d = def as ColumnDefinition;
        const col = this._quoteIdentifier(name);
        const typeSql = this.__renderColumnType(d);
        // USING makes non-trivial conversions explicit — Postgres
        // refuses many implicit type changes without it.
        stmts.push(
          `ALTER TABLE ${tableSql} ALTER COLUMN ${col} TYPE ${typeSql} ` +
            `USING ${col}::${typeSql}`,
        );
        if (d.nullable === false) {
          stmts.push(
            `ALTER TABLE ${tableSql} ALTER COLUMN ${col} SET NOT NULL`,
          );
        } else if (d.nullable === true) {
          stmts.push(
            `ALTER TABLE ${tableSql} ALTER COLUMN ${col} DROP NOT NULL`,
          );
        }
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
      stmts.push(
        `ALTER TABLE ${tableSql} RENAME TO ${
          this._quoteIdentifier(q.renameTo)
        }`,
      );
    }
    return stmts;
  }

  /** Honours `q.cascade`, which drops dependent views and constraints. */
  protected override _buildDropTable(q: Query<'DROP_TABLE'>): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    const cascade = q.cascade ? ' CASCADE' : '';
    return `DROP TABLE ${ifExists}${tableSql}${cascade}`;
  }

  /**
   * Native `TRUNCATE TABLE`. `q.cascade` extends it to tables holding a
   * foreign key into this one; without it Postgres refuses when any exist.
   */
  protected override _buildTruncate(q: Query<'TRUNCATE'>): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const cascade = q.cascade ? ' CASCADE' : '';
    return `TRUNCATE TABLE ${tableSql}${cascade}`;
  }

  /**
   * `q.where` becomes a partial-index predicate and `q.method` a `USING`
   * clause — but only for a method in `PG_INDEX_METHODS`; anything else is
   * dropped rather than passed through to the server.
   */
  protected override _buildCreateIndex(
    q: Query<'CREATE_INDEX'>,
    params: Parameters,
  ): string {
    const tableSql = this._qualifiedTable(q.table, q.schema);
    const indexSql = this._quoteIdentifier(q.index);
    const ifNotExists = q.ifNotExists ? 'IF NOT EXISTS ' : '';
    const unique = q.unique ? 'UNIQUE ' : '';
    const cols = q.columns
      .map((c) => this._quoteIdentifier(c.slice(1)))
      .join(', ');
    const method = q.method && PG_INDEX_METHODS.has(q.method)
      ? ` USING ${q.method}`
      : '';
    let sql =
      `CREATE ${unique}INDEX ${ifNotExists}${indexSql} ON ${tableSql}${method} (${cols})`;
    if (q.where) {
      const scope = this._scopeFromFilterKeys(q.where);
      sql += ` WHERE ${this._translateFilter(q.where, scope, params, false)}`;
    }
    return sql;
  }

  /** `q.table` is accepted and ignored — see the note below. */
  protected override _buildDropIndex(q: Query<'DROP_INDEX'>): string {
    // `q.table` is part of the OQL contract for API uniformity but
    // Postgres identifies indexes by name alone — accepted, ignored.
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    const cascade = q.cascade ? ' CASCADE' : '';
    const name = q.schema
      ? this._quoteQualified(q.schema, q.index)
      : this._quoteIdentifier(q.index);
    return `DROP INDEX ${ifExists}${name}${cascade}`;
  }

  /**
   * Real materialized views when `q.materialized` is set. Postgres offers
   * `OR REPLACE` only on a plain view and `IF NOT EXISTS` only on a
   * materialized one, so each branch silently drops the flag it cannot
   * express — check which kind of view you asked for before relying on
   * either.
   */
  protected override _buildCreateView(
    q: Query<'CREATE_VIEW'>,
    params: Parameters,
  ): string {
    const viewSql = this._qualifiedTable(q.view, q.schema);
    const inner = this._buildSelect(q.query, params);
    if (q.materialized) {
      // Postgres doesn't have IF NOT EXISTS for materialized views; OR
      // REPLACE isn't allowed either. We honour ifNotExists by emitting
      // it when the user asked, even though Postgres will still error if
      // it actually exists — caller can wrap in a DO block if needed.
      const ifNotExists = q.ifNotExists ? 'IF NOT EXISTS ' : '';
      return `CREATE MATERIALIZED VIEW ${ifNotExists}${viewSql} AS ${inner}`;
    }
    const orReplace = q.orReplace ? 'OR REPLACE ' : '';
    return `CREATE ${orReplace}VIEW ${viewSql} AS ${inner}`;
  }

  /** String params bind with UNSPECIFIED oid (server-side inference,
   * so `uuid_col = $1` works) — but variadic/overload-ambiguous
   * positions cannot infer, so text-typed slots get an explicit
   * cast. */
  protected override _textParameterize(
    value: string,
    params: Parameters,
  ): string {
    return `${this._parameterize(value, params)}::text`;
  }

  /**
   * `q.materialized` must match how the view was created — Postgres
   * rejects `DROP VIEW` against a materialized view and vice versa.
   */
  protected override _buildDropView(q: Query<'DROP_VIEW'>): string {
    const viewSql = this._qualifiedTable(q.view, q.schema);
    const ifExists = q.ifExists ? 'IF EXISTS ' : '';
    const cascade = q.cascade ? ' CASCADE' : '';
    // Postgres refuses plain DROP VIEW on a materialized view.
    const kind = q.materialized ? 'MATERIALIZED VIEW' : 'VIEW';
    return `DROP ${kind} ${ifExists}${viewSql}${cascade}`;
  }

  /**
   * Postgres has no `ALTER VIEW … AS <select>`; redefining a view's
   * query requires `CREATE OR REPLACE VIEW`. Renaming uses `ALTER VIEW`.
   * When both are requested, we emit the RENAME first then the redefine.
   */
  protected override _buildAlterView(
    q: Query<'ALTER_VIEW'>,
    params: Parameters,
  ): string[] {
    const oldName = this._qualifiedTable(q.view, q.schema);
    const stmts: string[] = [];
    if (q.renameTo) {
      stmts.push(
        `ALTER VIEW ${oldName} RENAME TO ${this._quoteIdentifier(q.renameTo)}`,
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
   * The only dialect that refreshes for real. `q.concurrently` keeps the
   * view readable during the rebuild, but Postgres requires the view to
   * carry a unique index for it.
   */
  protected override _buildRefreshMaterializedView(
    q: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): string {
    const viewSql = this._qualifiedTable(q.view, q.schema);
    const concurrently = q.concurrently ? 'CONCURRENTLY ' : '';
    return `REFRESH MATERIALIZED VIEW ${concurrently}${viewSql}`;
  }

  // ---------------------------------------------------------------------------
  // Literal formatting
  // ---------------------------------------------------------------------------

  /**
   * Postgres has no `X'…'` bit/blob literal — that syntax is a *bit
   * string*, and feeding one to a `bytea` column is a type error. Binary
   * literals use the hex-format `bytea` input syntax instead
   * (`'\x0a1b'::bytea`), so byte values inlined into a view / partial-index
   * body ({@link createView} / {@link createIndex}) round-trip as bytes.
   *
   * The leading `\x` is a literal backslash: `standard_conforming_strings`
   * has been on by default since Postgres 9.1, so a plain single-quoted
   * literal does not process backslash escapes. Every other type is
   * identical to the base, so we delegate to `super` for them.
   */
  protected override _formatLiteral(value: unknown): string {
    if (value instanceof Uint8Array) {
      const hex = Array.from(value, (b) => b.toString(16).padStart(2, '0'))
        .join('');
      return String.raw`'\x${hex}'::bytea`;
    }
    return super._formatLiteral(value);
  }

  // ---------------------------------------------------------------------------
  // Privates
  // ---------------------------------------------------------------------------

  /**
   * `def.comment` lands as an inline block comment rather than a proper
   * `COMMENT ON COLUMN` statement — a known shortcut, see the inline note.
   */
  protected override _renderColumnDefinition(
    name: string,
    def: ColumnDefinition,
  ): string {
    let sql = `${this._quoteIdentifier(name)} ${this.__renderColumnType(def)}`;
    if (def.nullable === false) sql += ' NOT NULL';
    if (def.comment !== undefined) {
      // Postgres uses COMMENT ON COLUMN as a separate statement; for now we
      // emit it as an inline marker. A future revision can split into a
      // separate stmt and return [CREATE TABLE, COMMENT ON COLUMN, …].
      // Postgres block comments NEST — escape both delimiters.
      const safe = def.comment
        .replaceAll('*/', String.raw`*\/`)
        .replaceAll('/*', String.raw`/\*`);
      sql += ` /* ${safe} */`;
    }
    return sql;
  }

  /** The bare SQL type (with length/precision) — shared by column
   * definitions and `ALTER COLUMN … TYPE` emission. */
  private __renderColumnType(def: ColumnDefinition): string {
    const baseType = SQL_TYPE_MAP[(def as { type: string }).type] ?? 'TEXT';
    // A `(length)` typmod is valid only on CHAR/VARCHAR/BIT here; on any
    // other type (e.g. BYTEA) Postgres rejects it, so strip the length and
    // keep only precision/scale.
    if (
      'length' in def && def.length !== undefined &&
      !PG_LENGTH_TYPES.has(baseType)
    ) {
      const { length: _length, ...rest } = def as ColumnDefinition & {
        length?: number;
      };
      return this._renderTypeSuffix(baseType, rest as ColumnDefinition);
    }
    return this._renderTypeSuffix(baseType, def);
  }
}
