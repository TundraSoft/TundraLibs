/**
 * @fileoverview Abstract bases for SQL-style engines (relational + document).
 *
 * Two classes live here, mirroring the pool-free / pooled split in
 * `ConnectionEngine.ts`:
 *
 * - {@link SQLConnectionEngine} is the **pool-free** SQL surface. It extends
 *   the pool-free `ConnectionEngine` root and adds every concern shared by
 *   relational / document drivers regardless of how they connect:
 *
 *   - Transaction lifecycle (begin/commit/rollback, idempotent, with timeout)
 *   - Reserved-client tracking
 *   - Named-parameter normalization (`:name:` → engine-native placeholder)
 *   - Per-value encoding hook (`_encodeValue`) so Date/boolean/JSON/etc. ride
 *     through the same code path on every dialect
 *   - Query execution timing and stats
 *   - Slow-query detection and event emission
 *   - Auto-rollback on query failure inside a transaction
 *
 *   Its body only ever touches the pool-free-safe resource seams
 *   (`_acquire` / `_release` / `_destroy` / `_validateResource`), so a driver
 *   with no driver-side socket pool — e.g. a future edge/serverless HTTP
 *   engine — extends this directly, implements `_open` / `_close` to establish
 *   a single `_resource`, and reuses the whole SQL surface without a pool.
 *
 * - {@link SQLEngine} is the **pooled** SQL engine (the class every concrete
 *   relational driver has always extended). It re-adds the socket
 *   `ConnectionPool` on top of `SQLConnectionEngine`, mirroring
 *   `PooledConnectionEngine`, so `PostgresEngine`, `MariaEngine`,
 *   `SQLiteEngine`, … keep pooled behaviour unchanged.
 *
 * Concrete drivers (Postgres, MariaDB, SQLite, …) implement the wire-level
 * `_execute`, `_beginTransaction`, `_commitTransaction`, `_rollbackTransaction`
 * methods plus the pool hooks (`_createResource` / `_destroyResource` /
 * `_ping`) for connection lifecycle.
 *
 * @module
 */

import type { EventOptionKeys } from '@tundralibs/utils/Options';
import type { AbstractTranslator } from '@tundralibs/oql/translator';
import type { Query } from '@tundralibs/oql/types';
import { ConnectionEngine } from './ConnectionEngine.ts';
import { ConnectionPool, type Waiter } from './ConnectionPool.ts';
import { EngineError } from './errors/mod.ts';
import {
  createEnginePool,
  poolConnect,
  poolDisconnect,
  type PooledHost,
  poolPing,
  poolStatsSnapshot,
} from './poolLifecycle.ts';
import type {
  EnginePoolStats,
  EngineQuery,
  EngineQueryResult,
  EngineQueryStats,
  EngineStats,
  EngineTransactionOptions,
  EngineTransactionStatus,
  SQLDialect,
  SQLEngineCapabilities,
  SQLEngineEvents,
  SQLEngineOptions,
  TransactionScope,
} from './types/mod.ts';

/** Default option values applied by the SQL engines on top of `ConnectionEngine` defaults. */
const SQL_DEFAULTS: Partial<SQLEngineOptions> = {
  slowQueryThreshold: 0.5,
  transactionTimeout: 120,
  autoRollbackOnFailure: true,
};

/** Internal record for a tracked transaction. */
type TxRecord<T> = {
  client: T;
  state: EngineTransactionStatus;
  timer: ReturnType<typeof setTimeout> | null;
  /** Active savepoints on this transaction, innermost last. A failed
   * statement rolls back to the innermost one instead of the whole tx. */
  savepoints: string[];
  /** Per-transaction monotonic counter for savepoint names. */
  spCounter: number;
  /** True while a wire operation is in flight on this transaction's
   * single reserved connection. A transaction cannot multiplex statements,
   * so a second overlapping op (e.g. `Promise.all` of two `tx.execute`s) is
   * refused rather than allowed to corrupt the protocol or release the
   * client mid-flight. */
  busy: boolean;
};

/**
 * Abstract **pool-free** base for SQL-style driver engines.
 *
 * Extends the pool-free `ConnectionEngine` root with the full SQL surface
 * (transactions, query execution + stats, OQL translation, query
 * standardization). It touches only the pool-free-safe resource seams
 * (`_acquire` / `_release` / `_destroy` / `_validateResource`), so an engine
 * that manages its own connection — e.g. an edge/serverless HTTP driver —
 * extends this, implements `_open` / `_close` to establish a single
 * {@link ConnectionEngine._resource}, and reuses everything here with no
 * socket pool. {@link SQLEngine} layers the pool back on for the concrete
 * relational drivers.
 *
 * @template T - Native client / connection resource type.
 * @template O - Engine-specific options, extends `SQLEngineOptions`.
 * @template E - Engine-specific events, extends `SQLEngineEvents`.
 */
export abstract class SQLConnectionEngine<
  T = unknown,
  O extends SQLEngineOptions = SQLEngineOptions,
  E extends SQLEngineEvents = SQLEngineEvents,
