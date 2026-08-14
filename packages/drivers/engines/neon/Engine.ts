/**
 * @fileoverview `NeonHttpEngine` — Postgres-over-HTTP for edge/serverless.
 *
 * "PostgresEngine over HTTP": a pool-free {@link SQLConnectionEngine} that
 * drives the {@link NeonHttpClient} (Neon's SQL-over-HTTP transport) instead of
 * a TCP socket. It emits Postgres SQL (via {@link PostgresTranslator}), decodes
 * result values with the shared Postgres text decoder, and maps Postgres
 * SQLSTATE codes with the shared SQLSTATE table — **without** importing the TCP
 * wire stack (`PgConnection` / `protocol.ts` / `binary.ts` / `auth.ts` / compat
 * `connect`/`upgradeTls`). That keeps the `./neon` import graph edge-safe: its
 * only heavy dependency is `@tundralibs/restler` (→ native global `fetch`).
 *
 * ## What it reuses from the Postgres engine
 * - `../postgres/values.ts` → {@link decodeTextValue} — the OID → JS-value
 *   mapping (bigint/bool/int/float/bytea/json/date). Pure, wire-free.
 * - `../postgres/sqlState.ts` → {@link pgSqlStateToCode} — SQLSTATE → engine
 *   error code. Pure, wire-free.
 *
 * ## Honest capabilities (one-shot HTTP)
 * Each `sql()` is a standalone HTTP request, so there is no session to carry a
 * transaction, prepared statement, advisory lock, or connection pool across
 * calls. Those capabilities are declared `false`; `transactions` in particular
 * makes `transaction()` / `beginTransaction()` reject with
 * `UNSUPPORTED_OPERATION` at the base guard (before any client is reserved).
 *
 * @module
 *
 * @example
 * ```typescript
 * import { NeonHttpEngine } from '@tundralibs/drivers/neon';
 *
 * const neon = new NeonHttpEngine('edge', {
 *   host: 'ep-cool-name-a1b2c3.us-east-2.aws.neon.tech',
 *   connectionString: 'postgresql://user:pass@ep-cool-name-a1b2c3…/neondb',
 * });
 *
 * const result = await neon.execute({
 *   sql: 'SELECT * FROM users WHERE id = :id:',
 *   params: { id: 1 },
 * });
 * ```
 */

import type { EventOptionKeys } from '@tundralibs/utils/Options';
import { PostgresTranslator } from '@tundralibs/oql/translator';
import { SQLConnectionEngine } from '../../SQLEngine.ts';
import { EngineError } from '../../errors/mod.ts';
import type {
  EngineQuery,
  SQLEngineCapabilities,
  SQLEngineEvents,
} from '../../types/mod.ts';
import { decodeTextValue } from '../postgres/values.ts';
import { pgSqlStateToCode } from '../postgres/sqlState.ts';
import { NeonHttpClient } from './NeonHttpClient.ts';
import { NeonHttpError } from './NeonHttpError.ts';
import type { NeonHttpEngineOptions } from './types/mod.ts';

/**
 * Postgres over Neon's SQL-over-HTTP endpoint, for edge and serverless
 * runtimes where a TCP socket is unavailable. Pool-free: each query is one
 * standalone HTTP request, so transactions, prepared statements and advisory
 * locks are unsupported.
 */
export class NeonHttpEngine extends SQLConnectionEngine<
  NeonHttpClient,
  NeonHttpEngineOptions,
  SQLEngineEvents
