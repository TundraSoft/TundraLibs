/**
 * @fileoverview MariaDB / MySQL driver engine wrapping `npm:mariadb`.
 *
 * The MySQL/MariaDB wire protocol is messy enough (capability flags, multiple
 * auth plugins, version-dependent quirks) that we wrap a battle-tested package
 * rather than reimplement. We use `createConnection` (per-connection) and let
 * `BaseEngine`'s pool own the lifecycle — no double-pooling.
 *
 * The engine writes each `:name:` value into the statement itself, as the
 * literal the connector's `escape` produces, and sends the finished text with
 * no values. The connector therefore never parses the statement for
 * placeholders of its own.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { MariaEngine } from '@tundralibs/drivers/maria';
 *
 * const engine = new MariaEngine('app', {
 *   host: '10.1.10.3',
 *   port: 3306,
 *   database: 'mysql',
 *   username: 'root',
 *   password: 'mysql',
 * });
 *
 * const result = await engine.execute({
 *   sql: 'SELECT * FROM users WHERE id = :id:',
 *   params: { id: 1 },
 * });
 * ```
 */

import {
  type Connection,
  createConnection,
  type FieldInfo,
  type TypeCastNextFunction,
} from '$maria';
import type { EventOptionKeys } from '@tundralibs/utils';
import { validateTLS } from '@tundralibs/compat/common';
import { MariaTranslator } from '@tundralibs/oql/translator';
import { replacePlaceholders } from '../../placeholders.ts';
import { SQLEngine } from '../../SQLEngine.ts';
import { EngineError, type EngineErrorCode } from '../../errors/mod.ts';
import type {
  EngineQuery,
  SQLEngineCapabilities,
  SQLEngineEvents,
} from '../../types/mod.ts';
import type { MariaEngineOptions } from './types/mod.ts';

const MARIA_DEFAULTS: Partial<MariaEngineOptions> = {
  port: 3306,
};

/** Server status bit set while the session runs `NO_BACKSLASH_ESCAPES`. */
const STATUS_NO_BACKSLASH_ESCAPES = 1 << 9;
/** Server status bit MariaDB sets while the session runs `ANSI_QUOTES`. */
const STATUS_ANSI_QUOTES = 1 << 15;

/** Every way a session's `sql_mode` can read a backslash in quoted text. */
const QUOTE_READINGS = [
  {},
  { ansiQuotes: true },
  { noBackslashEscapes: true },
] as const;

/** The two hex digits of each byte value. */
const HEX: readonly string[] = Array.from(
  { length: 256 },
  (_, byte) => byte.toString(16).padStart(2, '0'),
);

/**
 * How the connection's session reads quoted text, from the status flags the
 * server sends with every reply. The connector's `escape` reads the same
 * flags, so the scanner and the escaping cannot disagree.
 */
function quoteRules(
  client: Connection,
): { noBackslashEscapes: boolean; ansiQuotes: boolean } {
  const status = client.info?.status ?? 0;
  return {
    noBackslashEscapes: (status & STATUS_NO_BACKSLASH_ESCAPES) !== 0,
    ansiQuotes: (status & STATUS_ANSI_QUOTES) !== 0,
  };
}

/** Column types the server returns as a day or a wall clock. */
const DATE_COLUMN_TYPES: ReadonlySet<string> = new Set([
  'DATE',
  'NEWDATE',
  'DATETIME',
  'TIMESTAMP',
]);

/**
 * Read a `DATE` / `DATETIME` / `TIMESTAMP` value as UTC — the session runs
 * in UTC, so its wall clock is the UTC clock. `npm:mariadb` would read it
 * in the host's time zone. A value that is not a calendar date (MariaDB's
 * zero date) comes back as the server's text.
 */
function readUtc(field: FieldInfo, next: TypeCastNextFunction): unknown {
  if (!DATE_COLUMN_TYPES.has(field.type)) return next();
  const text = field.string();
  if (text === null) return null;
  const clock = text.length > 10 ? text.slice(11, 23) : '00:00:00';
  const date = new Date(`${text.slice(0, 10)}T${clock}Z`);
  return Number.isNaN(date.getTime()) ? text : date;
}

