/**
 * @fileoverview SQLite driver engine — runtime-branched wrapper.
 *
 * SQLite is embedded (no protocol), so we wrap each runtime's native
 * binding via the adapter in `./adapter.ts`.
 *
 * Two modes:
 * - `path: ':memory:'` — single in-process memory database, no schemas.
 * - `path: '<dir>'` — directory mode. The engine creates a `<dir>/<name>/`
 *   subdirectory and stores `main.db` there. Each OQL "schema" becomes
 *   a sibling `<name>.db` file, ATTACHed under that name. CREATE_SCHEMA
 *   spawns the file via SQLite's own ATTACH-creates-if-missing semantics;
 *   DROP_SCHEMA detaches and the engine then unlinks the file.
 *
 * Pool: SQLite handles a single writer at a time, but readers can be
 * concurrent in WAL mode. For simplicity, this driver uses one shared
 * database handle (pool min/max forced to 1).
 *
 * **TLS:** there's no transport, so `ssl` / `ssl.enforce` are
 * **ignored**. Encryption-at-rest (SQLCipher and friends) is out of
 * scope for this driver.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
 *
 * // Directory mode: schemas supported.
 * const db = new SQLiteEngine('app', { path: './data' });
 * // → ./data/app/main.db, plus ./data/app/<schema>.db per CREATE_SCHEMA.
 *
 * // Memory mode: no schemas.
 * const mem = new SQLiteEngine('cache', { path: ':memory:' });
 * ```
 */

import { join, resolve as resolvePath } from '@tundralibs/compat/path';
import { makeDir, readDir, remove } from '@tundralibs/compat/file';
import type { EventOptionKeys } from '@tundralibs/utils';
import { SQLiteTranslator } from '@tundralibs/oql/translator';
import { SQLEngine } from '../../SQLEngine.ts';
import { EngineError } from '../../errors/mod.ts';
import type {
  EngineQuery,
  SQLEngineCapabilities,
  SQLEngineEvents,
} from '../../types/mod.ts';
import { openDatabase, type SqliteDb, type SqliteStmt } from './adapter.ts';
import { parseSqliteErrorMeta, sqliteErrorToCode } from './errorCodes.ts';
import type { SQLiteEngineOptions } from './types/mod.ts';

/**
 * Max number of prepared statements held per connection. Tuned for the
 * typical app shape (10–50 distinct query templates) — well over the
 * working set, well under runaway memory.
 */
const STATEMENT_CACHE_SIZE = 100;

/**
 * Cheap detection for "is this DML?". DML statements are deterministic
 * with respect to the schema, so their prepared form is safe to cache
 * and reuse. DDL (CREATE/ALTER/DROP/ATTACH/DETACH/PRAGMA/VACUUM) can
 * invalidate an existing cached statement and is uncommon, so we skip
 * caching those entirely and clear the cache on each one.
 */
function _isDml(sql: string): boolean {
  const head = sql.trimStart().slice(0, 8).toUpperCase();
  return head.startsWith('SELECT') || head.startsWith('INSERT') ||
    head.startsWith('UPDATE') || head.startsWith('DELETE') ||
    head.startsWith('WITH'); // CTE-prefixed DML
}

/**
 * `SAVEPOINT` / `RELEASE SAVEPOINT` never change the schema, so — unlike
 * other non-DML — they must NOT flush the prepared-statement cache. A
 * savepoint is opened (and released) on every nested transaction, and
 * this engine runs on a single shared connection, so dropping the
 * app-wide cache each time would thrash it. (`ROLLBACK TO SAVEPOINT` is
 * deliberately NOT exempt — it can undo DDL performed since the
 * savepoint, which may invalidate cached statements.)
 */
function _isCacheSafeSavepoint(sql: string): boolean {
  const head = sql.trimStart().toUpperCase();
  return head.startsWith('SAVEPOINT ') || head.startsWith('RELEASE ');
}

