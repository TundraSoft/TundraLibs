/**
 * @fileoverview `TursoEngine` — SQLite-over-HTTP for edge/serverless.
 *
 * "SQLiteEngine over HTTP": a pool-free {@link SQLConnectionEngine} that drives
 * the {@link TursoHttpClient} (Turso / libSQL's Hrana-v3 SQL-over-HTTP
 * transport) instead of a native SQLite binding. It emits SQLite SQL (via
 * {@link SQLiteTranslator}), encodes/decodes values through the pure Hrana value
 * map, and maps SQLite error codes with the shared SQLite error map —
 * **without** importing any native SQLite driver (`bun:sqlite` / `@db/sqlite` /
 * `better-sqlite3` / `node:sqlite`). That keeps the `./turso` import graph
 * edge-safe: its only heavy dependency is `@tundralibs/restler` (→ native
 * global `fetch`).
 *
 * ## What it reuses from the SQLite engine
 * - `../sqlite/errorCodes.ts` → {@link sqliteErrorToCode} — the SQLite `code`/
 *   message → engine-error-code mapping. Pure, native-driver-free.
 *
 * ## What it does NOT reuse
 * - `../sqlite/Engine.ts` / `../sqlite/adapter.ts` — those import the runtime's
 *   native SQLite binding, which does not exist on the edge. The value mapping
 *   lives in the pure `./values.ts` instead.
 *
 * ## Honest capabilities (one-shot Hrana HTTP)
 * Each `execute()` is a standalone `[execute, close]` pipeline round-trip, so
 * there is no session to carry a transaction, prepared statement, advisory
 * lock, or connection pool across calls. Those capabilities are declared
 * `false`; `transactions` in particular makes `transaction()` /
 * `beginTransaction()` reject with `UNSUPPORTED_OPERATION` at the base guard
 * (before any client is reserved).
 *
 * ## Foreign-key enforcement caveat
 * {@link SQLEngineCapabilities.referentialActions} stays `true` — the
 * {@link SQLiteTranslator} still emits FK DDL, matching what the native
 * `SQLiteEngine` (and norm) expect. But over stateless one-shot HTTP there is
 * no session to hold a `PRAGMA foreign_keys = ON`, so **runtime** FK
 * enforcement depends on the server's own default: a Turso cloud database
 * enforces foreign keys by default, whereas a bare `sqld` follows SQLite's
 * compile-time default (typically OFF). No pragma is injected here.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { TursoEngine } from '@tundralibs/drivers/turso';
 *
 * const turso = new TursoEngine('edge', {
 *   url: 'libsql://my-db-my-org.turso.io',
 *   authToken: '<jwt>',
 * });
 *
 * const result = await turso.execute({
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
import { decodeHranaValue, encodeHranaValue } from './values.ts';
import { TursoHttpClient } from './TursoHttpClient.ts';
import { TursoHttpError } from './TursoHttpError.ts';
import type { HranaNamedArg, TursoEngineOptions } from './types/mod.ts';

export class TursoEngine extends SQLConnectionEngine<
  TursoHttpClient,
  TursoEngineOptions,
  SQLEngineEvents
> {
  public readonly Engine: string = 'TURSO';

  public readonly Capabilities: SQLEngineCapabilities = {
    // One-shot Hrana HTTP: no session survives a call, so no pool / tx /
    // prepared statement / advisory lock can span requests. Honest `false`s.
    pooledConnections: false,
    transactions: false,
    preparedStatements: false,
    advisoryLock: false,
    // SQLite cannot change a column's type in place (the table is rebuilt) —
    // a per-dialect fact unaffected by the HTTP transport. FK referential
    // actions stay `true` so the translator emits FK DDL (see the class-doc
    // caveat on runtime enforcement over stateless HTTP).
    inPlaceAlter: false,
    referentialActions: true,
    // Reuse the base `:name:` → `:name` rewrite: libSQL binds named args by
    // `:name` and the Hrana `named_args` carry the bare name.
    parameterReplacement: { prefix: ':', suffix: '' },
  };

  protected readonly _translator: SQLiteTranslator = new SQLiteTranslator();

  /**
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `url` is missing.
   */
  constructor(
    name: string,
    options: EventOptionKeys<TursoEngineOptions, SQLEngineEvents>,
  ) {
    super(name, options);
    this._requireOptions(['url']);
  }

  //#region ConnectionEngine seams (pool-free)

  /**
   * Establish the single HTTP client. No network happens here — the Turso
   * client is stateless (one HTTP request per statement), which is exactly
   * what makes it edge/serverless-safe.
   */
  protected override _open(): void {
    this._resource = new TursoHttpClient({
      url: this._getOption('url'),
      authToken: this._getOption('authToken') ?? '',
      timeout: this._getOption('timeout'),
    });
  }

  /** Drop the client reference. There is no socket to close. */
  protected override _close(): void {
    this._resource = undefined;
  }

  /** Liveness probe: a trivial `SELECT 1` round-trip. */
  protected override async _ping(client: TursoHttpClient): Promise<boolean> {
    try {
      await client.execute('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  //#endregion ConnectionEngine seams

  //#region SQLConnectionEngine hooks

  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: TursoHttpClient,
  ): Promise<{ data: R[]; count: number }> {
    // The base `_standardizeQuery` rewrote `:name:` → `:name` and left
    // `params` a name→value map. Turn it into Hrana `named_args`: the arg
    // `name` is the bare placeholder identifier (no sigil), the value already
    // encoded to a `HranaValue`.
    const supplied = query.params ?? {};
    const namedArgs: HranaNamedArg[] = Object.entries(supplied).map(
      ([name, value]) => ({ name, value: encodeHranaValue(value) }),
    );

    const res = await client.execute(query.sql, [], namedArgs);

    // Zip each row's positional cells with the column descriptors, decoding
    // every cell from its `HranaValue` tag. RETURNING rows are ordinary
    // SELECT-shaped rows and surface here unchanged.
    const cols = res.cols;
    const data = res.rows.map((row) => {
      const mapped: Record<string, unknown> = {};
      for (let i = 0; i < cols.length; i++) {
        // A column can be unnamed on the wire (e.g. a bare expression) — fall
        // back to its positional index so the key is always a string.
        const key = cols[i]!.name ?? String(i);
        mapped[key] = decodeHranaValue(row[i]!);
      }
      return mapped as R;
    });

    // `data` always carries the returned rows so RETURNING surfaces. `count`
    // is the row count for reads / RETURNING, else the affected-row count for
    // a bare INSERT/UPDATE/DELETE.
    return {
      data,
      count: data.length > 0 ? data.length : res.affectedRowCount,
    };
  }

  // Turso's Hrana pipeline runs one statement per HTTP request; there is no
  // session to hold an open transaction across calls. These throw a clear
  // unsupported-operation error — though in practice the base
  // `beginTransaction`/`commit`/`rollback` guard on `Capabilities.transactions`
  // (declared `false`) and reject before ever reaching these.

  protected _beginTransaction(): never {
    throw this.__unsupportedTransaction();
  }

  protected _commitTransaction(): never {
    throw this.__unsupportedTransaction();
  }

  protected _rollbackTransaction(): never {
    throw this.__unsupportedTransaction();
  }

  protected override _wrapDriverError(
    error: unknown,
    query: EngineQuery,
  ): EngineError {
    if (error instanceof EngineError) return error;
    if (error instanceof TursoHttpError) {
      // Map the SQLite `code` (+ message text) to a standard engine code. Only
      // the safe, query-relevant fields are copied — the auth token lives on
      // the RESTler client, never on the error, and is deliberately NOT copied.
      const code = sqliteErrorToCode(error.code, error.message);
      return new EngineError(
        code,
        {
          instanceId: this.instanceId,
          reason: error.message,
          code: error.code,
          sql: query.sql,
          // Lift `constraint` / `column` / `table` out of the SQLite message via
          // the shared pure parser so DUPLICATE_KEY / NOT_NULL_VIOLATION /
          // CHECK_VIOLATION render their `${constraint}` / `${column}`
          // placeholders — matching the native `SQLiteEngine` (documented parity).
          ...parseSqliteErrorMeta(error.message),
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

  protected override _processOption<K extends keyof TursoEngineOptions>(
    key: K,
    value: TursoEngineOptions[K],
  ): TursoEngineOptions[K] {
    switch (key as keyof TursoEngineOptions) {
      case 'url':
      case 'authToken':
        if (value !== undefined) {
          // `authToken` may be an empty string ("no auth" for a local sqld);
          // only reject a non-string. `url` must be a non-empty string.
          if (typeof value !== 'string') {
            throw new EngineError('INVALID_CONFIG_VALUE', {
              instanceId: this.instanceId,
              option: key as string,
              reason: 'must be a string',
            });
          }
          if (key === 'url' && value.trim().length === 0) {
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

  private __unsupportedTransaction(): EngineError {
    return new EngineError('UNSUPPORTED_OPERATION', {
      instanceId: this.instanceId,
      operation: 'transactions are not supported over Turso one-shot HTTP',
    });
  }

  //#endregion Helpers
}