> extends ConnectionEngine<T, O, E> {
  /** Capabilities — must include transaction/preparedStatements declarations. */
  public abstract override readonly Capabilities: SQLEngineCapabilities;

  /**
   * The SQL dialect family this engine emits, taken from its translator.
   * Consumers key dialect-specific behaviour (migration plan artifacts,
   * DDL) on this rather than the concrete engine class — so an alias
   * engine that reuses a base translator (e.g. `CockroachEngine` over the
   * Postgres translator) reports its base family automatically, while
   * still carrying its own {@link Engine} identity and capabilities.
   */
  public get Dialect(): SQLDialect {
    // SQLEngine subclasses only ever use the postgres/maria/sqlite
    // translators, whose `Dialect` is one of SQLDialect by construction.
    return this._translator.Dialect as SQLDialect;
  }

  //#region Internal state

  /**
   * Transaction registry. One entry per `transactionId`, holding the
   * reserved client, lifecycle state, and the auto-timeout timer.
   * Replaces the three separate maps in earlier versions.
   */
  protected _transactions: Map<string, TxRecord<T>> = new Map();

  /** Aggregate query stats. */
  protected _queryStats: EngineQueryStats = {
    totalQueries: 0,
    successfulQueries: 0,
    failedQueries: 0,
    slowQueries: 0,
    averageExecutionTimeMs: 0,
  };

  /** Cached slow-query threshold in ms — read once, used per query.
   * Assigned in the constructor from `slowQueryThreshold`. */
  protected _slowThresholdMs!: number;
  /** Cached auto-rollback flag — read once, used per query.
   * Assigned in the constructor from `autoRollbackOnFailure`. */
  protected _autoRollback!: boolean;

  //#endregion Internal state

  /**
   * Layers the SQL defaults (`slowQueryThreshold`, `transactionTimeout`,
   * `autoRollbackOnFailure`) under the subclass defaults and caches the first
   * two as ms/boolean so the per-query path avoids repeated option lookups.
   *
   * @param name - Connection name.
   * @param options - Engine options + event handlers.
   * @param defaults - Subclass-supplied defaults (caller options win).
   *
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` when an option fails
   *   validation in {@link SQLConnectionEngine._processOption}
   */
  constructor(
    name: string,
    options?: EventOptionKeys<O, E>,
    defaults?: Partial<O>,
  ) {
    super(name, options, { ...SQL_DEFAULTS, ...defaults } as Partial<O>);
    this._slowThresholdMs = (this._getOption('slowQueryThreshold') ?? 0.5) *
      1000;
    this._autoRollback = this._getOption('autoRollbackOnFailure') !== false;
  }

  //#region Public API

  /** Snapshot of query statistics. */
  public get queryStats(): EngineQueryStats {
    return { ...this._queryStats };
  }

  /** Combined pool + query statistics. */
  public get stats(): EngineStats {
    return {
      pool: this.poolStats,
      query: this.queryStats,
    };
  }

  /**
   * Execute a single query.
   *
   * If `query.transactionId` is set, the query runs on the client reserved
   * for that transaction. Otherwise a connection is acquired from the
   * pool just for this call.
   *
   * On a non-transaction failure the connection is validated before it is
   * returned to the pool; if it no longer validates (a transport error left
   * it dead) it is destroyed rather than recycled, so a poisoned connection
   * cannot be handed to the next query. Ordinary query errors (the socket is
   * still alive) leave the connection reusable.
   *
   * @template R - Expected row shape.
   * @returns Query result with rows, count, timing, and metadata.
   *
   * @throws {EngineError} `TRANSACTION_NOT_FOUND` if `transactionId` is set
   *   but no such transaction exists.
   * @throws {EngineError} `MISSING_PARAMETERS` if a `:name:` placeholder
   *   has no matching `params` entry.
   * @throws {EngineError} `QUERY_EXECUTION_FAILED` (or a more specific
   *   code) on driver error.
   *
   * @emits query - For every successful execution.
   * @emits slowQuery - When `time > slowQueryThreshold * 1000`.
   */
  public async execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(query: EngineQuery): Promise<EngineQueryResult<R>> {
    if (this._status !== 'READY') await this.connect();
    const standardized = this._standardizeQuery(query);

    let client: T;
    let releaseAfter = false;
    let txTurn: TxRecord<T> | undefined;

    if (standardized.transactionId) {
      const tx = this._transactions.get(standardized.transactionId);
      if (!tx) {
        throw new EngineError('TRANSACTION_NOT_FOUND', {
          instanceId: this.instanceId,
          transactionId: standardized.transactionId,
        });
      }
      // Refuse concurrent queries on a transaction that is mid-commit or
      // mid-rollback. Without this gate, a query in flight while
      // commitTransaction is awaiting the server would run on the same
      // client and the driver would protocol-error.
      if (tx.state !== 'ACTIVE') {
        throw new EngineError('TRANSACTION_NOT_FOUND', {
          instanceId: this.instanceId,
          transactionId: standardized.transactionId,
        });
      }
      // Claim the transaction's single connection for this one statement.
      // Overlapping statements on the same tx would protocol-error and could
      // release the shared client while a sibling is still awaiting it.
      this.#claimTxConnection(tx, standardized.transactionId);
      txTurn = tx;
      client = tx.client;
    } else {
      client = await this._acquire();
      releaseAfter = true;
    }

    const id = this._idGenerator('query');
    const startTime = performance.now();
    let failed = false;

    try {
      const raw = await this._execute<R>(standardized, client);
      return this._finishQuery<R>(
        id,
        standardized,
        raw,
        startTime,
        this._slowThresholdMs,
        standardized.transactionId,
      );
    } catch (e) {
      failed = true;
      this._recordQueryStats(performance.now() - startTime, false, false);
      const wrapped = this._wrapDriverError(e, standardized);
      if (standardized.transactionId && this._autoRollback) {
        const tx = this._transactions.get(standardized.transactionId);
        const savepoint = tx?.savepoints[tx.savepoints.length - 1];
        if (tx && tx.state === 'ACTIVE' && savepoint !== undefined) {
          // Inside a savepoint: undo only to it, keeping the transaction
          // (and any outer savepoints) alive. Also clears the aborted-tx
          // state a failed statement leaves on Postgres, so the caller
          // can recover and carry on the outer tx.
          try {
            await this._execute(
              { sql: `ROLLBACK TO SAVEPOINT ${savepoint}` },
              tx.client,
            );
          } catch {
            // The savepoint is gone (e.g. a MariaDB deadlock rolled back
            // the WHOLE tx and destroyed every savepoint). Fall back to a
            // full rollback so the in-memory state can never claim
            // savepoints the database has already discarded — and the
            // caller gets a clean TRANSACTION_NOT_FOUND, not a zombie tx.
            try {
              await this.rollbackTransaction(standardized.transactionId);
            } catch {
              /* swallow — already in error path */
            }
          }
        } else {
          try {
            await this.rollbackTransaction(standardized.transactionId);
          } catch {
            /* swallow — already in error path */
          }
        }
      }
      throw wrapped;
    } finally {
      if (txTurn) txTurn.busy = false;
      if (releaseAfter) {
        // A clean result leaves the connection reusable — release it. After a
        // failure the connection may have died mid-flight (transport reset,
        // server-side close); only return it to the pool if it still
        // validates, otherwise destroy it so a poisoned connection is never
        // recycled. Validation runs only on the (rare) error path, so healthy
        // queries pay nothing and engines with a costly probe (e.g. Maria's
        // ping) aren't hit on every release.
        if (!failed || await this._validateResource(client)) {
          this._release(client);
        } else {
          await this._destroy(client);
        }
      }
    }
  }

  /**
   * Execute multiple queries sequentially. Halts on the first error.
   *
   * Pass a `transactionId` on each query to run them inside a transaction;
   * otherwise each query runs standalone.
   */
  public async batchExecute(queries: EngineQuery[]): Promise<void> {
    for (const q of queries) {
      await this.execute(q);
    }
  }

  /**
   * Begin a new transaction.
   *
   * Reserves a client from the pool and runs BEGIN / START TRANSACTION on
   * it. The client is held until commit or rollback. A timeout is
   * automatically armed (default `transactionTimeout`) and triggers an
   * auto-rollback.
   *
   * @returns Transaction id (use as `transactionId` on subsequent queries).
   *
   * @throws {EngineError} `UNSUPPORTED_OPERATION` if the engine does not
   *   support transactions.
   * @throws {EngineError} `TRANSACTION_OPERATION_ERROR` on BEGIN failure.
   *
   * @emits transactionBegin
   *
   * @internal Prefer the callback form `transaction(fn)`, which
   * guarantees the connection is committed/rolled-back and released.
   */
  public async beginTransaction(
    options?: EngineTransactionOptions,
  ): Promise<string> {
    if (!this.Capabilities.transactions) {
      throw new EngineError('UNSUPPORTED_OPERATION', {
        instanceId: this.instanceId,
        operation: 'transactions',
      });
    }
    if (this._status !== 'READY') await this.connect();
    const id = options?.name ?? this._idGenerator('tx');
    if (this._transactions.has(id)) {
      throw new EngineError('TRANSACTION_OPERATION_ERROR', {
        instanceId: this.instanceId,
        transactionId: id,
        operation: 'beginTransaction',
        reason: `Transaction "${id}" already exists`,
      });
    }
    const client = await this._acquire();
    try {
      await this._beginTransaction(client, id);
    } catch (e) {
      this._release(client);
      throw e instanceof EngineError ? e : new EngineError(
        'TRANSACTION_OPERATION_ERROR',
        {
          instanceId: this.instanceId,
          transactionId: id,
          operation: 'beginTransaction',
        },
        e as Error,
      );
    }
    const record: TxRecord<T> = {
      client,
      state: 'ACTIVE',
      timer: null,
      savepoints: [],
      spCounter: 0,
      busy: false,
    };
    this._transactions.set(id, record);
    this.__armTransactionTimeout(id, record, options?.timeout);
    this._emitRaw('transactionBegin', this.instanceId, id);
    return id;
  }

  /**
   * Commit a transaction. Idempotent — silently returns if the transaction
   * has already ended (committed, rolled back, timed out, or never started).
   *
   * @emits transactionCommit
   *
   * @internal Prefer the callback form `transaction(fn)`.
   */
  public async commitTransaction(transactionId: string): Promise<void> {
    if (!this.Capabilities.transactions) {
      throw new EngineError('UNSUPPORTED_OPERATION', {
        instanceId: this.instanceId,
        operation: 'transactions',
      });
    }
    const tx = this._transactions.get(transactionId);
    if (!tx || tx.state !== 'ACTIVE') return;

    // Flip to the intermediate state BEFORE the await so a concurrent
    // execute() with this transactionId is refused while the commit is
    // in flight. Otherwise the registry still reads ACTIVE during the
    // await and a query lands on the same client mid-commit.
    tx.state = 'COMMITTING';
    if (tx.timer) clearTimeout(tx.timer);
    try {
      await this._commitTransaction(tx.client, transactionId);
      tx.state = 'COMMITTED';
      this._emitRaw('transactionCommit', this.instanceId, transactionId);
    } catch (e) {
      throw e instanceof EngineError ? e : new EngineError(
        'TRANSACTION_OPERATION_ERROR',
        {
          instanceId: this.instanceId,
          transactionId,
          operation: 'commitTransaction',
        },
        e as Error,
      );
    } finally {
      this.__releaseTransactionClient(transactionId);
    }
  }

  /**
   * Rollback a transaction. Idempotent — silently returns if the transaction
   * has already ended.
   *
   * @emits transactionRollback
   *
   * @internal Prefer the callback form `transaction(fn)`.
   */
  public async rollbackTransaction(transactionId: string): Promise<void> {
    if (!this.Capabilities.transactions) {
      throw new EngineError('UNSUPPORTED_OPERATION', {
        instanceId: this.instanceId,
        operation: 'transactions',
      });
    }
    const tx = this._transactions.get(transactionId);
    if (!tx || tx.state !== 'ACTIVE') return;

    // See `commitTransaction` for why the state transition happens
    // before the await — refuses concurrent queries on a transaction
    // that is mid-rollback.
    tx.state = 'ROLLING_BACK';
    if (tx.timer) clearTimeout(tx.timer);
    // If ROLLBACK itself throws the client is in an unknown state — the
    // transaction may still be open on the wire and the socket may be
    // half-broken. Returning it to the idle pool would hand a poisoned
    // connection to the next acquirer, so destroy it instead of releasing.
    let rollbackFailed = false;
    try {
      await this._rollbackTransaction(tx.client, transactionId);
      tx.state = 'ROLLBACK';
      this._emitRaw('transactionRollback', this.instanceId, transactionId);
    } catch (e) {
      rollbackFailed = true;
      throw e instanceof EngineError ? e : new EngineError(
        'TRANSACTION_OPERATION_ERROR',
        {
          instanceId: this.instanceId,
          transactionId,
          operation: 'rollbackTransaction',
        },
        e as Error,
      );
    } finally {
      this.__releaseTransactionClient(transactionId, rollbackFailed);
    }
  }

  /**
   * Open a `SAVEPOINT` on an active transaction and return its
   * (engine-generated) name. While it is on the stack, a statement
   * failure inside the transaction rolls back only to the innermost
   * savepoint — not the whole transaction — when
   * `autoRollbackOnFailure` is on. Nest freely; release or roll back in
   * LIFO order.
   *
   * @throws {EngineError} `TRANSACTION_NOT_FOUND` if no active
   *   transaction has `transactionId`.
   *
   * @internal Prefer nesting the callback form `tx.transaction(fn)`,
   * which opens and releases the savepoint for you.
   */
  public async createSavepoint(transactionId: string): Promise<string> {
    const tx = this.__requireActiveTx(transactionId);
    const name = `sp_${++tx.spCounter}`;
    await this.#onTxConnection(
      tx,
      transactionId,
      () => this._execute({ sql: `SAVEPOINT ${name}` }, tx.client),
    );
    tx.savepoints.push(name);
    return name;
  }

  /**
   * `RELEASE` a savepoint — folds its work into the surrounding
   * transaction/savepoint and drops it (and anything nested inside it)
   * from the stack.
   *
   * @throws {EngineError} `TRANSACTION_NOT_FOUND` if the transaction is
   *   no longer active.
   *
   * @internal Prefer nesting the callback form `tx.transaction(fn)`.
   */
  public async releaseSavepoint(
    transactionId: string,
    name: string,
  ): Promise<void> {
    const tx = this.__requireActiveTx(transactionId);
    try {
      await this.#onTxConnection(
        tx,
        transactionId,
        () => this._execute({ sql: `RELEASE SAVEPOINT ${name}` }, tx.client),
      );
    } finally {
      // Drop it from the stack whether or not the RELEASE reached the
      // server — the caller is done with this savepoint's block either
      // way, so the in-memory stack must not keep claiming a savepoint
      // the DB may have already discarded (which would misdirect a
      // later auto-rollback).
      const idx = tx.savepoints.lastIndexOf(name);
      if (idx >= 0) tx.savepoints.length = idx;
    }
  }

  /**
   * `ROLLBACK TO` a savepoint — undoes everything since it while
   * keeping the transaction (and outer savepoints) alive. The savepoint
   * itself stays defined (call {@link releaseSavepoint} to drop it);
   * any savepoints nested inside it are discarded.
   *
   * @throws {EngineError} `TRANSACTION_NOT_FOUND` if the transaction is
   *   no longer active.
   *
   * @internal Prefer nesting the callback form `tx.transaction(fn)`.
   */
  public async rollbackToSavepoint(
    transactionId: string,
    name: string,
  ): Promise<void> {
    const tx = this.__requireActiveTx(transactionId);
    try {
      await this.#onTxConnection(
        tx,
        transactionId,
        () =>
          this._execute({ sql: `ROLLBACK TO SAVEPOINT ${name}` }, tx.client),
      );
    } finally {
      // Discard any nested savepoints (rolled back with this one),
      // keeping the target itself — whether or not the statement
      // reached the server, so the stack cannot drift ahead of the DB.
      const idx = tx.savepoints.lastIndexOf(name);
      if (idx >= 0) tx.savepoints.length = idx + 1;
    }
  }

  /** Fetch a transaction that must be ACTIVE, or throw. */
  private __requireActiveTx(transactionId: string): TxRecord<T> {
    const tx = this._transactions.get(transactionId);
    if (!tx || tx.state !== 'ACTIVE') {
      throw new EngineError('TRANSACTION_NOT_FOUND', {
        instanceId: this.instanceId,
        transactionId,
      });
    }
    return tx;
  }

  /**
   * Claim a transaction's single reserved connection for one wire op. A
   * transaction is bound to one connection that cannot multiplex, so an
   * overlapping op — e.g. `Promise.all([tx.execute(a), tx.execute(b)])` —
   * is refused rather than allowed to interleave on the socket (protocol
   * corruption) or release the shared client while a sibling is in flight.
   * The caller must clear `busy` in a `finally`.
   */
  #claimTxConnection(tx: TxRecord<T>, transactionId: string): void {
    if (tx.busy) {
      throw new EngineError('TRANSACTION_OPERATION_ERROR', {
        instanceId: this.instanceId,
        transactionId,
        operation: 'execute',
        reason:
          'Concurrent statement on a transaction — a transaction is bound ' +
          'to a single connection and cannot run statements in parallel. ' +
          'Await each statement in turn (do not `Promise.all` a tx scope).',
      });
    }
    tx.busy = true;
  }

  /** Run one wire op on a transaction's connection under the single-in-flight
   * guard, always clearing `busy` afterwards. */
  async #onTxConnection<R>(
    tx: TxRecord<T>,
    transactionId: string,
    op: () => Promise<R>,
  ): Promise<R> {
    this.#claimTxConnection(tx, transactionId);
    try {
      return await op();
    } finally {
      tx.busy = false;
    }
  }

  /**
   * Best-effort rollback of every active transaction. Errors are swallowed.
   * Useful during graceful shutdown.
   */
  public async rollbackAllTransactions(): Promise<void> {
    for (const id of Array.from(this._transactions.keys())) {
      try {
        await this.rollbackTransaction(id);
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * Run `fn` inside a transaction and manage its lifecycle: the
   * connection is reserved on entry and released on exit — COMMIT if
   * `fn` resolves, ROLLBACK if it throws — so it can never leak from the
   * pool. Returns whatever `fn` returns.
   *
   * Nest with the scope's own `transaction()` to open a `SAVEPOINT`
   * (see {@link TransactionScope}). This is the recommended way to use
   * transactions; the id-based `beginTransaction` / `commitTransaction`
   * / `rollbackTransaction` primitives are internal.
   *
   * @example
   * ```ts
   * import { PostgresEngine } from '@tundralibs/drivers/postgres';
   *
   * const engine = new PostgresEngine('app', {
   *   host: 'localhost',
   *   database: 'app',
   * });
   *
   * const rows = await engine.transaction(async (tx) => {
   *   await tx.execute({ sql: 'INSERT INTO users ...' });
   *   return await tx.execute({ sql: 'SELECT * FROM users' });
   * });
   * ```
   */
  public transaction<T>(
    fn: (tx: TransactionScope) => Promise<T>,
    options?: EngineTransactionOptions,
  ): Promise<T>;
  /**
   * @internal Manual transaction handle — prefer the callback form
   * `transaction(fn)`, which guarantees the connection is released.
   * Retained for the norm executor seam, which manages the lifecycle
   * itself.
   */
  public transaction(options?: EngineTransactionOptions): Promise<{
    id: string;
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    execute: <R extends Record<string, unknown> = Record<string, unknown>>(
      q: EngineQuery,
    ) => Promise<EngineQueryResult<R>>;
  }>;
  public transaction<T>(
    arg1?:
      | ((tx: TransactionScope) => Promise<T>)
      | EngineTransactionOptions,
    arg2?: EngineTransactionOptions,
  ): Promise<unknown> {
    if (typeof arg1 === 'function') {
      return this.#runInTransaction(arg1, arg2);
    }
    return this.#transactionHandle(arg1);
  }

  /** The manual-handle body (the `@internal` overload). */
  async #transactionHandle(options?: EngineTransactionOptions) {
    const id = await this.beginTransaction(options);
    return {
      id,
      commit: () => this.commitTransaction(id),
      rollback: () => this.rollbackTransaction(id),
      execute: <R extends Record<string, unknown> = Record<string, unknown>>(
        q: EngineQuery,
      ) => this.execute<R>({ ...q, transactionId: id }),
    };
  }

  /** Callback transaction: BEGIN → fn → COMMIT/ROLLBACK, always
   * releasing the connection. */
  async #runInTransaction<T>(
    fn: (tx: TransactionScope) => Promise<T>,
    options?: EngineTransactionOptions,
  ): Promise<T> {
    const id = await this.beginTransaction(options);
    let result: T;
    try {
      result = await fn(this.#scope(id));
    } catch (err) {
      // Roll back on any failure; a rollback error must not mask the
      // caller's original error.
      try {
        await this.rollbackTransaction(id);
      } catch { /* swallow — surfacing the original error matters more */ }
      throw err;
    }
    // The callback may have swallowed a statement error that already
    // auto-rolled-back the whole transaction (a top-level failure with no
    // savepoint on the stack ends the tx). If so the record is gone and a
    // commit would be a silent no-op that reports a false success — surface
    // it instead, so a resolved promise always means the work committed.
    const tx = this._transactions.get(id);
    if (!tx || tx.state !== 'ACTIVE') {
      throw new EngineError('TRANSACTION_OPERATION_ERROR', {
        instanceId: this.instanceId,
        transactionId: id,
        operation: 'commitTransaction',
        reason:
          'Transaction was already rolled back by a failed statement before ' +
          'commit — the callback appears to have swallowed the error. Use a ' +
          'nested `tx.transaction()` savepoint to recover from a statement ' +
          'failure and keep the outer transaction alive.',
      });
    }
    // Commit failure surfaces as-is (commitTransaction already releases
    // the client in its finally).
    await this.commitTransaction(id);
    return result;
  }

  /** Callback savepoint: SAVEPOINT → fn → RELEASE / ROLLBACK-TO+RELEASE.
   * The engine's savepoint-aware auto-rollback already unwinds a failed
   * SQL statement to `name`, so on a JS throw this is what unwinds it. */
  async #runInSavepoint<T>(
    txId: string,
    fn: (tx: TransactionScope) => Promise<T>,
  ): Promise<T> {
    const name = await this.createSavepoint(txId);
    let result: T;
    try {
      result = await fn(this.#scope(txId));
    } catch (err) {
      try {
        await this.rollbackToSavepoint(txId, name);
      } catch { /* the engine may have already unwound it */ }
      await this.#safeReleaseSavepoint(txId, name);
      throw err;
    }
    // Swallow a RELEASE failure on the success path too: the nested block's
    // statements are already folded into the transaction, so the pending
    // outer commit/rollback drops the savepoint regardless. A benign RELEASE
    // hiccup must never turn a fully successful block into a thrown error
    // (which would escalate to rolling back the entire outer transaction).
    await this.#safeReleaseSavepoint(txId, name);
    return result;
  }

  /** RELEASE a savepoint, swallowing any failure — the pending outer
   * commit/rollback folds/drops it regardless, so a cleanup hiccup here can
   * never turn a succeeded block into a throw. */
  async #safeReleaseSavepoint(txId: string, name: string): Promise<void> {
    try {
      await this.releaseSavepoint(txId, name);
    } catch { /* benign — released by the outer commit/rollback */ }
  }

  /** A {@link TransactionScope} bound to `id` — `execute` runs on the
   * transaction's connection, `transaction` opens a nested savepoint. */
  #scope(id: string): TransactionScope {
    // Pin the scope to the exact transaction instance it was opened for.
    // A scope leaked past its callback must fail closed — with a generated
    // id the record is simply gone, but with a reused `options.name` the id
    // could resolve to a DIFFERENT, later transaction, so identity (not just
    // presence) is what makes a stale scope safe.
    const record = this._transactions.get(id);
    const assertLive = () => {
      if (this._transactions.get(id) !== record) {
        throw new EngineError('TRANSACTION_NOT_FOUND', {
          instanceId: this.instanceId,
          transactionId: id,
        });
      }
    };
    return {
      id,
      // `async` so a stale-scope rejection surfaces as a rejected promise
      // (not a synchronous throw) — the busy claim still happens on the
      // synchronous call because `this.execute` is invoked before any await.
      execute: async <
        R extends Record<string, unknown> = Record<string, unknown>,
      >(
        q: EngineQuery,
      ): Promise<EngineQueryResult<R>> => {
        assertLive();
        return await this.execute<R>({ ...q, transactionId: id });
      },
      transaction: async <T>(
        fn: (tx: TransactionScope) => Promise<T>,
      ): Promise<T> => {
        assertLive();
        return await this.#runInSavepoint(id, fn);
      },
    };
  }

  //#endregion Public API

  //#region OQL surface — translate then execute

  /**
   * Run a `SELECT` Query through the dialect translator and execute it.
   * `R` is the row shape; result rows come back as `R[]`.
   */
  public select<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'SELECT'>,
    transactionId?: string,
  ): Promise<EngineQueryResult<R>> {
    return this.execute<R>({ ...this._translator.select(q), transactionId });
  }

  /**
   * Run an `INSERT` Query. Postgres / SQLite emit RETURNING and surface the
   * inserted rows in `data`. MariaDB also emits RETURNING (10.5+).
   */
  public insert<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'INSERT'>,
    transactionId?: string,
  ): Promise<EngineQueryResult<R>> {
    return this.execute<R>({ ...this._translator.insert(q), transactionId });
  }

  /**
   * Run an `INSERT … SELECT` Query. The translator produces a single
   * statement that copies rows from a SELECT into the target table.
   */
  public insertQuery<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    q: Query<'INSERT_FROM_QUERY'>,
    transactionId?: string,
  ): Promise<EngineQueryResult<R>> {
    return this.execute<R>({
      ...this._translator.insertQuery(q),
      transactionId,
    });
  }

  /**
   * Run an `UPDATE` Query. No RETURNING is ever emitted on UPDATE — `data`
   * is `[]` and `count` carries the affected-row count.
   */
  public update<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'UPDATE'>,
    transactionId?: string,
  ): Promise<EngineQueryResult<R>> {
    return this.execute<R>({ ...this._translator.update(q), transactionId });
  }

  /** Run a `DELETE` Query. Same `data: []` / `count: affected` shape as UPDATE. */
  public delete<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'DELETE'>,
    transactionId?: string,
  ): Promise<EngineQueryResult<R>> {
    return this.execute<R>({ ...this._translator.delete(q), transactionId });
  }

  /** Run an `UPSERT` Query. RETURNING is emitted on every dialect that supports it. */
  public upsert<R extends Record<string, unknown> = Record<string, unknown>>(
    q: Query<'UPSERT'>,
    transactionId?: string,
  ): Promise<EngineQueryResult<R>> {
    return this.execute<R>({ ...this._translator.upsert(q), transactionId });
  }

  /** Run a `COUNT` Query. Returns one row of shape `{ Count: number }`. */
  public async count(
    q: Query<'COUNT'>,
    transactionId?: string,
  ): Promise<EngineQueryResult<{ Count: number }>> {
    // OQL's COUNT rewrite projects exactly one aggregate column under an
    // internal alias (`__count__`); normalise that single value to the public
    // `{ Count }` shape (MongoEngine.count normalises its own paths to the
    // same shape).
    const result = await this.execute<Record<string, unknown>>({
      ...this._translator.count(q),
      transactionId,
    });
    const row = result.data[0];
    return {
      ...result,
      data: [{ Count: row ? Number(Object.values(row)[0] ?? 0) : 0 }],
    };
  }

  /**
   * Run a `CREATE_TABLE` Query. The translator may return >1 statement
   * (MariaDB/Postgres emit indexes and constraints inline; some dialects
   * split). Statements run sequentially in a transaction so a partial
   * failure rolls back. Pass `transactionId` to share an outer tx.
   *
   * Caveat: on engines with `Capabilities.transactions === false` (the
   * one-shot HTTP edge engines — NeonHttpEngine, TursoEngine), there is no
   * auto-tx wrapper: the statements run standalone and a partial failure does
   * NOT roll back the statements that already succeeded.
   */
  public createTable(
    q: Query<'CREATE_TABLE'>,
    transactionId?: string,
  ): Promise<EngineQueryResult[]> {
    return this.__runMany(this._translator.createTable(q), transactionId);
  }

  /**
   * Run an `ALTER_TABLE` Query (multi-statement on every dialect). Statements
   * run sequentially in a transaction so a partial failure rolls back.
   *
   * Caveat: on engines with `Capabilities.transactions === false` (the
   * one-shot HTTP edge engines — NeonHttpEngine, TursoEngine), there is no
   * auto-tx wrapper: the statements run standalone and a partial failure does
   * NOT roll back the statements that already succeeded.
   */
  public alterTable(
    q: Query<'ALTER_TABLE'>,
    transactionId?: string,
  ): Promise<EngineQueryResult[]> {
    return this.__runMany(this._translator.alterTable(q), transactionId);
  }

  /** Run a `DROP_TABLE` Query. */
  public dropTable(
    q: Query<'DROP_TABLE'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    return this.execute({ ...this._translator.dropTable(q), transactionId });
  }

  /** Run a `TRUNCATE` Query. SQLite emulates as `DELETE FROM`. */
  public truncate(
    q: Query<'TRUNCATE'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    return this.execute({ ...this._translator.truncate(q), transactionId });
  }

  /** Run a `CREATE_INDEX` Query. */
  public createIndex(
    q: Query<'CREATE_INDEX'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    return this.execute({ ...this._translator.createIndex(q), transactionId });
  }

  /** Run a `DROP_INDEX` Query. */
  public dropIndex(
    q: Query<'DROP_INDEX'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    return this.execute({ ...this._translator.dropIndex(q), transactionId });
  }

  /**
   * Run a `CREATE_VIEW` Query. On dialects without materialized views
   * (SQLite, MariaDB), `materialized: true` silently falls back to a
   * regular view.
   */
  public createView(
    q: Query<'CREATE_VIEW'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    return this.execute({ ...this._translator.createView(q), transactionId });
  }

  /** Run a `DROP_VIEW` Query. */
  public dropView(
    q: Query<'DROP_VIEW'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    return this.execute({ ...this._translator.dropView(q), transactionId });
  }

  /**
   * Run an `ALTER_VIEW` Query (multi-statement on dialects that lack
   * `ALTER VIEW`). Statements run sequentially in a transaction so a partial
   * failure rolls back.
   *
   * Caveat: on engines with `Capabilities.transactions === false` (the
   * one-shot HTTP edge engines — NeonHttpEngine, TursoEngine), there is no
   * auto-tx wrapper: the statements run standalone and a partial failure does
   * NOT roll back the statements that already succeeded.
   */
  public alterView(
    q: Query<'ALTER_VIEW'>,
    transactionId?: string,
  ): Promise<EngineQueryResult[]> {
    return this.__runMany(this._translator.alterView(q), transactionId);
  }

  /**
   * Run a `REFRESH_MATERIALIZED_VIEW` Query. On dialects without
   * materialized views, this emits the no-op `SELECT 1`.
   */
  public refreshMaterializedView(
    q: Query<'REFRESH_MATERIALIZED_VIEW'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    return this.execute({
      ...this._translator.refreshMaterializedView(q),
      transactionId,
    });
  }

  /**
   * Run a `CREATE_SCHEMA` Query. SQLite emulates via per-schema `.db`
   * files + `ATTACH DATABASE`; on SQLite the statement cannot run inside
   * a caller-supplied transaction.
   */
  public async createSchema(
    q: Query<'CREATE_SCHEMA'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    const translated = this._translator.createSchema(q);
    this.__refuseTxIfUnsafe(translated.sql, transactionId, 'createSchema');
    return await this.execute({ ...translated, transactionId });
  }

  /** Run a `DROP_SCHEMA` Query. */
  public async dropSchema(
    q: Query<'DROP_SCHEMA'>,
    transactionId?: string,
  ): Promise<EngineQueryResult> {
    const translated = this._translator.dropSchema(q);
    this.__refuseTxIfUnsafe(translated.sql, transactionId, 'dropSchema');
    return await this.execute({ ...translated, transactionId });
  }

  /**
   * Guard for the single-statement DDL helpers: rejects a caller-supplied
   * `transactionId` when the dialect cannot run `sql` inside a transaction,
   * so the caller gets a clear error instead of a driver-level one.
   *
   * @throws {@link EngineError} `UNSUPPORTED_OPERATION` when both conditions hold.
   */
  private __refuseTxIfUnsafe(
    sql: string,
    transactionId: string | undefined,
    operation: string,
  ): void {
    if (transactionId && !this._canRunInTransaction(sql)) {
      throw new EngineError('UNSUPPORTED_OPERATION', {
        instanceId: this.instanceId,
        operation:
          `${operation} on this dialect cannot run inside a caller-supplied transaction`,
      });
    }
  }

  /**
   * Execute a translator-emitted multi-statement DDL list. Default
   * behaviour wraps in a transaction so partial failure rolls back; if
   * `outerTxId` is supplied we run inside it instead of opening a new
   * one.
   *
   * If any statement in the list returns `false` from
   * {@link _canRunInTransaction} (e.g. SQLite `ATTACH`/`DETACH`), the
   * auto-tx wrapper is skipped and statements run sequentially on
   * pool-acquired clients. We refuse outright when an `outerTxId` is
   * supplied — running these statements inside a user-supplied tx would
   * fail at the driver layer with a less obvious error.
   *
   * The auto-tx wrapper is likewise skipped on engines with
   * `Capabilities.transactions === false` (the one-shot HTTP edge engines —
   * NeonHttpEngine, TursoEngine), whose `beginTransaction()` rejects. On those
   * engines the statements run standalone and a partial failure does NOT roll
   * back the statements that already succeeded — there is no atomicity.
   */
  private async __runMany(
    stmts: ReadonlyArray<{ sql: string; params: Record<string, unknown> }>,
    outerTxId?: string,
  ): Promise<EngineQueryResult[]> {
    const hasNonTxSafe = stmts.some((s) => !this._canRunInTransaction(s.sql));
    // Engines that declare no transaction support at all (the one-shot HTTP
    // edge engines — Neon, Turso) cannot open the auto-tx wrapper below:
    // `beginTransaction()` rejects with UNSUPPORTED_OPERATION before any
    // statement runs, so `createTable`/`alterTable`/`alterView` would throw and
    // never execute. Run their statements sequentially with no transaction,
    // exactly as single-statement DDL and raw `execute()` already do there.
    // Transactional engines (Postgres/MariaDB/SQLite, `transactions: true`) are
    // unaffected and keep the atomic auto-tx wrapper.
    const noTxCapability = this.Capabilities.transactions === false;
    if (hasNonTxSafe || noTxCapability) {
      if (outerTxId) {
        throw new EngineError('UNSUPPORTED_OPERATION', {
          instanceId: this.instanceId,
          operation: hasNonTxSafe
            ? 'Multi-statement DDL containing ATTACH/DETACH (or similar) ' +
              'cannot run inside a caller-supplied transaction'
            : 'Multi-statement DDL cannot run inside a caller-supplied ' +
              'transaction on an engine without transaction support',
        });
      }
      // No transactional rollback — these statements are either inherently
      // non-atomic on the dialect that flagged them, or run on an engine with
      // no transaction support at all.
      const results: EngineQueryResult[] = [];
      for (const stmt of stmts) {
        results.push(await this.execute(stmt));
      }
      return results;
    }

    const owned = !outerTxId;
    const txId = outerTxId ?? await this.beginTransaction();
    try {
      const results: EngineQueryResult[] = [];
      for (const stmt of stmts) {
        results.push(await this.execute({ ...stmt, transactionId: txId }));
      }
      if (owned) await this.commitTransaction(txId);
      return results;
    } catch (e) {
      if (owned) await this.rollbackTransaction(txId);
      throw e;
    }
  }

  /**
   * Whether `sql` can legally run inside a transaction on this dialect.
   * Default `true` — Postgres, MariaDB, and most engines accept any DDL
   * inside a tx. Override on dialects with carve-outs (notably SQLite,
   * which forbids `ATTACH`/`DETACH`/`VACUUM` inside a tx).
   *
   * Used by {@link __runMany} to decide whether the auto-tx wrapper is
   * safe; also called by single-statement OQL methods that route
   * through `execute` to refuse a caller-supplied `transactionId` for
   * statements that can't honour it.
   */
  protected _canRunInTransaction(_sql: string): boolean {
    return true;
  }

  //#endregion OQL surface

  //#region Option processing

  /**
   * Validates the SQL-only options and delegates everything else to
   * {@link ConnectionEngine._processOption}. `transactionTimeout` accepts `0`
   * (disables the timer); `slowQueryThreshold` must be strictly positive.
   *
   * @returns The validated value, unmodified.
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` for any value that
   *   fails its check.
   *
   * @internal
   */
  protected override _processOption<K extends keyof O>(
    key: K,
    value: O[K],
  ): O[K] {
    switch (key as keyof SQLEngineOptions) {
      case 'slowQueryThreshold':
        if (
          typeof value !== 'number' || Number.isNaN(value) || value <= 0
        ) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key as string,
            reason: 'must be a positive number (seconds)',
          });
        }
        break;
      case 'transactionTimeout':
        // 0 disables the timeout. Negative is nonsense.
        if (
          typeof value !== 'number' || Number.isNaN(value) || value < 0
        ) {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key as string,
            reason: 'must be a non-negative number (seconds; 0 disables)',
          });
        }
        break;
      case 'autoRollbackOnFailure':
        if (typeof value !== 'boolean') {
          throw new EngineError('INVALID_CONFIG_VALUE', {
            instanceId: this.instanceId,
            option: key as string,
            reason: 'must be a boolean',
          });
        }
        break;
    }
    // SQL-specific keys are unknown to the base switch and fall through
    // as no-ops.
    return super._processOption(key, value);
  }

  //#endregion Option processing

  //#region Abstract — subclass must implement

  /**
   * Per-dialect OQL translator. Concrete engines instantiate the
   * corresponding `AbstractTranslator` subclass (PostgresTranslator,
   * MariaTranslator, SQLiteTranslator) once and assign it here.
   */
  protected abstract readonly _translator: AbstractTranslator;

  /**
   * Run `query` on `client` and return the result.
   *
   * Implementations should NOT acquire/release connections — `execute()`
   * already manages the client lifecycle.
   */
  protected abstract _execute<
    R extends Record<string, unknown> = Record<string, unknown>,
  >(
    query: EngineQuery,
    client: T,
  ): Promise<{ data: R[]; count: number }>;

  /** Run BEGIN / START TRANSACTION on `client`. */
  protected abstract _beginTransaction(
    client: T,
    transactionId: string,
  ): Promise<void> | void;

  /** Run COMMIT on `client`. */
  protected abstract _commitTransaction(
    client: T,
    transactionId: string,
  ): Promise<void> | void;

  /** Run ROLLBACK on `client`. */
  protected abstract _rollbackTransaction(
    client: T,
    transactionId: string,
  ): Promise<void> | void;

  /**
   * Map a driver-native error to a standardized `EngineError`. Default is
   * a generic `QUERY_EXECUTION_FAILED`. Override per-driver to translate
   * native error codes into standard codes.
   */
  protected _wrapDriverError(error: unknown, query: EngineQuery): EngineError {
    if (error instanceof EngineError) return error;
    return new EngineError(
      'QUERY_EXECUTION_FAILED',
      {
        instanceId: this.instanceId,
        reason: error instanceof Error ? error.message : String(error),
        sql: query.sql,
      },
      error as Error,
    );
  }

  /**
   * Encode a single parameter value before it leaves the engine.
   *
   * Default returns the value untouched. Override per-driver to handle
   * runtime-specific quirks (e.g. SQLite needs `Date → ISO`, `bool → 0/1`,
   * `object → JSON`; Postgres encodes everything to text in its custom
   * `_standardizeQuery` and bypasses this hook).
   *
   * Called from `_standardizeQuery` for every entry in `query.params`.
   */
  protected _encodeValue(value: unknown): unknown {
    return value;
  }

  //#endregion Abstract

  //#region Query standardization

  /**
   * Standardize a query before dispatch:
   *
   * 1. Trim whitespace and ensure trailing semicolon.
   * 2. Verify every `:name:` placeholder has a matching `params` entry.
   * 3. Rewrite `:name:` to the dialect-specific format declared in
   *    `Capabilities.parameterReplacement` (e.g. `:id:` → `:id` for
   *    Maria/SQLite). If `parameterReplacement` is undefined the
   *    placeholders are left as-is.
   * 4. Encode every param via `_encodeValue` (per-driver override).
   *
   * @throws {EngineError} `MISSING_PARAMETERS` if any placeholder is missing.
   */
  protected _standardizeQuery(query: EngineQuery): EngineQuery {
    const sqlBody = query.sql.trim().replace(/;$/, '') + ';';
    const supplied = query.params ?? {};
    const missing: string[] = [];
    // Placeholder names must start with a letter or underscore and contain
    // only word characters thereafter. Keeps the regex from misfiring on
    // time literals like '00:00:00' and on Postgres-style `::cast`.
    const placeholderRe = /:([A-Za-z_]\w*):/g;
    const matches = sqlBody.match(placeholderRe);
    if (matches) {
      for (const match of matches) {
        const key = match.substring(1, match.length - 1);
        if (!Object.hasOwn(supplied, key)) missing.push(key);
      }
    }
    if (missing.length > 0) {
      throw new EngineError('MISSING_PARAMETERS', {
        instanceId: this.instanceId,
        missing: Array.from(new Set(missing)).join(', '),
      });
    }

    const replacement = this.Capabilities.parameterReplacement;
    const sql = replacement
      ? sqlBody.replaceAll(
        placeholderRe,
        (_full, key) => `${replacement.prefix}${key}${replacement.suffix}`,
      )
      : sqlBody;

    if (!query.params) return { ...query, sql };

    const encoded: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(query.params)) {
      encoded[k] = this._encodeValue(v);
    }
    return { ...query, sql, params: encoded };
  }

  //#endregion Query standardization

  //#region Internal helpers

  /**
   * Drop the transaction record and return its client to the pool. When
   * `destroy` is set the client is destroyed instead of released — used
   * when the connection is likely dead (e.g. ROLLBACK threw) and must not
   * be recycled.
   */
  private __releaseTransactionClient(id: string, destroy = false): void {
    const tx = this._transactions.get(id);
    if (!tx) return;
    this._transactions.delete(id);
    if (destroy) {
      void this._destroy(tx.client);
    } else {
      this._release(tx.client);
    }
  }

  /**
   * Starts the auto-rollback timer for a transaction, storing the handle on
   * `record.timer`. A resolved timeout of `0` or less arms nothing, leaving
   * the transaction open indefinitely.
   *
   * @param override - Seconds, in place of the `transactionTimeout` option.
   */
  private __armTransactionTimeout(
    id: string,
    record: TxRecord<T>,
    override?: number,
  ): void {
    const seconds = override ?? this._getOption('transactionTimeout') ?? 120;
    if (seconds <= 0) return;
    record.timer = setTimeout(async () => {
      const tx = this._transactions.get(id);
      if (!tx || tx.state !== 'ACTIVE') return;
      tx.state = 'TIMEOUT';
      // A statement may still be in flight on this transaction's single
      // reserved connection (`busy` is set by `#claimTxConnection` and held
      // across the `await` of `_execute`). If so, the timer must NOT touch
      // the wire or the pool:
      //   1. Writing ROLLBACK onto the same socket the in-flight query is
      //      reading from interleaves the two response streams and corrupts
      //      the protocol.
      //   2. Releasing the client back to the pool while `_execute` is still
      //      using it would let a concurrent acquirer receive a live
      //      connection mid-statement — cross-transaction corruption.
      // Both the state check above and this `busy` check run synchronously
      // before any `await`, so `busy` reflects the current in-flight state.
      // Destroy the connection instead (mirrors the destroy-on-corruption
      // path taken on rollback failure); the orphaned `_execute` fails out
      // on the torn-down socket.
      if (tx.busy) {
        this.__releaseTransactionClient(id, true);
        this._emitRaw('transactionTimeout', this.instanceId, id);
        return;
      }
      let rollbackFailed = false;
      try {
        try {
          await this._rollbackTransaction(tx.client, id);
        } catch {
          // Ignore rollback errors during timeout, but remember it failed
          // so the (likely dead) client gets destroyed, not recycled.
          rollbackFailed = true;
        }
      } finally {
        this.__releaseTransactionClient(id, rollbackFailed);
        this._emitRaw('transactionTimeout', this.instanceId, id);
      }
    }, seconds * 1000);
  }

  /**
   * Folds one completed query into `_queryStats`. `averageExecutionTimeMs`
   * tracks successful queries only, so failures move `failedQueries` and
   * `totalQueries` but leave the mean untouched.
   *
   * @internal
   */
  protected override _recordQueryStats(
    timeMs: number,
    isSlow: boolean,
    success: boolean,
  ): void {
    const stats = this._queryStats;
    stats.totalQueries += 1;
    if (success) {
      // `averageExecutionTimeMs` accumulates only *successful* query times,
      // so the running mean must be weighted by the prior successful count —
      // not `totalQueries`, which also counts failures. Using the total as
      // the denominator inflates the effective prior sample count on every
      // interleaved failure and biases the reported average downward.
      const prevSuccessful = stats.successfulQueries;
      stats.averageExecutionTimeMs =
        (stats.averageExecutionTimeMs * prevSuccessful + timeMs) /
        (prevSuccessful + 1);
      stats.successfulQueries = prevSuccessful + 1;
      if (isSlow) stats.slowQueries += 1;
    } else {
      stats.failedQueries += 1;
    }
  }

  //#endregion Internal helpers

  //#region ConnectionEngine override

  /** Rolls back active transactions before closing the connection. */
  public override async disconnect(): Promise<void> {
    await this.rollbackAllTransactions();
    return super.disconnect();
  }

  //#endregion ConnectionEngine override
}