const SQLITE_DEFAULTS: Partial<SQLiteEngineOptions> = {
  create: true,
  readonly: false,
  // Force single-handle pool — SQLite cooperates poorly with parallel writers.
  pool: { min: 1, max: 1 },
};

/**
 * Local-file (or `':memory:'`) SQLite engine over the runtime's native
 * bindings. The pool is pinned to a single handle — SQLite tolerates parallel
 * writers poorly — so `Capabilities.pooledConnections` is `false` even though
 * this extends the pooled {@link SQLEngine}. In directory mode each schema is
 * a separate `.db` file `ATTACH`ed under its filename.
 */
export class SQLiteEngine extends SQLEngine<SqliteDb, SQLiteEngineOptions> {
  /** Always `'SQLITE'`. */
  public readonly Engine = 'SQLITE';

  /**
   * No advisory locks (there is no server) and no in-place `ALTER` of a
   * column's type — a type change requires a table rebuild.
   */
  public readonly Capabilities: SQLEngineCapabilities = {
    pooledConnections: false,
    transactions: true,
    preparedStatements: true,
    advisoryLock: false, // file-local db — no server-side lock
    inPlaceAlter: false, // ALTER cannot change a column's type (rebuild)
    referentialActions: true, // FKs enforced (PRAGMA foreign_keys = ON)
    parameterReplacement: { prefix: ':', suffix: '' },
  };

  /** Emits SQLite-dialect SQL, including the file-per-schema emulation. */
  protected readonly _translator: SQLiteTranslator = new SQLiteTranslator();

  /**
   * SQLite forbids `ATTACH`, `DETACH`, and `VACUUM` inside a transaction.
   * The schema-emulation translator emits `ATTACH`/`DETACH` for
   * CREATE_SCHEMA / DROP_SCHEMA, so we route those around the auto-tx
   * wrapper and refuse a caller-supplied `transactionId` outright.
   */
  protected override _canRunInTransaction(sql: string): boolean {
    const head = sql.trimStart().slice(0, 16).toUpperCase();
    return !head.startsWith('ATTACH ') && !head.startsWith('DETACH ') &&
      !head.startsWith('VACUUM');
  }

  /**
   * Resolved schema directory (`<path>/<name>/`). `null` in `':memory:'`
   * mode. Set on first `_createResource()` call.
   */
  private __schemaDir: string | null = null;

  /**
   * Per-connection prepared-statement cache. Keyed by `SqliteDb` (the
   * pool's resource); inner map is keyed by SQL text. Insertion order
   * doubles as LRU order — touching a hit reinserts.
   *
   * Statements are finalized on three occasions: pool eviction (in
   * `_destroyResource`), cache overflow (LRU evict), and cache
   * invalidation (after any DDL/ATTACH/DETACH passes through).
   */
  private __preparedCache: WeakMap<SqliteDb, Map<string, SqliteStmt>> =
    new WeakMap();

  /**
   * Validates options; the database file is neither created nor opened until
   * the first connect. Pass `path: ':memory:'` for an ephemeral database, or a
   * directory under which `<name>/main.db` is created.
   *
   * @throws {EngineError} `MISSING_CONFIG_VALUE` if `path` is missing.
   */
  constructor(
    name: string,
    options: EventOptionKeys<SQLiteEngineOptions, SQLEngineEvents>,
  ) {
    super(name, options, SQLITE_DEFAULTS);
    this._requireOptions(['path']);
  }

  /**
   * Resolved schema directory in directory mode, or `null` in memory mode.
   * Useful for tests and tooling that need to inspect or clean up files.
   */
  public get schemaDir(): string | null {
    return this.__schemaDir;
  }

  //#region BaseEngine hooks

  /**
   * Open a SQLite handle. Thin indirection over the adapter's
   * `openDatabase` so subclasses (and tests) can intercept handle
   * creation — the close-on-ATTACH-failure path is exercised through it.
   */
  protected _openDatabase(
    path: string,
    options: { readonly?: boolean; create?: boolean },
  ): Promise<SqliteDb> {
    return openDatabase(path, options);
  }

