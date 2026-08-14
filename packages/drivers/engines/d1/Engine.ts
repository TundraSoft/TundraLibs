/**
 * @fileoverview `D1Engine` — SQLite-over-HTTP for Cloudflare D1 (edge/serverless).
 *
 * "SQLiteEngine over the D1 REST API": a pool-free {@link SQLConnectionEngine}
 * that drives the {@link D1HttpClient} (Cloudflare D1's REST query API) instead
 * of a native SQLite binding. It emits SQLite SQL (via {@link SQLiteTranslator}),
 * passes values through as plain JSON, and maps SQLite error messages with the
 * shared SQLite error helpers — **without** importing any native SQLite driver
 * (`bun:sqlite` / `@db/sqlite` / `better-sqlite3` / `node:sqlite`). That keeps
 * the `./d1` import graph edge-safe: its only heavy dependency is
 * `@tundralibs/restler` (→ native global `fetch`).
 *
 * ## What it reuses from the SQLite engine
 * - `../sqlite/errorCodes.ts` → {@link sqliteErrorToCode} /
 *   {@link parseSqliteErrorMeta} — the SQLite `code`/message → engine-error-code
 *   mapping and constraint/column extraction. Pure, native-driver-free.
 *
 * ## What it does NOT reuse
 * - `../sqlite/Engine.ts` / `../sqlite/adapter.ts` — those import the runtime's
 *   native SQLite binding, which does not exist on the edge.
 *
 * ## Positional `?` parameters (NOT named args)
 * The D1 REST API binds **positional** `?` placeholders with a JSON `params`
 * array. So {@link _standardizeQuery} rewrites OQL's `:name:` placeholders to
 * `?` and builds the ordered params array — repeating the value once per
 * occurrence, because positional params cannot dedupe (each `?` consumes the
 * next array element). Every pushed value passes through {@link _encodeValue}.
 *
 * ## Plain-JSON value pass-through (NOT typed cells)
 * D1's `/query` endpoint returns rows as objects keyed by column name with
 * already-JSON values (INTEGER→number, REAL→number, TEXT→string, NULL→null), so
 * value **decoding** is essentially pass-through. The one exception is BLOB:
 * JSON has no binary type, so D1 serializes a BLOB as an **array of byte
 * numbers** — decoded here to a `Uint8Array`. (Verified: Cloudflare D1 returns
 * BLOB columns as a JSON array over the REST API.)
 *
 * ### Documented value limitations (D1 over JSON)
 * - **int64 precision**: a JS `bigint` is encoded to a JSON `number`. Values
 *   within `Number.isSafeInteger` round-trip exactly; a `bigint` beyond
 *   ±(2^53 − 1) **loses precision** — D1/JSON cannot carry a 64-bit integer
 *   losslessly (unlike Turso's Hrana transport, which strings the integer). Use
 *   TEXT for exact large-integer storage if this matters.
 * - **BLOB params**: a `Uint8Array` bind value is encoded to an array of byte
 *   numbers — the same JSON shape D1 uses to **return** a BLOB (JSON has no
 *   binary type). The read direction is well-documented (Cloudflare D1 returns
 *   a BLOB column as a JSON array of byte numbers over REST — see
 *   `workers-sdk#8642` and the D1 client type-conversion docs); the REST
 *   `/query` `params` **bind** form for a BLOB is NOT separately specified by
 *   Cloudflare's docs, so this mirrors the documented read form. That end-to-end
 *   bind round-trip is exercised only by the opt-in `D1_HTTP_ENDPOINT` live
 *   test against real D1 (the in-process test proxy is collusive and proves
 *   nothing about it). See `Drivers-D1.md` → Type round-trips.
 *
 * ## Honest capabilities (one-shot REST)
 * Each `execute()` is a standalone HTTP request, so there is no session to carry
 * a transaction, prepared statement, advisory lock, or connection pool across
 * calls. Those capabilities are declared `false`; `transactions` in particular
 * makes `transaction()` / `beginTransaction()` reject with
 * `UNSUPPORTED_OPERATION` at the base guard (before any client is reserved).
 *
 * ## Foreign-key enforcement caveat
 * {@link SQLEngineCapabilities.referentialActions} stays `true` — the
 * {@link SQLiteTranslator} still emits FK DDL, matching what the native
 * `SQLiteEngine` (and norm) expect. Over stateless one-shot HTTP there is no
 * session to hold a `PRAGMA foreign_keys = ON`, but Cloudflare D1 **enforces
 * foreign keys by default** on every query (equivalent to
 * `PRAGMA foreign_keys = ON` per statement — verified against the D1 docs), so
 * FK constraints are enforced at runtime without any pragma injected here.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { D1Engine } from '@tundralibs/drivers/d1';
 *
 * const d1 = new D1Engine('edge', {
 *   accountId: '<account-id>',
 *   databaseId: '<database-id>',
 *   apiToken: '<api-token>',
 * });
 *
 * const result = await d1.execute({
 *   sql: 'SELECT * FROM users WHERE id = :id:',
 *   params: { id: 1 },
 * });
 * ```
 */