/**
 * Abstract **pooled** base for SQL-style driver engines — the class every
 * concrete relational driver (Postgres, MariaDB, SQLite, …) extends.
 *
 * Re-adds the socket {@link ConnectionPool} on top of the pool-free
 * {@link SQLConnectionEngine}, exactly as `PooledConnectionEngine` does on the
 * plain root: it composes a pool (wiring its
 * `_createResource` / `_destroyResource` / `_validateResource` / `_ping`
 * hooks) and overrides `connect` / `disconnect` / `ping` +
 * `_acquire` / `_release` / `_destroy` + `_ensureMin` / `_drain` to delegate
 * to it. Because the two pooled layers sit on different pool-free roots
 * (`ConnectionEngine` vs `SQLConnectionEngine`) they can share no base class,
 * so the divergence-prone lifecycle logic is instead single-sourced in
 * `poolLifecycle.ts` and both classes delegate to it (`connect` here just
 * calls `poolConnect(this._host)`); `disconnect` additionally rolls back
 * active transactions first. See that module for the rationale.
 *
 * @template T - Native client / connection resource type held by the pool.
 * @template O - Engine-specific options, extends `SQLEngineOptions`.
 * @template E - Engine-specific events, extends `SQLEngineEvents`.
 */
export abstract class SQLEngine<
  T = unknown,
  O extends SQLEngineOptions = SQLEngineOptions,
  E extends SQLEngineEvents = SQLEngineEvents,
