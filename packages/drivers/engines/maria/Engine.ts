/**
 * @fileoverview MariaDB / MySQL driver engine wrapping `npm:mariadb`.
 *
 * The MySQL/MariaDB wire protocol is messy enough (capability flags, multiple
 * auth plugins, version-dependent quirks) that we wrap a battle-tested package
 * rather than reimplement. We use `createConnection` (per-connection) and let
 * `BaseEngine`'s pool own the lifecycle — no double-pooling.
 *
 * Named parameters via `:name:` are rewritten to `:name` (single colon) by
 * `SQLEngine._standardizeQuery`; the underlying driver consumes that natively
 * because we pass `namedPlaceholders: true`.
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

/// <reference types="npm:@types/node@22" />
import { type Connection, createConnection } from '$maria';
import type { EventOptionKeys } from '@tundralibs/utils';
import { validateTLS } from '@tundralibs/compat/common';
import { MariaTranslator } from '@tundralibs/oql/translator';
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

/**
 * MariaDB / MySQL engine.
 *
 * Capabilities: transactions, prepared statements, named parameters via
 * `:name:` (rewritten to driver-native `:name`).
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
  public readonly Engine: string = 'MARIA';

  public readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    advisoryLock: true, // GET_LOCK
    inPlaceAlter: true, // MODIFY COLUMN
    referentialActions: true,
    parameterReplacement: { prefix: ':', suffix: '' },
  };

  protected readonly _translator: MariaTranslator = new MariaTranslator();

  /**
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
    // The `mariadb` package accepts more options than its type definitions
    // declare (e.g. `supportBigInt`, `decimalAsNumber`). Pass through as a
    // typed-loose record.
    const config: Record<string, unknown> = {
      host: this._getOption('host'),
      port: this._getOption('port'),
      database: String(this._getOption('database')),
      user: this._getOption('username'),
      password: this._getOption('password'),
      ssl: this.__buildMariaSsl(),
      namedPlaceholders: true,
      supportBigInt: true,
      decimalAsNumber: true,
    };
    const conn = await createConnection(
      config as Parameters<typeof createConnection>[0],
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

  protected async _ping(conn: Connection): Promise<boolean> {
    try {
      await conn.ping();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Build the `ssl` value passed to `mariadb`'s `createConnection`.
   *
   * The `mariadb` package's TLS config wants PEM **content**, not file
   * paths. `compat`'s {@link validateTLS} normalises either presentation
   * — inline PEM (`cert` / `key` / `ca`) or file paths (`certFile` /
   * `keyFile` / `caFile`), which are mutually exclusive — to PEM content,
   * which we combine with `rejectUnauthorized` and hand to mariadb. The
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
    };
  }

  //#endregion BaseEngine hooks

  //#region SQLEngine hooks

  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: Connection,
  ): Promise<{ data: R[]; count: number }> {
    const result = await client.query(
      { sql: query.sql, namedPlaceholders: true },
      query.params ?? {},
    );
    if (Array.isArray(result)) {
      // SELECT etc. returns Array<row>.
      return { data: result as R[], count: result.length };
    }
    // Modification query: result is OkPacket.
    const ok = result as { affectedRows?: number };
    return { data: [], count: ok.affectedRows ?? 0 };
  }

  protected async _beginTransaction(client: Connection): Promise<void> {
    await client.beginTransaction();
  }

  protected async _commitTransaction(client: Connection): Promise<void> {
    await client.commit();
  }

  protected async _rollbackTransaction(client: Connection): Promise<void> {
    await client.rollback();
  }

  protected override _wrapDriverError(
    error: unknown,
    query: EngineQuery,
  ): EngineError {
    if (error instanceof EngineError) return error;
    const e = error as {
      code?: string;
      errno?: number;
      sqlState?: string;
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
    case 'ER_DBACCESS_DENIED_ERROR':
    case 'ER_PASSWORD_NOT_ALLOWED':
      return 'INVALID_AUTH';
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
