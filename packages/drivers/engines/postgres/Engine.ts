/**
 * @fileoverview PostgreSQL driver engine — wire protocol from scratch over `compat.connect`.
 *
 * Implements the v3.0 PostgreSQL protocol used by all currently-supported PG
 * versions (≥ 7.4). Authentication via SCRAM-SHA-256 (PG 10+ default,
 * RFC 5802) or cleartext password — the latter emits a loud `notice` when it
 * happens over an unencrypted socket, and can be refused outright with
 * `allowCleartextPassword: false`. MD5 password auth is not supported —
 * configure your `pg_hba.conf` to use `scram-sha-256`.
 *
 * Design notes:
 * - Parameters use `:name:` placeholders, rewritten to `$N` numeric markers
 *   internally (Postgres native binding format).
 * - Parameters are sent in **binary format** (`format: 1`) for bool, int,
 *   float, bigint, Date, bytea, and jsonb (see `binary.ts`); other params
 *   fall back to text. Result values are decoded from **text** based on the
 *   column's type OID (binary result decoding is a v1.x add).
 * - SCRAM auth uses Web Crypto for PBKDF2 + HMAC-SHA-256.
 *
 * Status: this driver is `1.0.0-rc` — functional and tested against the
 * common path, but treat as needing real-world soak testing before
 * relying on it for production.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { PostgresEngine } from '@tundralibs/drivers/postgres';
 *
 * const pg = new PostgresEngine('app', {
 *   host: '10.1.10.3',
 *   port: 5432,
 *   database: 'postgres',
 *   username: 'postgres',
 *   password: 'postgres',
 * });
 *
 * const result = await pg.execute({
 *   sql: 'SELECT * FROM users WHERE id = :id:',
 *   params: { id: 1 },
 * });
 * ```
 */

import {
  connect,
  type Connection,
  type TLSOptions,
  upgradeTls,
} from '@tundralibs/compat';
import type { EventOptionKeys } from '@tundralibs/utils';
import { PostgresTranslator } from '@tundralibs/oql/translator';
import { SQLEngine } from '../../SQLEngine.ts';
import { EngineError } from '../../errors/mod.ts';
import { looksLikeTlsRuntimeError } from '../../tls.ts';
import type {
  EngineQuery,
  SQLEngineCapabilities,
  SQLEngineEvents,
} from '../../types/mod.ts';
import { PgConnection } from './PgConnection.ts';
import { PgServerError } from './PgServerError.ts';
import { type EncodedParam, encodeParam } from './binary.ts';
import { buildSSLRequest } from './protocol.ts';
import { pgSqlStateToCode } from './sqlState.ts';
import type { PostgresEngineOptions } from './types/mod.ts';

const POSTGRES_DEFAULTS: Partial<PostgresEngineOptions> = {
  port: 5432,
};