> extends SQLConnectionEngine<T, O, E> {
  //#region Pool

  /**
   * The connection pool. This engine composes it rather than being it: its
   * sizing knobs are resolved from the `pool` option and its four resource
   * operations are wired to this class's abstract
   * `_createResource` / `_destroyResource` / `_validateResource` / `_ping`.
   * The connection-lifecycle methods below delegate their acquire / release
   * / drain seams to this instance.
   */
  protected readonly _pool: ConnectionPool<T>;

  /**
   * This engine viewed as a {@link PooledHost} for the shared lifecycle
   * helpers in `poolLifecycle.ts`. It **is** `this` (no wrapper, no copy); the
   * cast only re-types the `protected` members those helpers reach — `_pool`
   * stays `protected` on the class. The pooled `connect` / `disconnect` /
   * `ping` logic is single-sourced there, shared byte-for-byte with
   * {@link PooledConnectionEngine}.
   */
  private readonly _host: PooledHost<T> = this as unknown as PooledHost<T>;

  //#endregion Pool

  /**
   * Builds the pool from the resolved `pool` option and wires it to this
   * class's resource seams. The pool starts empty — no socket is opened until
   * {@link SQLEngine.connect} or the first query.
   *
   * @param name - Connection name for this engine instance
   * @param options - Engine options + event handlers
   * @param defaults - Subclass-supplied defaults (caller options win)
   *
   * @throws {@link EngineError} `INVALID_CONFIG_VALUE` when an option fails
   *   validation in {@link SQLConnectionEngine._processOption}
   */
  constructor(
    name: string,
    options?: EventOptionKeys<O, E>,
    defaults?: Partial<O>,
  ) {
    super(name, options, defaults);
    this._pool = createEnginePool<T>(this._getOption('pool'), {
      // `instanceId` is read lazily: the subclass's `Engine` field is only
      // initialized after this `super()` returns, so it can't be captured here.
      instanceId: () => this.instanceId,
      create: () => this._createResource(),
      destroy: (resource) => this._destroyResource(resource),
      validate: (resource) => this._validateResource(resource),
      ping: (resource) => this._ping(resource),
      onWarn: (message) => this._emitRaw('warn', this.instanceId, message),
    });
  }

  //#region Public API

  /** Snapshot of pool statistics. */
  public override get poolStats(): EnginePoolStats {
    return poolStatsSnapshot(this._host);
  }

  /**
   * Establish the underlying connection pool.
   *
   * Idempotent: returns immediately if already connected. On failure, status
   * is reset to `CLOSED` and a `CONNECTION_FAILED` error is thrown. The pooled
   * connect logic (warm-up, the drain-in-catch, the disconnect/connect race
   * guard, the emit sequence) is single-sourced in {@link poolConnect} — the
   * same function `PooledConnectionEngine.connect` delegates to, so the two
   * pooled layers can never diverge again.
   *
   * @emits connect - On successful connection
   * @emits connectionFailed - On connection failure
   */
  public override connect(): Promise<void> {
    return poolConnect(this._host);
  }

  /**
   * Roll back active transactions, drain the pool, and close every
   * underlying connection.
   *
   * Idempotent: returns immediately if already closed. The transaction
   * rollback runs first (unconditionally, exactly as the pool-free
   * {@link SQLConnectionEngine.disconnect} performs it before its `_close`);
   * the pool teardown + idempotency guard + emit/error handling is then
   * single-sourced in {@link poolDisconnect}, shared with
   * `PooledConnectionEngine.disconnect`.
   *
   * @emits disconnect - On successful disconnection
   * @emits error - On disconnection failure
   */
  public override async disconnect(): Promise<void> {
    await this.rollbackAllTransactions();
    return poolDisconnect(this._host);
  }

  /**
   * Liveness check delegated to the pool via {@link poolPing}.
   *
   * Returns `false` (rather than throwing) if the engine is closed or the
   * ping itself fails — callers can poll without try/catch ceremony.
   */
  public override ping(): Promise<boolean> {
    return poolPing(this._host);
  }

  //#endregion Public API

  //#region Connection acquisition (delegated to the pool)

  /**
   * Acquire one connection from the pool. Subclasses call this to check out
   * a resource; they MUST call `_release` (or `_destroy`) exactly once per
   * acquired resource, ideally in a `try/finally`.
   *
   * @param timeoutMs - Override the default acquire timeout for this call.
   * @throws {EngineError} `POOL_DRAINING` if the pool is draining.
   * @throws {EngineError} `POOL_ACQUIRE_TIMEOUT` if the timeout elapses while
   *   queued; or whatever the factory throws when creating a new resource.
   */
  protected override _acquire(timeoutMs?: number): Promise<T> {
    return this._pool.acquire(timeoutMs);
  }

  /**
   * Return a resource to the pool. If a queued acquirer is waiting, the pool
   * validates and hands the resource to it; otherwise it goes back to the
   * idle list. Calling with a resource not owned by the pool is a no-op.
   */
  protected override _release(resource: T): void {
    this._pool.release(resource);
  }

  /**
   * Forcefully remove and destroy a resource (e.g. after a transport error).
   * Use this instead of `_release` when the resource cannot be reused; the
   * freed slot backfills any queued waiter with a fresh one.
   */
  protected override _destroy(resource: T): Promise<void> {
    return this._pool.destroy(resource);
  }

  //#region Pool introspection seams

  // The pool owns the acquire/release state machine; these thin accessors
  // re-expose the bits the connection lifecycle (and the pool test-suite,
  // which drives the state machine directly) reach for. Reading `_idle` /
  // `_waiters` returns the pool's live containers by reference.

  /** Whether the pool is draining. Flipped by connect / disconnect. */
  protected get _draining(): boolean {
    return this._pool.draining;
  }
  protected set _draining(value: boolean) {
    this._pool.draining = value;
  }

  /** Live idle-resource list held by the pool (by reference). */
  protected get _idle(): T[] {
    return this._pool.idle;
  }

  /** Live waiter queue held by the pool (by reference). */
  protected get _waiters(): Waiter<T>[] {
    return this._pool.waiters;
  }

  /** Number of factory calls currently in flight in the pool. */
  protected get _pending(): number {
    return this._pool.pending;
  }

  //#endregion Pool introspection seams

  //#endregion Connection acquisition

  //#region Pool internals (delegated to the pool)

  /** Pre-create `min` resources so the pool is warm. */
  protected _ensureMin(): Promise<void> {
    return this._pool.ensureMin();
  }

  /**
   * Stop accepting new acquires, reject pending waiters, and destroy all
   * idle resources. Active resources are destroyed when their owners
   * release them.
   */
  protected _drain(): Promise<void> {
    return this._pool.drain();
  }

  //#endregion Pool internals

  //#region Abstract — subclass must implement

  /** Construct one new resource. Called by `_acquire` and `_ensureMin`. */
  protected abstract _createResource(): Promise<T> | T;

  /** Dispose of a resource. Called by `_release`/`_destroy`/`_drain`. */
  protected abstract _destroyResource(resource: T): Promise<void> | void;

  /** Run an engine-specific liveness check on `resource`. */
  protected abstract override _ping(resource: T): Promise<boolean> | boolean;

  //#endregion Abstract — subclass must implement
}