/**
 * MariaDB / MySQL engine.
 *
 * Capabilities: transactions, prepared statements, named parameters via
 * `:name:`, each written into the statement as an escaped literal.
 *
 * **TLS:** `ssl: true | { … }` enables TLS via the underlying
 * `npm:mariadb` driver. The engine-only `ssl.enforce` field is
 * **ignored** here — `npm:mariadb` has no plaintext auto-downgrade
 * shim, so a TLS failure always surfaces as `CONNECTION_FAILED`. If
 * you need a fallback path, do it at the deployment layer (separate
 * connect attempts with different `ssl` configs).
 */
export class MariaEngine extends SQLEngine<Connection, MariaEngineOptions> {
  // Typed `string` (not the literal) so wire-compatible alias engines
  // (e.g. PlanetScaleEngine) can override it with their own identity.
  /** `'MARIA'`; alias engines override it with their own identity. */
  public readonly Engine: string = 'MARIA';

  /**
   * Full relational feature set. `parameterReplacement` is left `undefined`
   * because {@link MariaEngine._execute} writes the values into the statement.
   */
  public readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    advisoryLock: true, // GET_LOCK
    inPlaceAlter: true, // MODIFY COLUMN
    referentialActions: true,
  };

  /** Emits MariaDB/MySQL-dialect SQL. */
  protected readonly _translator: MariaTranslator = new MariaTranslator();

  /**
   * Validates options and defaults `port` to 3306. No connection is opened here.
   *
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `host`, `database`, or `username` is missing.
   */
  constructor(
    name: string,
    options: EventOptionKeys<MariaEngineOptions, SQLEngineEvents>,
  ) {
    super(name, options, MARIA_DEFAULTS);
    this._requireOptions(['host', 'database', 'username']);
  }

  //#region BaseEngine hooks

  /** Open one fresh `mariadb` connection. */
  protected async _createResource(): Promise<Connection> {
    const conn = await createConnection(
      this.__buildMariaConfig() as Parameters<typeof createConnection>[0],
    );
    return conn;
  }

  /** Close one `mariadb` connection. */
  protected async _destroyResource(conn: Connection): Promise<void> {
    try {
      await conn.end();
    } catch {
      // already closed — ignore
    }
  }

  /**
   * Liveness check on pool checkout. Prefers the driver's `isValid()` where
   * present and otherwise falls back to a `ping()` round trip; any failure
   * reports dead rather than throwing.
   */
  protected override async _validateResource(
    conn: Connection,
  ): Promise<boolean> {
    try {
      // mariadb's Connection has isValid() in newer versions
      const valid = (conn as { isValid?: () => unknown }).isValid?.();
      if (typeof valid === 'boolean') return valid;
      await conn.ping();
      return true;
    } catch {
      return false;
    }
  }

  /** Round-trips the driver's `ping()`; any failure reports dead. */
  protected async _ping(conn: Connection): Promise<boolean> {
    try {
      await conn.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build the config passed to `mariadb`'s `createConnection`. The package
   * accepts more options than its type definitions declare (e.g.
   * `supportBigInt`, `decimalAsNumber`), hence the typed-loose record.
   *
   * `program_name` joins the connect attributes the connector already sends
   * on every handshake, so the server shows it in
   * `performance_schema.session_connect_attrs`.
   */
  private __buildMariaConfig(): Record<string, unknown> {
    return {
      host: this._getOption('host'),
      port: this._getOption('port'),
      database: String(this._getOption('database')),
      user: this._getOption('username'),
      password: this._getOption('password'),
      ssl: this.__buildMariaSsl(),
      connectAttributes: {
        program_name: this._getOption('applicationName') ?? this.Name,
      },
      supportBigInt: true,
      decimalAsNumber: true,
      // Dates travel as UTC both ways, whatever the host's time zone:
      // `_encodeValue` sends the UTC clock and `readUtc` reads it back.
      initSql: "SET time_zone = '+00:00'",
      typeCast: readUtc,
    };
  }

  /**
   * Build the `ssl` value passed to `mariadb`'s `createConnection`.
   *
   * The `mariadb` package's TLS config wants PEM **content**, not file
   * paths. `compat`'s {@link validateTLS} normalises either presentation
   * — inline PEM (`cert` / `key` / `ca`) or file paths (`certFile` /
   * `keyFile` / `caFile`), which are mutually exclusive — to PEM content,
   * which we combine with `rejectUnauthorized` and `servername` (mariadb
   * sends it as SNI and verifies the server as it) and hand to mariadb. The
   * engine-only `enforce` flag is dropped — mariadb has no auto
   * fallback path.
   */
  private __buildMariaSsl():
    | undefined
    | true
    | {
      rejectUnauthorized: boolean;
      cert?: string;
      key?: string;
      ca?: string[];
      servername?: string;
    } {
    const ssl = this._getOption('ssl');
    if (!ssl) return undefined;
    if (ssl === true) return true;

    const validated = validateTLS(ssl);
    return {
      rejectUnauthorized: ssl.rejectUnauthorized !== false,
      cert: validated.cert,
      key: validated.key,
      ca: validated.ca,
      ...(ssl.servername !== undefined && { servername: ssl.servername }),
    };
  }

  //#endregion BaseEngine hooks

  //#region SQLEngine hooks

  /**
   * A `Date` goes to the server as its UTC clock (`YYYY-MM-DD
   * HH:MM:SS.mmm`). The session runs in UTC, so a `TIMESTAMP` column stores
   * that instant and a `DATETIME` / `DATE` column its UTC clock or day.
   *
   * An array is encoded element by element, at any depth: it is written as a
   * comma-separated list, where the connector would write a `Date` left
   * inside it in the host's time zone.
   *
   * @throws {EngineError} `OPERATION_FAILED` for an Invalid Date.
   */
  protected override _encodeValue(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((v) => this._encodeValue(v));
    if (!(value instanceof Date)) return value;
    if (Number.isNaN(value.getTime())) {
      throw new EngineError('OPERATION_FAILED', {
        instanceId: this.instanceId,
        operation: 'encode Date parameter',
        reason: 'value is an Invalid Date',
      });
    }
    return value.toISOString().slice(0, 23).replace('T', ' ');
  }

  /**
   * Trims the statement and encodes the values. The `:name:` placeholders
   * stay as written: {@link MariaEngine._execute} replaces them once it holds
   * the connection, whose `sql_mode` decides what is quoted text.
   *
   * A statement with a backslash can read differently per `sql_mode`. Outside
   * a transaction the connection is not known yet, so a placeholder that is
   * missing under only some readings is reported by `_execute` instead.
   *
   * @throws {EngineError} `MISSING_PARAMETERS` if a placeholder has no value.
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const standardized: EngineQuery = {
      ...query,
      sql: query.sql.trim().replace(/;$/, '') + ';',
    };
    const tx = query.transactionId === undefined
      ? undefined
      : this._transactions.get(query.transactionId);
    const readings = tx
      ? [quoteRules(tx.client)]
      : standardized.sql.includes('\\')
      ? QUOTE_READINGS
      : QUOTE_READINGS.slice(0, 1);
    const missing = new Set(
      readings.map((rules) => this.__scan(standardized, rules).missing),
    );
    const [names] = missing;
    if (missing.size === 1 && names) {
      throw new EngineError('MISSING_PARAMETERS', {
        instanceId: this.instanceId,
        missing: names,
      });
    }

    if (!query.params) return standardized;
    const params: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(query.params)) {
      params[k] = this._encodeValue(v);
    }
    return { ...standardized, params };
  }

  /**
   * Replaces each `:name:` placeholder the session's quoting rules find with
   * what `write` returns for its value, and lists the names that have none.
   * A value of `undefined` counts as none.
   */
  private __scan(
    query: EngineQuery,
    rules: { noBackslashEscapes?: boolean; ansiQuotes?: boolean },
    write?: (value: unknown, executable: boolean) => string,
  ): { sql: string; missing: string } {
    const params = query.params ?? {};
    const missing = new Set<string>();
    const sql = replacePlaceholders(
      query.sql,
      this.Dialect,
      (name, executable) => {
        const value = Object.hasOwn(params, name) ? params[name] : undefined;
        if (value === undefined) missing.add(name);
        else if (write) return write(value, executable);
        return '';
      },
      rules,
    );
    return { sql, missing: Array.from(missing).join(', ') };
  }

  /**
   * The statement with every value written in place of its placeholder. This
   * is the only place a value becomes SQL text, and each one gets there
   * through {@link MariaEngine.__literal}.
   *
   * A server either runs an executable comment or skips to the first `*` +
   * `/`, so a value written inside one may hold neither comment marker. It
   * also gets a space before it, so digits that follow the comment's opener
   * are not read as its version number.
   *
   * @throws {EngineError} `MISSING_PARAMETERS` if a placeholder has no value.
   * @throws {EngineError} `OPERATION_FAILED` for a value that cannot be
   *   written, or one that holds a comment marker inside an executable comment.
   */
  private __bind(query: EngineQuery, client: Connection): string {
    const { sql, missing } = this.__scan(
      query,
      quoteRules(client),
      (value, executable) => {
        const literal = this.__literal(value, client);
        if (!executable) return literal;
        if (literal.includes('*/') || literal.includes('/*')) {
          throw this.__unwritable(
            'a value inside an executable comment holds a comment marker',
          );
        }
        return ` ${literal}`;
      },
    );
    if (missing) {
      throw new EngineError('MISSING_PARAMETERS', {
        instanceId: this.instanceId,
        missing,
      });
    }
    return sql;
  }

  /**
   * One value as SQL text, quoted by the connector's `escape`, which follows
   * the session's `NO_BACKSLASH_ESCAPES`.
   *
   * - An array is its elements, comma-separated, at any depth.
   * - Bytes are a hex literal: `escape` decodes a `Buffer` as text, which
   *   loses any byte that is not valid in the session's character set.
   * - A boxed string is its text; `escape` would write it as JSON.
   *
   * @throws {EngineError} `OPERATION_FAILED` for a function, a symbol, `NaN`
   *   or an infinity, none of which `escape` writes as a value.
   */
  private __literal(value: unknown, client: Connection): string {
    if (Array.isArray(value)) {
      return value.map((v) => this.__literal(v, client)).join(',');
    }
    if (value instanceof Uint8Array) {
      let hex = '';
      for (let i = 0; i < value.length; i++) hex += HEX[value[i]!];
      return `X${client.escape(hex)}`;
    }
    if (typeof value === 'function' || typeof value === 'symbol') {
      throw this.__unwritable(`a ${typeof value} is not a value`);
    }
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw this.__unwritable(`${value} is not a number the server stores`);
    }
    return client.escape(value instanceof String ? value.valueOf() : value);
  }

  /** The error for a value that cannot be written into the statement. */
  private __unwritable(reason: string): EngineError {
    return new EngineError('OPERATION_FAILED', {
      instanceId: this.instanceId,
      operation: 'encode parameter',
      reason,
    });
  }

  /**
   * Sends the statement with its values already written in, so the connector
   * receives no values and parses nothing. A `SELECT` yields the row array
   * and its length; a modification yields no rows and the driver's
   * `affectedRows` as the count.
   *
   * @throws {EngineError} `MISSING_PARAMETERS` or `OPERATION_FAILED`, from
   *   writing the values.
   */
  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: Connection,
  ): Promise<{ data: R[]; count: number }> {
    const result = await client.query(this.__bind(query, client));
    if (Array.isArray(result)) {
      // SELECT etc. returns Array<row>.
      return { data: result as R[], count: result.length };
    }
    // Modification query: result is OkPacket.
    const ok = result as { affectedRows?: number };
    return { data: [], count: ok.affectedRows ?? 0 };
  }

  /** Begins the transaction on its reserved connection. */
  protected async _beginTransaction(client: Connection): Promise<void> {
    await client.beginTransaction();
  }

  /** Commits the transaction on its reserved connection. */
  protected async _commitTransaction(client: Connection): Promise<void> {
    await client.commit();
  }

  /** Rolls back the transaction on its reserved connection. */
  protected async _rollbackTransaction(client: Connection): Promise<void> {
    await client.rollback();
  }

  /**
   * Maps a MariaDB/MySQL driver error onto the standard engine error codes,
   * retaining `driverCode`, `driverErrno` and `sqlState` in the metadata.
   */
  protected override _wrapDriverError(
    error: unknown,
    query: EngineQuery,
  ): EngineError {
    if (error instanceof EngineError) return error;
    const e = error as {
      code?: string;
      errno?: number;
      sqlState?: string;
      sqlMessage?: string;
      message?: string;
    } & Error;
    const message = e.message ?? String(error);
    const code = _mariaErrorToCode(e);
    const meta: Record<string, unknown> = {
      instanceId: this.instanceId,
      reason: message,
      sql: query.sql,
    };
    if (e.code) meta.driverCode = e.code;
    if (e.errno !== undefined) meta.driverErrno = e.errno;
    if (e.sqlState) meta.sqlState = e.sqlState;
    // The server names the key, constraint, column or table only in its
    // message text.
    const text = e.sqlMessage ?? message;
    if (code === 'DUPLICATE_KEY') {
      const key = /for key '([^']+)'/.exec(text)?.[1];
      if (key !== undefined) meta.constraint = key;
    } else if (code === 'FOREIGN_KEY_VIOLATION' || code === 'CHECK_VIOLATION') {
      const constraint = /CONSTRAINT `([^`]+)`/.exec(text)?.[1];
      if (constraint !== undefined) meta.constraint = constraint;
    } else if (code === 'COLUMN_NOT_FOUND') {
      const column = /Unknown column '([^']+)'/.exec(text)?.[1];
      if (column !== undefined) meta.column = column;
    } else if (code === 'NOT_NULL_VIOLATION') {
      const column = /(?:Column|Field) '([^']+)'/.exec(text)?.[1];
      if (column !== undefined) meta.column = column;
    } else if (code === 'TABLE_NOT_FOUND') {
      const table = /(?:Table|Unknown table) '([^']+)'/.exec(text)?.[1];
      if (table !== undefined) meta.table = table;
    }
    return new EngineError(code, meta as never, e);
  }

  //#endregion SQLEngine hooks
}

/**
 * Map a MariaDB / MySQL error to one of our standardized engine codes.
 *
 * References:
 * - https://mariadb.com/kb/en/mariadb-error-codes/
 * - https://dev.mysql.com/doc/mysql-errors/8.0/en/server-error-reference.html
 */
function _mariaErrorToCode(
  e: { code?: string; errno?: number },
): EngineErrorCode {
  switch (e.code) {
    case 'ER_ACCESS_DENIED_ERROR':
    case 'ER_PASSWORD_NOT_ALLOWED':
      return 'INVALID_AUTH';
    case 'ER_DBACCESS_DENIED_ERROR':
    case 'ER_SPECIFIC_ACCESS_DENIED_ERROR':
    case 'ER_TABLEACCESS_DENIED_ERROR':
    case 'ER_COLUMNACCESS_DENIED_ERROR':
      return 'PERMISSION_DENIED';
    case 'ER_BAD_DB_ERROR':
    case 'ER_NO_DB_ERROR':
      return 'DATABASE_NOT_FOUND';
    case 'ER_NO_SUCH_TABLE':
    case 'ER_UNKNOWN_TABLE':
      return 'TABLE_NOT_FOUND';
    case 'ER_BAD_FIELD_ERROR':
      return 'COLUMN_NOT_FOUND';
    case 'ER_DUP_ENTRY':
    case 'ER_DUP_KEY':
    case 'ER_DUP_UNIQUE':
      return 'DUPLICATE_KEY';
    case 'ER_NO_REFERENCED_ROW':
    case 'ER_NO_REFERENCED_ROW_2':
    case 'ER_ROW_IS_REFERENCED':
    case 'ER_ROW_IS_REFERENCED_2':
      return 'FOREIGN_KEY_VIOLATION';
    case 'ER_BAD_NULL_ERROR':
    case 'ER_NO_DEFAULT_FOR_FIELD':
      return 'NOT_NULL_VIOLATION';
    case 'ER_CHECK_CONSTRAINT_VIOLATED':
    case 'ER_CONSTRAINT_FAILED':
      return 'CHECK_VIOLATION';
    case 'ER_PARSE_ERROR':
    case 'ER_SYNTAX_ERROR':
      return 'SYNTAX_ERROR';
    case 'ER_LOCK_DEADLOCK':
      return 'DEADLOCK';
    case 'ER_LOCK_WAIT_TIMEOUT':
      return 'LOCK_TIMEOUT';
    case 'ER_QUERY_TIMEOUT':
    case 'ER_STATEMENT_TIMEOUT':
      return 'QUERY_TIMEOUT';
    case 'ECONNREFUSED':
    case 'ECONNRESET':
    case 'ER_SERVER_SHUTDOWN':
    case 'ER_CONNECTION_KILLED':
      return 'CONNECTION_LOST';
    default:
      return 'QUERY_EXECUTION_FAILED';
  }
}