  /**
   * Opens the handle. In directory mode this also creates `<path>/<name>/`
   * (unless `create: false`) and `ATTACH`es every sibling `.db` file under its
   * filename, so persisted schemas are queryable without a prior
   * `CREATE_SCHEMA`. A failing `ATTACH` closes the new handle before
   * rethrowing rather than leaking it.
   */
  protected async _createResource(): Promise<SqliteDb> {
    const path = this._getOption('path')!;

    if (path === ':memory:') {
      return await this._openDatabase(':memory:', {
        readonly: this._getOption('readonly'),
        create: this._getOption('create'),
      });
    }

    // Directory mode. Resolve `<path>/<name-lowercased>/` and ensure the
    // directory + `main.db` exist (when `create` is true).
    const dir = resolvePath(join(path, this.Name.toLowerCase()));
    if (this._getOption('create') !== false) {
      await makeDir(dir, { recursive: true });
    }
    this.__schemaDir = dir;
    const mainDb = join(dir, 'main.db');
    const db = await this._openDatabase(mainDb, {
      readonly: this._getOption('readonly'),
      create: this._getOption('create'),
    });

    // Auto-attach every other `.db` file in the directory under its
    // filename (sans extension). Lets queries reference any persisted
    // schema without first issuing CREATE_SCHEMA. If any ATTACH throws,
    // close the freshly opened handle before rethrowing — otherwise the
    // failed `_createResource` leaks an open db (and its file handle),
    // since `_acquire` never adds it to `_active` and can't release it.
    try {
      for await (const entry of readDir(dir)) {
        if (!entry.isFile || !entry.name.endsWith('.db')) continue;
        if (entry.name === 'main.db') continue;
        const schemaName = entry.name.slice(0, -'.db'.length);
        const filePath = join(dir, entry.name);
        // SQLite supports parameter binding for the file path but NOT for
        // the alias (it's an identifier, not a literal). Bind the path
        // and double-escape any `"` in the alias to keep the identifier
        // quoting closed.
        const stmt = db.prepare(
          `ATTACH DATABASE ? AS "${schemaName.replaceAll('"', '""')}"`,
        );
        stmt.run([filePath]);
        stmt.finalize?.();
      }
    } catch (e) {
      try {
        db.close();
      } catch {
        // handle may already be unusable — the original error is what matters
      }
      throw e;
    }

    return db;
  }

  /** Finalizes every cached prepared statement, then closes the handle. */
  protected _destroyResource(db: SqliteDb): void {
    // Finalize cached prepared statements before closing the handle —
    // some bindings (notably better-sqlite3) leak file descriptors if
    // the underlying database is closed while statements are live.
    this.__dropCache(db);
    try {
      db.close();
    } catch {
      // already closed
    }
  }

  /** Always `true` — a local file handle has no connection to lose. */
  protected _ping(): boolean {
    return true;
  }

  //#endregion BaseEngine hooks

  //#region SQLEngine hooks