> {
  /** Always `'NEON'`. */
  public readonly Engine: string = 'NEON';

  /**
   * Everything requiring a persistent session is `false`; the per-server
   * Postgres facts (`inPlaceAlter`, `referentialActions`) stay `true` because
   * the transport does not change them.
   */
  public readonly Capabilities: SQLEngineCapabilities = {
    // One-shot HTTP: no session survives a call, so no pool / tx / prepared
    // statement / advisory lock can span requests. Honest `false`s.
    pooledConnections: false,
    transactions: false,
    preparedStatements: false,
    advisoryLock: false,
    // Postgres accepts in-place `ALTER COLUMN ... TYPE` and enforces FK
    // referential actions — these are per-server facts, unaffected by the
    // HTTP transport.
    inPlaceAlter: true,
    referentialActions: true,
    // We emit `$N` ourselves in `_standardizeQuery`; leave the base rewrite off.
    parameterReplacement: undefined,
  };

  /** Emits Postgres-dialect SQL, shared with {@link PostgresEngine}. */
  protected readonly _translator: PostgresTranslator = new PostgresTranslator();

  /**
   * Validates options. No request is made here.
   *
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `host` is missing, or if no
   *   authentication mechanism (a `connectionString`, `username`+`password`+
   *   `database`, or a `token`) is supplied.
   */
  constructor(
    name: string,
    options: EventOptionKeys<NeonHttpEngineOptions, SQLEngineEvents>,
  ) {
    super(name, options);
    this._requireOptions(['host']);
    // Require at least one auth mechanism, mirroring what NeonHttpClient's own
    // constructor enforces — surfaced here as an engine config error so it
    // fails at construction rather than on the first request.
    const hasConnString = this.__present('connectionString');
    const hasToken = this.__present('token');
    const hasComponents = this.__present('username') &&
      this.__present('password') && this.__present('database');
    if (!hasConnString && !hasToken && !hasComponents) {
      throw new EngineError('MISSING_CONFIG_VALUE', {
        instanceId: this.instanceId,
        option: 'connectionString | token | username+password+database',
      });
    }
  }

  //#region ConnectionEngine seams (pool-free)

  /**
   * Establish the single HTTP client. No network happens here — the Neon
   * client is stateless (one HTTP request per query), which is exactly what
   * makes it edge/serverless-safe.
   */
  protected override _open(): void {
    const database = this._getOption('database');
    this._resource = new NeonHttpClient({
      host: this._getOption('host')!,
      endpoint: this._getOption('endpoint'),
      connectionString: this._getOption('connectionString'),
      username: this._getOption('username'),
      password: this._getOption('password'),
      // Base allows `string | number` for `database`; Neon uses string names.
      database: database === undefined ? undefined : String(database),
      token: this._getOption('token'),
      timeout: this._getOption('timeout'),
    });
  }

  /** Drop the client reference. There is no socket to close. */
  protected override _close(): void {
    this._resource = undefined;
  }

  /** Liveness probe: a trivial `SELECT 1` round-trip. */
  protected override async _ping(client: NeonHttpClient): Promise<boolean> {
    try {
      await client.sql('SELECT 1', []);
      return true;
    } catch {
      return false;
    }
  }

  //#endregion ConnectionEngine seams

  //#region SQLConnectionEngine hooks

  /**
   * Issues one HTTP request and decodes each cell from Postgres text using the
   * column OID, so values match what the socket-based {@link PostgresEngine}
   * would return.
   */
  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: NeonHttpClient,
  ): Promise<{ data: R[]; count: number }> {
    // `_standardizeQuery` rewrote `:name:` → `$N` and stashed the ordered,
    // JSON-serializable params in `__params`.
    const params = (query.__params as ReadonlyArray<unknown> | undefined) ?? [];
    const res = await client.sql<Record<string, unknown>>(query.sql, params);

    // Decode every cell from raw Postgres text using the column's OID — the
    // same mapping the socket-based PostgresEngine applies. RETURNING rows are
    // ordinary SELECT-shaped rows and surface here unchanged.
    const fields = res.fields;
    const data = res.rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const field of fields) {
        mapped[field.name] = decodeTextValue(
          (row[field.name] ?? null) as string | null,
          field.dataTypeID,
        );
      }
      return mapped as R;
    });

    return { data, count: res.rowCount };
  }

  // Neon's `/sql` endpoint runs one statement per HTTP request; there is no
  // session to hold an open transaction across calls. These throw a clear
  // unsupported-operation error — though in practice the base
  // `beginTransaction`/`commit`/`rollback` guard on `Capabilities.transactions`
  // (declared `false`) and reject before ever reaching these.

  /**
   * Unreachable in practice — the base guards on `Capabilities.transactions`
   * first.
   *
   * @throws {@link EngineError} `UNSUPPORTED_OPERATION`, always.
   */
  protected _beginTransaction(): never {
    throw this.__unsupportedTransaction();
  }

  /**
   * Unreachable in practice — no transaction can have been opened.
   *
   * @throws {@link EngineError} `UNSUPPORTED_OPERATION`, always.
   */
  protected _commitTransaction(): never {
    throw this.__unsupportedTransaction();
  }

  /**
   * Unreachable in practice — no transaction can have been opened.
   *
   * @throws {@link EngineError} `UNSUPPORTED_OPERATION`, always.
   */
  protected _rollbackTransaction(): never {
    throw this.__unsupportedTransaction();
  }

  /**
   * Encode a single JS value into a Neon HTTP param, following
   * node-postgres / `@neondatabase/serverless` `prepareValue` text semantics,
   * adapted for a JSON request body:
   *
   * - `null` / `undefined` → `null`
   * - `boolean` → the boolean (JSON-native; Postgres coerces `true`/`false`)
   * - finite `number` → the number (JSON-native)
   * - non-finite `number` (`NaN` / `±Infinity`) → its text form (`'NaN'` /
   *   `'Infinity'` / `'-Infinity'`), which Postgres `float4`/`float8` accept and
   *   which matches node-postgres text semantics. Sending the raw value would let
   *   `JSON.stringify` turn all three into `null`, silently binding SQL NULL.
   * - `bigint` → decimal string (a JSON number would lose precision past 2^53)
   * - `Date` → ISO-8601 string (accepted for `date`/`timestamp[tz]`)
   * - `Uint8Array` (incl. Node `Buffer`) → `\x`-prefixed hex (Postgres `bytea`)
   * - plain object / array → `JSON.stringify` (for `json`/`jsonb` columns)
   * - `string` → the string
   *
   * **v1 limitation:** arrays are serialized as JSON, so a native Postgres
   * array-typed column (`int[]`, `text[]`, …) is not supported — pass such
   * values pre-formatted as a Postgres array literal string, or use `jsonb`.
   */
  protected override _encodeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    switch (typeof value) {
      case 'boolean':
      case 'string':
        return value;
      case 'number':
        // Finite numbers ride the JSON fast path; NaN/±Infinity would become
        // `null` under `JSON.stringify`, so send their PG-accepted text form.
        return Number.isFinite(value) ? value : value.toString();
      case 'bigint':
        return value.toString();
    }
    if (value instanceof Date) {
      // An Invalid Date (`new Date('nope')`) has a NaN time; `toISOString()`
      // below throws a raw, contextless `RangeError` — and because
      // `_encodeValue` runs inside `_standardizeQuery` (outside `execute`'s
      // try/catch), that escapes the `@throws {EngineError}` contract. Surface
      // a typed engine error instead, mirroring the Postgres binary encoder.
      if (Number.isNaN(value.getTime())) {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'encode timestamp parameter',
          reason: 'value is an Invalid Date',
        });
      }
      return value.toISOString();
    }
    if (value instanceof Uint8Array) return _toByteaHex(value);
    // Plain object or array → json/jsonb text.
    return JSON.stringify(value);
  }

  /**
   * Rewrite `:name:` placeholders to Postgres `$N` markers and stash the
   * ordered, JSON-serializable param values (via {@link _encodeValue}) in
   * `__params` for {@link _execute}.
   *
   * Duplicates PostgresEngine's rewrite rather than refactoring the shared base
   * — the two diverge in what they stash (`$N` + encoded JSON values here vs.
   * `$N` + binary `EncodedParam` there), and duplicating ~30 lines is lower
   * risk than threading a second encoder through the base standardizer.
   *
   * @throws {EngineError} `MISSING_PARAMETERS` if a `:name:` placeholder has no
   *   matching `params` entry.
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const sqlBody = query.sql.trim().replace(/;$/, '') + ';';
    const supplied = query.params ?? {};
    const nameToIndex = new Map<string, number>();
    const orderedNames: string[] = [];
    const missing: string[] = [];

    const rewritten = sqlBody.replaceAll(
      // Letter-or-underscore-first identifiers only — keeps us from misfiring
      // on time literals like '00:00:00' or on `::cast`.
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

    const encoded = orderedNames.map((n) =>
      this._encodeValue((supplied as Record<string, unknown>)[n])
    );

    return {
      ...query,
      sql: rewritten,
      __params: encoded,
    } as EngineQuery;
  }

  /**
   * Maps a {@link NeonHttpError}'s SQLSTATE onto the standard engine error
   * codes. Only query-relevant fields are copied across — the connection
   * string and request headers are deliberately left on the client.
   */
  protected override _wrapDriverError(
    error: unknown,
    query: EngineQuery,
  ): EngineError {
    if (error instanceof EngineError) return error;
    if (error instanceof NeonHttpError) {
      // Map only the safe, query-relevant fields. The connection string /
      // request headers live on the RESTler client, never on the error, and
      // are deliberately NOT copied here.
      const sqlState = error.code;
      const code = sqlState
        ? pgSqlStateToCode(sqlState)
        : 'QUERY_EXECUTION_FAILED';
      const fields = error.context.fields;
      const meta: Record<string, unknown> = {
        instanceId: this.instanceId,
        reason: error.message,
        sqlState,
        sql: query.sql,
      };
      if (fields?.table) meta.table = fields.table;
      if (fields?.column) meta.column = fields.column;
      if (fields?.constraint) meta.constraint = fields.constraint;
      if (fields?.detail) meta.detail = fields.detail;
      return new EngineError(code, meta as never, error);
    }
    return new EngineError(
      'QUERY_EXECUTION_FAILED',
      {
        instanceId: this.instanceId,
        reason: error instanceof Error ? error.message : String(error),
        sql: query.sql,
      } as never,
      error as Error,
    );
  }

  //#endregion SQLConnectionEngine hooks

  //#region Option processing

  /**
   * Validates the Neon-only options (`endpoint`, `connectionString`, `token`,
   * `timeout`) and delegates the rest to the base.
   *
   * @returns The validated value, unmodified.
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` for any value that
   *   fails its check.
   *
   * @internal
   */
  protected override _processOption<K extends keyof NeonHttpEngineOptions>(
    key: K,
    value: NeonHttpEngineOptions[K],
  ): NeonHttpEngineOptions[K] {
    switch (key as keyof NeonHttpEngineOptions) {
      case 'endpoint':
      case 'connectionString':
      case 'token':
        if (value !== undefined) {
          if (typeof value !== 'string' || value.trim().length === 0) {
            throw new EngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              option: key as string,
              reason: 'must be a non-empty string',
            });
          }
        }
        break;
      case 'timeout':
        if (value !== undefined) {
          // RESTler enforces 1..120s at connect(); validate the same bounds
          // eagerly here so an out-of-range value fails at construction with a
          // clear INVALID_CONFIG_VALUE instead of a late CONNECTION_FAILED.
          if (
            typeof value !== 'number' || !Number.isFinite(value) ||
            value < 1 || value > 120
          ) {
            throw new EngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              option: key as string,
              reason: 'must be a number of seconds between 1 and 120',
            });
          }
        }
        break;
    }
    // Unknown-to-this-switch keys (host/username/password/database/pool/ssl and
    // the SQL knobs) fall through to the base validators.
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  //#endregion Option processing

  //#region Helpers

  /** Whether an option is set to a meaningful (non-empty for strings) value. */
  private __present(key: keyof NeonHttpEngineOptions): boolean {
    const v = this._getOption(key);
    if (v === undefined) return false;
    if (typeof v === 'string') return v.trim().length > 0;
    return true;
  }

  /** Builds the shared `UNSUPPORTED_OPERATION` error for the transaction seams. */
  private __unsupportedTransaction(): EngineError {
    return new EngineError('UNSUPPORTED_OPERATION', {
      instanceId: this.instanceId,
      operation: 'transactions are not supported over Neon one-shot HTTP',
    });
  }

  //#endregion Helpers
}

/** Encode bytes as a Postgres `bytea` hex literal (`\x…`). */
function _toByteaHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return `\\x${hex}`;
}