import type { EventOptionKeys } from '@tundralibs/utils/Options';
import { SQLiteTranslator } from '@tundralibs/oql/translator';
import { SQLConnectionEngine } from '../../SQLEngine.ts';
import { EngineError } from '../../errors/mod.ts';
import type {
  EngineQuery,
  SQLEngineCapabilities,
  SQLEngineEvents,
} from '../../types/mod.ts';
import {
  parseSqliteErrorMeta,
  sqliteErrorToCode,
} from '../sqlite/errorCodes.ts';
import { D1HttpClient } from './D1HttpClient.ts';
import { D1HttpError } from './D1HttpError.ts';
import type { D1EngineOptions } from './types/mod.ts';

/**
 * Cloudflare D1 over its REST query API, for edge and serverless runtimes.
 * Pool-free: each statement is one standalone HTTP request, so transactions,
 * prepared statements and advisory locks are unsupported.
 */
export class D1Engine extends SQLConnectionEngine<
  D1HttpClient,
  D1EngineOptions,
  SQLEngineEvents
> {
  /** Always `'D1'`. */
  public readonly Engine: string = 'D1';

  /**
   * Everything requiring a persistent session is `false`; `inPlaceAlter` is
   * `false` because SQLite rebuilds a table to change a column's type,
   * independent of the transport.
   */
  public readonly Capabilities: SQLEngineCapabilities = {
    // One-shot REST: no session survives a call, so no pool / tx / prepared
    // statement / advisory lock can span requests. Honest `false`s.
    pooledConnections: false,
    transactions: false,
    preparedStatements: false,
    advisoryLock: false,
    // SQLite cannot change a column's type in place (the table is rebuilt) —
    // a per-dialect fact unaffected by the HTTP transport. FK referential
    // actions stay `true` so the translator emits FK DDL; D1 enforces FKs by
    // default (see the class-doc caveat).
    inPlaceAlter: false,
    referentialActions: true,
    // We emit positional `?` ourselves in `_standardizeQuery`; leave the base
    // named-placeholder rewrite off.
    parameterReplacement: undefined,
  };

  /** Emits SQLite-dialect SQL, shared with {@link SQLiteEngine}. */
  protected readonly _translator: SQLiteTranslator = new SQLiteTranslator();

  /**
   * Validates options. No request is made here. Set `endpoint` to target a
   * Cloudflare-compatible gateway or local proxy instead of the cloud API.
   *
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `accountId`, `databaseId`,
   *   or `apiToken` is missing.
   */
  constructor(
    name: string,
    options: EventOptionKeys<D1EngineOptions, SQLEngineEvents>,
  ) {
    super(name, options);
    this._requireOptions(['accountId', 'databaseId', 'apiToken']);
  }

  //#region ConnectionEngine seams (pool-free)

  /**
   * Establish the single HTTP client. No network happens here — the D1 client
   * is stateless (one HTTP request per statement), which is exactly what makes
   * it edge/serverless-safe.
   */
  protected override _open(): void {
    this._resource = new D1HttpClient({
      accountId: this._getOption('accountId'),
      databaseId: this._getOption('databaseId'),
      apiToken: this._getOption('apiToken'),
      // A Cloudflare-compatible gateway / local test proxy, when set; otherwise
      // the client dials Cloudflare's cloud endpoint.
      endpoint: this._getOption('endpoint'),
      timeout: this._getOption('timeout'),
    });
  }

  /** Drop the client reference. There is no socket to close. */
  protected override _close(): void {
    this._resource = undefined;
  }

  /** Liveness probe: a trivial `SELECT 1` round-trip. */
  protected override async _ping(client: D1HttpClient): Promise<boolean> {
    try {
      await client.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  //#endregion ConnectionEngine seams

  //#region SQLConnectionEngine hooks

  /**
   * Issues one REST request with positional params. Cells arrive as plain JSON
   * so decoding is pass-through apart from BLOBs, which D1 sends as a byte
   * array. `count` is the row count when rows came back (including
   * `RETURNING`), otherwise `meta.changes`.
   */
  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: D1HttpClient,
  ): Promise<{ data: R[]; count: number }> {
    // `_standardizeQuery` rewrote `:name:` → `?` and stashed the ordered,
    // JSON-serializable params (one per placeholder occurrence) in `__params`.
    const params = (query.__params as ReadonlyArray<unknown> | undefined) ?? [];
    const res = await client.query<Record<string, unknown>>(query.sql, params);

    // Rows arrive as objects keyed by column name with already-JSON values, so
    // decoding is pass-through — the one exception being a BLOB, which D1
    // serializes as a JSON array of byte numbers (decoded to `Uint8Array`).
    // RETURNING rows are ordinary SELECT-shaped rows and surface here unchanged.
    const data = res.results.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (const key of Object.keys(row)) {
        mapped[key] = _decodeD1Cell(row[key]);
      }
      return mapped as R;
    });

    // `data` always carries the returned rows so RETURNING surfaces. `count`
    // is the row count for reads / RETURNING, else the affected-row count
    // (`meta.changes`) for a bare INSERT/UPDATE/DELETE.
    return {
      data,
      count: data.length > 0 ? data.length : res.meta.changes,
    };
  }

  // D1's REST query API runs one statement per HTTP request; there is no
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
   * Encode a single JS value into a D1 REST param (plain JSON), mirroring the
   * native `SQLiteEngine`'s value semantics adapted for a JSON request body:
   *
   * - `null` / `undefined` → `null`
   * - `boolean` → `1` / `0` (SQLite has no boolean type)
   * - `number` → the number (JSON-native)
   * - `bigint` → a JSON `number`. **Precision caveat**: values within
   *   `Number.isSafeInteger` are exact; a `bigint` beyond ±(2^53 − 1) loses
   *   precision — D1/JSON cannot carry a 64-bit integer losslessly.
   * - `Date` → ISO-8601 string (parity with the native `SQLiteEngine`)
   * - `Uint8Array` → an array of byte numbers — the same JSON shape D1 uses to
   *   return a BLOB (the read form is documented; the REST bind form is not
   *   separately specified, so this mirrors it — see the class doc / the
   *   `D1_HTTP_ENDPOINT` live test)
   * - plain object / array → `JSON.stringify` (for TEXT/JSON columns)
   * - `string` → the string
   */
  protected override _encodeValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    switch (typeof value) {
      case 'boolean':
        return value ? 1 : 0;
      case 'number':
      case 'string':
        return value;
      case 'bigint':
        // JSON has no bigint; send a plain number. Exact within the safe-integer
        // range, lossy beyond it (documented limitation — D1/JSON can't carry
        // int64 losslessly, unlike Turso's Hrana string-encoded integers).
        return Number(value);
    }
    if (value instanceof Date) {
      // An Invalid Date (`new Date('nope')`) has a NaN time; `toISOString()`
      // below throws a raw, contextless `RangeError` — and because
      // `_encodeValue` runs inside `_standardizeQuery` (outside `execute`'s
      // try/catch), that escapes the `@throws {EngineError}` contract. Surface
      // a typed engine error instead, mirroring the native SQLiteEngine.
      if (Number.isNaN(value.getTime())) {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'encode Date parameter',
          reason: 'value is an Invalid Date',
        });
      }
      return value.toISOString();
    }
    // A binary bind value becomes an array of byte numbers — the same JSON
    // shape D1 returns a BLOB in (JSON has no binary type). Mirrors the
    // documented read form; the REST bind form is only verified end-to-end by
    // the opt-in real-endpoint live test.
    if (value instanceof Uint8Array) return Array.from(value);
    // Plain object / array → JSON text (SQLite stores JSON as TEXT).
    return JSON.stringify(value);
  }

  /**
   * Rewrite `:name:` placeholders to D1's positional `?` markers and stash the
   * ordered, JSON-serializable param values (via {@link _encodeValue}) in
   * `__params` for {@link _execute}.
   *
   * Unlike the Postgres `$N` rewrite (which dedupes a repeated name to one
   * marker), positional `?` cannot dedupe — each `?` consumes the next array
   * element — so a repeated `:name:` emits a `?` **and pushes its value** on
   * every occurrence.
   *
   * @throws {EngineError} `MISSING_PARAMETERS` if a `:name:` placeholder has no
   *   matching `params` entry.
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const sqlBody = query.sql.trim().replace(/;$/, '') + ';';
    const supplied = query.params ?? {};
    const orderedKeys: string[] = [];
    const missing: string[] = [];

    const rewritten = sqlBody.replaceAll(
      // Letter-or-underscore-first identifiers only — keeps us from misfiring
      // on time literals like '00:00:00' or on `::cast`.
      /:([A-Za-z_]\w*):/g,
      (_full, key: string) => {
        if (!Object.hasOwn(supplied, key)) {
          missing.push(key);
        }
        // Positional params can't dedupe: record the key for THIS occurrence so
        // a repeated name pushes its value once per `?`.
        orderedKeys.push(key);
        return '?';
      },
    );

    if (missing.length > 0) {
      throw new EngineError('MISSING_PARAMETERS', {
        instanceId: this.instanceId,
        missing: Array.from(new Set(missing)).join(', '),
      });
    }

    // Encode only after the missing-param check so MISSING_PARAMETERS wins over
    // an encode-time error (e.g. an Invalid Date).
    const encoded = orderedKeys.map((k) =>
      this._encodeValue((supplied as Record<string, unknown>)[k])
    );

    return {
      ...query,
      sql: rewritten,
      __params: encoded,
    } as EngineQuery;
  }

  /**
   * Maps a {@link D1HttpError} onto the standard engine error codes. D1's
   * `code` is Cloudflare's numeric API code rather than a `SQLITE_*` string, so
   * the mapping is driven off the message text and the numeric code is kept as
   * diagnostic metadata only.
   */
  protected override _wrapDriverError(
    error: unknown,
    query: EngineQuery,
  ): EngineError {
    if (error instanceof EngineError) return error;
    if (error instanceof D1HttpError) {
      // D1's `code` is Cloudflare's NUMERIC API/D1 code, not a `SQLITE_*`
      // string — so map from the SQLite-style message text (pass `undefined`
      // for the string code so `sqliteErrorToCode` falls to message matching).
      // The numeric D1 `code` is surfaced as diagnostic meta only. Only safe,
      // query-relevant fields are copied — the apiToken lives on the RESTler
      // client, never on the error, and is deliberately NOT copied.
      //
      // Real Cloudflare D1 (workerd's `dbErrorMessage()`) decorates EVERY
      // SQLite error message with a trailing
      // `[ at offset N]: SQLITE_<PRIMARY>[ (extended: SQLITE_<EXT>)]` tail —
      // e.g. `UNIQUE constraint failed: t.id: SQLITE_CONSTRAINT (extended:
      // SQLITE_CONSTRAINT_PRIMARYKEY)`. Classification is unaffected (it keys
      // off substrings), but `parseSqliteErrorMeta`'s `([^\s]+)` capture would
      // greedily grab the extra colon on the decorated form
      // (`constraint: "t.id:"`, `column: "t.y:"`, `table: "widgets:"`), so the
      // diagnostic identifier fields would be corrupt. Strip that decoration
      // BEFORE the shared helpers so the extracted `constraint`/`column`/`table`
      // match the native `SQLiteEngine` exactly. The strip is anchored to a
      // trailing `SQLITE_<NAME>` token (real SQLite text never ends that way),
      // so an UNDECORATED message — e.g. the native `SQLiteEngine`'s local
      // driver text — is passed through untouched. `reason` keeps the full raw
      // message for diagnostics.
      const bare = error.message.replace(
        /(?:\s+at offset\s+\d+)?:\s*SQLITE_[A-Z_]+(?:\s*\(extended:\s*SQLITE_[A-Z_]+\))?\s*$/,
        '',
      );
      const code = sqliteErrorToCode(undefined, bare);
      return new EngineError(
        code,
        {
          instanceId: this.instanceId,
          reason: error.message,
          code: error.code,
          status: error.status,
          sql: query.sql,
          // Lift `constraint` / `column` / `table` out of the (decoration-
          // stripped) SQLite message via the shared pure parser so
          // DUPLICATE_KEY / NOT_NULL_VIOLATION / CHECK_VIOLATION render their
          // `${constraint}` / `${column}` placeholders — matching the native
          // `SQLiteEngine` (documented parity).
          ...parseSqliteErrorMeta(bare),
        } as never,
        error,
      );
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
   * Validates the D1-only options (`accountId`, `databaseId`, `apiToken`,
   * `endpoint`, `timeout`) and delegates the rest to the base.
   *
   * @returns The validated value, unmodified.
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` for any value that
   *   fails its check.
   *
   * @internal
   */
  protected override _processOption<K extends keyof D1EngineOptions>(
    key: K,
    value: D1EngineOptions[K],
  ): D1EngineOptions[K] {
    switch (key as keyof D1EngineOptions) {
      case 'accountId':
      case 'databaseId':
      case 'apiToken':
      // `endpoint` is optional, but when supplied it must be a usable base URL
      // (same non-empty-string rule as the required creds; RESTler validates
      // the URL itself at construction).
      case 'endpoint':
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
          // The client forwards `timeout` to RESTler, which enforces 1..120s at
          // connect(); validate the same bounds eagerly here so an out-of-range
          // value fails at construction with a clear INVALID_CONFIG_VALUE
          // instead of a late CONNECTION_FAILED.
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
    // Unknown-to-this-switch keys fall through to the base validators.
    // deno-lint-ignore no-explicit-any
    return super._processOption(key as any, value);
  }

  //#endregion Option processing

  //#region Helpers

  /** Builds the shared `UNSUPPORTED_OPERATION` error for the transaction seams. */
  private __unsupportedTransaction(): EngineError {
    return new EngineError('UNSUPPORTED_OPERATION', {
      instanceId: this.instanceId,
      operation:
        'transactions are not supported over Cloudflare D1 one-shot HTTP',
    });
  }

  //#endregion Helpers
}

/**
 * Decode a single D1 result cell. D1's `/query` endpoint returns values as
 * plain JSON (INTEGER→number, REAL→number, TEXT→string, NULL→null), so decoding
 * is pass-through — except a BLOB, which (JSON having no binary type) D1
 * serializes as an **array of byte numbers**. SQLite has no array type, so any
 * array cell is a BLOB; decode it to a `Uint8Array`. Every other value passes
 * through untouched.
 */
function _decodeD1Cell(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Uint8Array.from(value as number[]);
  }
  return value;
}