  /**
   * Override standardization to:
   * - Resolve relative `<schema>.db` paths in `ATTACH DATABASE 'foo.db'`
   *   statements to absolute paths under {@link schemaDir}. The OQL
   *   translator emits the relative form because it doesn't know the
   *   engine's directory.
   */
  protected override _standardizeQuery(query: EngineQuery): EngineQuery {
    const standardized = super._standardizeQuery(query);
    if (
      this.__schemaDir && /^\s*ATTACH\s+DATABASE\s+'/i.test(standardized.sql)
    ) {
      // Cheap rewrite: replace the first single-quoted string in the
      // statement with its absolute form when it's a bare filename. We
      // intentionally don't try to handle every edge case — only the
      // OQL-translator-generated form `ATTACH DATABASE '<name>.db' AS ...`.
      const newSql = standardized.sql.replace(
        /ATTACH\s+DATABASE\s+'([^']+)'/i,
        (_match, file: string) => {
          if (file.includes('/') || file.includes('\\')) {
            // Already absolute or otherwise qualified — leave it alone.
            return _match;
          }
          return `ATTACH DATABASE '${join(this.__schemaDir!, file)}'`;
        },
      );
      return { ...standardized, sql: newSql };
    }
    return standardized;
  }

  /**
   * Runs the statement through the prepared-statement cache, then completes
   * `DROP_SCHEMA` by unlinking the detached schema's `.db` file — a `DETACH`
   * alone would leave the file behind. The unlink is best-effort.
   */
  protected async _execute<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: SqliteDb,
  ): Promise<{ data: R[]; count: number }> {
    const result = await this.__runQuery<R>(query, client);

    // Schema-lifecycle bookkeeping: when the user just DETACHed a
    // schema, unlink the underlying file so DROP_SCHEMA is a complete
    // round-trip. Cheap substring gate first so the regex doesn't run on
    // every query — the translator emits uppercase `DETACH DATABASE`.
    if (this.__schemaDir && query.sql.includes('DETACH')) {
      const detachMatch =
        /^\s*DETACH\s+DATABASE\s+(?:"([^"]+)"|`([^`]+)`|([A-Za-z_]\w*))/i
          .exec(query.sql);
      if (detachMatch) {
        const schemaName = detachMatch[1] ?? detachMatch[2] ?? detachMatch[3];
        if (schemaName && schemaName.toLowerCase() !== 'main') {
          try {
            await remove(join(this.__schemaDir, `${schemaName}.db`));
          } catch {
            // Best effort — file might not exist if the schema was
            // attached from outside the directory.
          }
        }
      }
    }

    return result;
  }

  private __runQuery<R extends Record<string, unknown>>(
    query: EngineQuery,
    client: SqliteDb,
  ): Promise<{ data: R[]; count: number }> {
    return new Promise((resolve, reject) => {
      try {
        const args = query.params ? [query.params] : [];
        if (_isDml(query.sql)) {
          // Cacheable path: borrow from the per-connection LRU. The
          // statement stays cached, no finalize.
          const stmt = this.__getOrPrepare(client, query.sql);
          if (_isSelect(query.sql)) {
            const rows = stmt.all(args) as R[];
            resolve({ data: rows, count: rows.length });
          } else {
            const r = stmt.run(args);
            resolve({ data: [], count: r.changes });
          }
          return;
        }
        // Non-DML: prepare, run, finalize, then drop the cache because
        // schema mutations (ALTER/DROP/ATTACH/DETACH) can invalidate
        // any prepared statement we'd previously cached.
        const stmt = client.prepare(query.sql);
        try {
          if (_isSelect(query.sql)) {
            const rows = stmt.all(args) as R[];
            resolve({ data: rows, count: rows.length });
          } else {
            const r = stmt.run(args);
            resolve({ data: [], count: r.changes });
          }
        } finally {
          stmt.finalize?.();
          // Savepoint open/release don't mutate the schema — keep the
          // prepared-statement cache so nested transactions don't thrash
          // it on the single shared connection.
          if (!_isCacheSafeSavepoint(query.sql)) this.__dropCache(client);
        }
      } catch (e) {
        reject(e);
      }
    });
  }

  /**
   * Look up a prepared statement in the cache, preparing on miss. LRU
   * touch on hit by deleting + reinserting (Map preserves insertion
   * order, so the first key is always the oldest).
   */
  private __getOrPrepare(db: SqliteDb, sql: string): SqliteStmt {
    let cache = this.__preparedCache.get(db);
    if (!cache) {
      cache = new Map();
      this.__preparedCache.set(db, cache);
    }
    const cached = cache.get(sql);
    if (cached) {
      cache.delete(sql);
      cache.set(sql, cached);
      return cached;
    }
    const stmt = db.prepare(sql);
    cache.set(sql, stmt);
    if (cache.size > STATEMENT_CACHE_SIZE) {
      // Evict the oldest. `Map.keys().next()` returns insertion order,
      // so the first key is the LRU candidate.
      const oldestKey = cache.keys().next().value as string | undefined;
      if (oldestKey !== undefined) {
        const oldest = cache.get(oldestKey);
        cache.delete(oldestKey);
        oldest?.finalize?.();
      }
    }
    return stmt;
  }

  /** Finalize and drop every cached statement for this connection. */
  private __dropCache(db: SqliteDb): void {
    const cache = this.__preparedCache.get(db);
    if (!cache) return;
    for (const stmt of cache.values()) {
      try {
        stmt.finalize?.();
      } catch {
        // Statement may already be invalidated by the DDL we're
        // responding to — ignore, the goal is to drop the reference.
      }
    }
    cache.clear();
  }

  /** Issues `BEGIN` on the single shared handle. */
  protected _beginTransaction(client: SqliteDb): void {
    client.exec('BEGIN');
  }

  /** Issues `COMMIT` on the single shared handle. */
  protected _commitTransaction(client: SqliteDb): void {
    client.exec('COMMIT');
  }

  /** Issues `ROLLBACK` on the single shared handle. */
  protected _rollbackTransaction(client: SqliteDb): void {
    client.exec('ROLLBACK');
  }

  /**
   * SQLite-friendly value encoding: `Date` → ISO string, `boolean` → 0/1,
   * non-buffer objects → JSON, `undefined` → `null`.
   */
  protected override _encodeValue(value: unknown): unknown {
    if (value === undefined) return null;
    if (value instanceof Date) {
      // An Invalid Date (`new Date('nope')`) has a NaN time; `toISOString()`
      // below throws a raw, contextless `RangeError: Invalid time value`. This
      // runs inside `_standardizeQuery` — OUTSIDE `execute()`'s try/catch — so
      // it would escape the `@throws {EngineError}` contract. Surface a typed
      // engine error instead (parity with the Postgres binary encoder).
      if (Number.isNaN(value.getTime())) {
        throw new EngineError('OPERATION_FAILED', {
          instanceId: this.instanceId,
          operation: 'encode Date parameter',
          reason: 'value is an Invalid Date',
        });
      }
      return value.toISOString();
    }
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (
      typeof value === 'object' &&
      value !== null &&
      !(value instanceof Uint8Array)
    ) {
      return JSON.stringify(value);
    }
    return value;
  }

  /**
   * Maps a SQLite result code onto the standard engine error codes, recovering
   * `constraint`/`column`/`table` from the driver's message text where it
   * names them.
   */
  protected override _wrapDriverError(
    error: unknown,
    query: EngineQuery,
  ): EngineError {
    if (error instanceof EngineError) return error;
    const e = error as { code?: string; message?: string } & Error;
    const message = e.message ?? String(error);
    const code = sqliteErrorToCode(e.code, message);
    const meta: Record<string, unknown> = {
      instanceId: this.instanceId,
      reason: message,
      sql: query.sql,
      driverCode: e.code,
      // Lift `constraint` / `column` / `table` out of the message via the
      // shared pure parser (same extraction the Turso engine reuses for parity).
      ...parseSqliteErrorMeta(message),
    };
    return new EngineError(code, meta as never, e);
  }

  //#endregion SQLEngine hooks
}

//#region Helpers

function _isSelect(sql: string): boolean {
  const t = sql.trimStart().slice(0, 8).toUpperCase();
  if (
    t.startsWith('SELECT') || t.startsWith('PRAGMA') ||
    t.startsWith('WITH ') || t.startsWith('EXPLAIN')
  ) {
    return true;
  }
  // INSERT/UPDATE/DELETE … RETURNING also produces rows. SQLite 3.35+
  // accepts RETURNING; we always emit it on INSERT/UPSERT, so the
  // driver has to read rows back via `all()` rather than `run()` —
  // otherwise the returning rows are silently discarded.
  const head = t.startsWith('INSERT') || t.startsWith('UPDATE') ||
    t.startsWith('DELETE');
  return head && /\bRETURNING\b/i.test(sql);
}