export class PostgresEngine
  extends SQLEngine<PgConnection, PostgresEngineOptions> {
  // Typed `string` (not the literal) so wire-compatible alias engines
  // (e.g. CockroachEngine) can override it with their own identity.
  public readonly Engine: string = 'POSTGRES';

  public readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: true,
    transactions: true,
    preparedStatements: true,
    advisoryLock: true, // pg_advisory_lock
    inPlaceAlter: true, // ALTER COLUMN ... TYPE ... USING
    referentialActions: true,
    // We use $N internally; the SQLEngine standardizer leaves :name: alone
    // because we override _standardizeQuery below.
    parameterReplacement: undefined,
  };

  protected readonly _translator: PostgresTranslator = new PostgresTranslator();

  /**
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `host`, `database`, or `username` is missing.
   */
  constructor(
    name: string,
    options: EventOptionKeys<PostgresEngineOptions, SQLEngineEvents>,
  ) {
    super(name, options, POSTGRES_DEFAULTS);
    this._requireOptions(['host', 'database', 'username']);
  }

  //#region BaseEngine hooks

  /**
   * Open one fresh TCP connection, negotiate SSL if configured, and run
   * the startup + auth handshake.
   *
   * Postgres TLS is **STARTTLS-style**: connect plaintext, send the
   * 8-byte SSLRequest message, read a single-byte reply (`S` = upgrade,
   * `N` = server doesn't speak TLS), then upgrade the same socket if
   * the answer is `S`. We can't use `compat.connect({ tls: true })`
   * directly because that does TLS-from-byte-1, which Postgres
   * wouldn't recognise.
   *
   * `ssl.enforce` controls failure handling:
   * - `enforce: true` (default) — any TLS step failure throws.
   * - `enforce: false` — fall back to a fresh plain-TCP connection
   *   on TLS failure, with a `notice` emit. The caller's startup +
   *   auth then runs in the clear.
   */
  protected async _createResource(): Promise<PgConnection> {
    // Constructor enforces host / username / database are present, so
    // the non-null assertions below are safe.
    const hostname = this.getOption('host')!;
    const port = this.getOption('port')!;
    const ssl = this.getOption('ssl');
    const enforceTls = ssl
      ? (typeof ssl === 'object' ? ssl.enforce !== false : true)
      : false;

    // Permissive by default (libpq's behaviour without `require_auth`), with a
    // `notice` emitted on every cleartext-over-plaintext handshake. Only an
    // explicit `allowCleartextPassword: false` turns that into a refusal.
    const allowCleartextPassword =
      this.getOption('allowCleartextPassword') !== false;

    // First attempt: plain TCP, then SSL upgrade if configured. `tlsActive`
    // tracks whether the socket ended up encrypted — used to gate
    // cleartext-password auth (see PgConnection.__handleAuth).
    let conn: Connection;
    let tlsActive = false;
    try {
      conn = await this.__openWithOptionalTls(hostname, port);
      // `__openWithOptionalTls` upgrades to TLS whenever `ssl` is set and
      // returns plain otherwise; a TLS failure throws (handled below).
      tlsActive = !!ssl;
    } catch (e) {
      if (!ssl || enforceTls) {
        throw this.__mapPgError(e, 'connect');
      }
      // ssl is configured but `enforce: false` — surrender encryption
      // and reconnect plain. Loud emit so this isn't silently invisible.
      const reason = e instanceof Error ? e.message : String(e);
      this.emit(
        'notice',
        this.instanceId,
        `WARNING: TLS failed (${reason}); falling back to plaintext per ssl.enforce=false`,
      );
      conn = await connect({ hostname, port });
      tlsActive = false;
    }

    const pg = new PgConnection(conn, (msg) => {
      this.emit('notice', this.instanceId, msg);
    }, this.instanceId);
    try {
      await pg.connect({
        user: this.getOption('username')!,
        database: String(this.getOption('database')),
        password: this.getOption('password'),
        applicationName: this.getOption('applicationName') ?? this.Name,
        statementTimeoutMs: this.getOption('statementTimeoutMs'),
        tlsActive,
        allowCleartextPassword,
      });
      return pg;
    } catch (e) {
      try {
        await pg.close();
      } catch {
        /* ignore */
      }
      // Deno's TLS handshake is lazy — invalid certs surface here, on
      // the first read/write of the upgraded socket, not on
      // `Deno.startTls`. If we got an `InvalidData`/`BadResource`-style
      // error AND we were on a TLS upgrade AND `enforce: false`, retry
      // the entire flow over plaintext.
      // Treat backend ErrorResponse as protocol-layer (never retry).
      const isTlsErr = !(e instanceof PgServerError) &&
        looksLikeTlsRuntimeError(e);
      if (ssl && !enforceTls && isTlsErr) {
        const reason = e instanceof Error ? e.message : String(e);
        this.emit(
          'notice',
          this.instanceId,
          `WARNING: TLS handshake failed during startup (${reason}); falling back to plaintext per ssl.enforce=false`,
        );
        const plain = await connect({ hostname, port });
        const pgPlain = new PgConnection(plain, (msg) => {
          this.emit('notice', this.instanceId, msg);
        }, this.instanceId);
        try {
          await pgPlain.connect({
            user: this.getOption('username')!,
            database: String(this.getOption('database')),
            password: this.getOption('password'),
            applicationName: this.getOption('applicationName') ?? this.Name,
            statementTimeoutMs: this.getOption('statementTimeoutMs'),
            // Plaintext fallback — the socket is unencrypted.
            tlsActive: false,
            allowCleartextPassword,
          });
          return pgPlain;
        } catch (retryErr) {
          try {
            await pgPlain.close();
          } catch {
            /* ignore */
          }
          throw this.__mapPgError(retryErr, 'connect');
        }
      }
      throw this.__mapPgError(e, 'connect');
    }
  }

  /**
   * Open one TCP socket and, if `ssl` is set, do the Postgres SSL
   * handshake (`SSLRequest` → expect `'S'` → upgrade in place).
   * Returns the (possibly TLS-wrapped) {@link Connection}. Used by
   * {@link _createResource}; lifted out so the success path stays
   * linear and the fallback path can call us inside a try/catch.
   *
   * @throws {Error} If the server replies `'N'` (server doesn't speak
   *   TLS) or if the TLS upgrade fails.
   */
  private async __openWithOptionalTls(
    hostname: string,
    port: number,
  ): Promise<Connection> {
    const tcp = await connect({ hostname, port });
    const ssl = this.getOption('ssl');
    if (!ssl) return tcp;

    try {
      await tcp.write(buildSSLRequest());
      const reply = await tcp.read();
      if (!reply || reply.length === 0) {
        throw new EngineError('CONNECTION_LOST', {
          instanceId: this.instanceId,
          reason:
            'Postgres SSL negotiation: server closed connection before reply',
        });
      }
      const code = String.fromCodePoint(reply[0]!);
      if (code !== 'S') {
        throw new EngineError('CONNECTION_FAILED', {
          instanceId: this.instanceId,
          reason:
            `Postgres SSL negotiation: server refused TLS (replied '${code}'); ` +
            `set \`ssl: false\` or configure the server for TLS`,
        });
      }
      // The server replied with one byte ('S'); some servers may have
      // bundled additional bytes in the same TCP segment. The wrapped
      // `read()` returns whatever the kernel handed up — anything past
      // byte 0 must already be the TLS ClientHello *response*, which we
      // shouldn't be receiving yet (we're the client). In practice the
      // 'S' arrives alone. If a future server bundles, we'd need a
      // pushback buffer; defer until that's actually observed.
      if (reply.length > 1) {
        throw new EngineError('CONNECTION_FAILED', {
          instanceId: this.instanceId,
          reason:
            'Postgres SSL negotiation: server sent unexpected extra bytes after SSL reply byte',
        });
      }
      return await upgradeTls(tcp, {
        hostname,
        tls: this.__buildTlsOptions(ssl),
      });
    } catch (e) {
      try {
        tcp.close();
      } catch {
        /* ignore */
      }
      throw e;
    }
  }

  /**
   * Engine-level `ssl` is a `compat.TLSOptions` plus the engine-only
   * `enforce` flag. Compat reads files (`*File` paths) and validates
   * PEM content itself, so we just strip `enforce` and pass the rest
   * through unchanged.
   */
  private __buildTlsOptions(
    ssl: NonNullable<PostgresEngineOptions['ssl']>,
  ): true | TLSOptions {
    if (ssl === true || ssl === false) return true;
    const { enforce: _enforce, ...rest } = ssl;
    return rest;
  }

  protected async _destroyResource(conn: PgConnection): Promise<void> {
    await conn.close();
  }

  protected override _validateResource(conn: PgConnection): boolean {
    return !conn.closed;
  }

  protected async _ping(conn: PgConnection): Promise<boolean> {
    try {
      await conn.simpleQuery('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  //#endregion BaseEngine hooks

  //#region SQLEngine hooks

  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: PgConnection,
  ): Promise<{ data: R[]; count: number }> {
    // _standardizeQuery has already rewritten :name: → $N and built the
    // ordered array of EncodedParam (binary where it pays off, text
    // otherwise), stashing it in `__params`.
    const params = (query as Record<string, unknown>).__params as
      | ReadonlyArray<EncodedParam>
      | undefined ?? [];
    const result = await client.query(query.sql, params);
    return {
      data: result.rows as R[],
      count: result.rowCount,
    };
  }

  protected async _beginTransaction(client: PgConnection): Promise<void> {
    await client.simpleQuery('BEGIN');
  }

  protected async _commitTransaction(client: PgConnection): Promise<void> {
    await client.simpleQuery('COMMIT');
  }

  protected async _rollbackTransaction(client: PgConnection): Promise<void> {
    await client.simpleQuery('ROLLBACK');
  }

  /**
   * Override standardization to convert `:name:` placeholders to Postgres
   * numeric `$N` markers, and stash an ordered array of `EncodedParam`
   * (binary or text per type) in `__params` for `_execute`.
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const sqlBody = query.sql.trim().replace(/;$/, '') + ';';
    const supplied = query.params ?? {};
    const nameToIndex = new Map<string, number>();
    const orderedNames: string[] = [];
    const missing: string[] = [];

    const rewritten = sqlBody.replaceAll(
      // Letter-or-underscore-first identifiers only — keeps us from
      // misfiring on time literals like '00:00:00' or on `::cast`.
      /:([A-Za-z_]\w*):/g,
      (_full, key: string) => {
        if (!Object.hasOwn(supplied, key)) {
          missing.push(key);
        }
        let idx = nameToIndex.get(key);
        if (idx === undefined) {
          orderedNames.push(key);
          idx = orderedNames.length; // 1-based
          nameToIndex.set(key, idx);
        }
        return `$${idx}`;
      },
    );

    if (missing.length > 0) {
      throw new EngineError('MISSING_PARAMETERS', {
        instanceId: this.instanceId,
        missing: Array.from(new Set(missing)).join(', '),
      });
    }

    const encoded: EncodedParam[] = orderedNames.map((n) =>
      encodeParam((supplied as Record<string, unknown>)[n])
    );

    return {
      ...query,
      sql: rewritten,
      __params: encoded,
    } as EngineQuery;
  }

  protected override _wrapDriverError(
    error: unknown,
    query: EngineQuery,
  ): EngineError {
    if (error instanceof EngineError) return error;
    return this.__mapPgError(error, 'query', query.sql);
  }

  //#endregion SQLEngine hooks

  //#region Error mapping

  private __mapPgError(
    error: unknown,
    op: string,
    sql?: string,
  ): EngineError {
    if (error instanceof EngineError) return error;
    if (error instanceof PgServerError) {
      const code = pgSqlStateToCode(error.code);
      const meta: Record<string, unknown> = {
        instanceId: this.instanceId,
        reason: error.fields.get('M') ?? error.message,
        sqlState: error.code,
      };
      if (sql) meta.sql = sql;
      if (error.fields.has('t')) meta.table = error.fields.get('t');
      if (error.fields.has('c')) meta.column = error.fields.get('c');
      if (error.fields.has('n')) meta.constraint = error.fields.get('n');
      if (error.fields.has('D')) meta.detail = error.fields.get('D');
      return new EngineError(code, meta as never, error);
    }
    const e = error as Error;
    return new EngineError(
      op === 'connect' ? 'CONNECTION_FAILED' : 'QUERY_EXECUTION_FAILED',
      {
        instanceId: this.instanceId,
        operation: op,
        reason: e?.message ?? String(error),
        sql,
      } as never,
      e,
    );
  }

  //#endregion Error mapping
}
