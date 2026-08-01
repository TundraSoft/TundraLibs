/**
 * @module
 *
 * The Executor seam — norm's single boundary to `@tundralibs/drivers`.
 *
 * Norm never talks to an engine directly above this seam: `execute()`
 * dispatches a DML OQL query to the matching engine method,
 * `transaction()` runs a callback inside an engine transaction (the
 * driver commits/rolls-back and releases the connection — leak-safe),
 * and `capabilities` states honestly what the engine can do. Tests plug
 * in a mock Executor and exercise the entire runtime black-box, no
 * database required.
 *
 * {@link bindTx} scopes an executor to one transaction: `execute()`
 * stamps the tx id and `transaction()` throws, making nested-transaction
 * rejection structural — nesting goes through {@link Session.savepoint}.
 *
 * @since 1.0.0
 */

import type {
  EngineQueryResult,
  EngineTransactionOptions,
  MongoEngine,
  SQLEngine,
  TransactionScope,
} from '@tundralibs/drivers';
import type { Query } from '@tundralibs/oql/types';
import { NormAdvisoryLockError, NormUnsupportedError } from './errors/mod.ts';

/** Any SQL engine, dialect-erased. */
// deno-lint-ignore no-explicit-any
export type AnySQLEngine = SQLEngine<any, any, any>;

/** The DML query types `db.query()` accepts. */
export type NormDMLQuery =
  | Query<'SELECT'>
  | Query<'INSERT'>
  | Query<'UPDATE'>
  | Query<'DELETE'>
  | Query<'UPSERT'>
  | Query<'COUNT'>
  | Query<'INSERT_FROM_QUERY'>;

/**
 * What the executor dispatches: every public DML type plus TRUNCATE,
 * which the write path issues for `repo.truncate()` but which is
 * deliberately NOT part of {@link NormDMLQuery}.
 */
export type ExecutorQuery = NormDMLQuery | Query<'TRUNCATE'>;

/**
 * A live engine transaction, scoped to the callback that opened it. The
 * driver commits on resolve, rolls back on throw, and always releases the
 * connection — callers just run work and, for nesting, open a savepoint.
 */
export type Session = {
  readonly id: string;
  /** Run `fn` under a `SAVEPOINT` on this transaction. Resolve folds the
   * inner work into the surrounding transaction; a throw rolls back only
   * to the savepoint (the outer transaction survives) and rethrows — the
   * driver owns the savepoint's create / rollback-to / release. SQL
   * engines only. */
  savepoint<T>(fn: (sp: Session) => Promise<T>): Promise<T>;
};

/** What the underlying engine can honestly do. */
export type ExecutorCapabilities = {
  readonly transactions: boolean;
  /**
   * DDL participates in transactions — a mid-batch failure rolls back
   * every statement before it. DISTINCT from {@link
   * ExecutorCapabilities.transactions}, which is about DML only: MariaDB
   * / MySQL report `transactions: true` yet implicitly COMMIT on every
   * DDL statement, so wrapping a migration in `BEGIN` there buys
   * nothing.
   *
   * True on Postgres and SQLite; false on MariaDB (implicit commit) and
   * Mongo (no transaction surface). Unlike the other flags this is a
   * property of the SQL FAMILY rather than the server, so it is keyed on
   * `dialect` — a wire-compatible alias engine inherits its base
   * family's DDL semantics, which is the correct default. It is still
   * gated on the engine's own `transactions` flag, so an engine that
   * disables transactions outright never claims transactional DDL.
   */
  readonly transactionalDdl: boolean;
  /** Can ALTER a column's type/nullability in place (SQLite cannot —
   * table rebuild territory; Mongo no-ops harmlessly). */
  readonly alterColumns: boolean;
  /** Can add/drop FK constraints on an existing table (same story). */
  readonly alterConstraints: boolean;
  /** Server-side advisory locks (pg_advisory_lock / GET_LOCK) —
   * multi-machine mutual exclusion. SQLite (file-local) and Mongo
   * report false; the Migrator falls back to its file lock alone. */
  readonly advisoryLock: boolean;
  /** Which translator family the engine speaks — the Migrator uses
   * this to pick the matching stored plan artifact. */
  readonly dialect: 'sqlite' | 'postgres' | 'maria' | 'mongo';
};

/** The DDL query types the migration subsystem dispatches. */
export type DdlQuery =
  | Query<'CREATE_SCHEMA'>
  | Query<'CREATE_TABLE'>
  | Query<'ALTER_TABLE'>
  | Query<'DROP_TABLE'>
  | Query<'CREATE_VIEW'>
  | Query<'DROP_VIEW'>
  | Query<'CREATE_INDEX'>
  | Query<'DROP_INDEX'>;

/**
 * Norm's single seam to the database engine. `txId` is threaded by
 * {@link bindTx}-wrapped executors; callers above the seam never pass
 * it directly.
 */
export type Executor = {
  readonly capabilities: ExecutorCapabilities;
  execute<R extends Record<string, unknown> = Record<string, unknown>>(
    q: ExecutorQuery,
    txId?: string,
  ): Promise<EngineQueryResult<R>>;
  /** Dispatch one DDL action (migrations only — never the request
   * path). Multi-statement actions run inside the ENGINE's own
   * per-action transaction where the dialect allows. */
  ddl(q: DdlQuery, txId?: string): Promise<void>;
  /** Run `fn` inside an engine transaction: the driver commits on
   * resolve, rolls back on throw, and always releases the connection
   * (leak-safe). Nesting is via {@link Session.savepoint}. SQL engines
   * only — Mongo rejects. */
  transaction<T>(
    fn: (session: Session) => Promise<T>,
    options?: EngineTransactionOptions,
  ): Promise<T>;
  /**
   * Run `fn` while holding the named server-side advisory lock,
   * waiting up to `timeoutMs` to take it.
   *
   * Lock ACQUIRE and RELEASE are pinned to a SINGLE physical
   * connection, because Postgres session-level advisory locks and
   * MariaDB `GET_LOCK`/`RELEASE_LOCK` are connection-scoped: a pooled
   * lock/unlock pair can land on different backends, so the release
   * misses the backend that took the lock and it leaks. On a
   * multi-connection pool the lock is pinned to a reserved connection
   * (the guarded `fn` runs on the others); a single-connection pool
   * already reuses the one backend, so the pooled pair is affine and
   * no connection is held back.
   *
   * `fn`'s own errors propagate unchanged; the lock is released on
   * every exit path. Throws {@link NormAdvisoryLockError} when the
   * lock cannot be taken in time, or {@link NormUnsupportedError} when
   * the dialect has no advisory locks (callers gate on
   * `capabilities.advisoryLock`).
   */
  withAdvisoryLock<T>(
    key: string,
    timeoutMs: number,
    fn: () => Promise<T>,
  ): Promise<T>;
  /** Execute a HAND-WRITTEN SQL string with named params. SQL engines
   * only — Mongo throws (no SQL). Rows come back exactly as the driver
   * returns them: NO decrypt, NO afterRead, NO hashed-filter rewrite.
   * The escape hatch below the typed surface. */
  raw<R extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: Record<string, unknown>,
    txId?: string,
  ): Promise<EngineQueryResult<R>>;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
};

/**
 * Wrap a driver {@link TransactionScope} as a norm {@link Session}. The
 * scope's `id` is the engine transaction id (savepoints share it); its
 * `transaction()` opens a nested `SAVEPOINT`, recursively wrapped so a
 * savepoint can itself nest.
 */
function toSession(scope: TransactionScope): Session {
  return {
    id: scope.id,
    savepoint: (fn) => scope.transaction((sp) => fn(toSession(sp))),
  };
}

/** Advisory-lock names are norm-controlled, but stay defensive. */
function lockLiteral(key: string): string {
  return `'${key.replace(/'/g, "''")}'`;
}

const LOCK_POLL_MS = 250;

/**
 * The engine's resolved pool ceiling. A multi-connection pool (> 1)
 * needs the advisory lock pinned to a reserved connection so it does
 * not leak; a single-connection pool reuses the one backend and is
 * affine already. Read defensively — an engine that does not surface
 * its ceiling is treated as single-connection, which never holds a
 * connection back (so it can never self-deadlock the guarded work).
 */
function effectivePoolMax(engine: AnySQLEngine): number {
  const max = (engine as unknown as { _poolMax?: unknown })._poolMax;
  return typeof max === 'number' && Number.isFinite(max) && max > 1 ? max : 1;
}

/**
 * Adapter for SQL engines (Postgres / MariaDB / SQLite). Owns the
 * `q.type` → engine-method dispatch in exactly one place.
 */
export function sqlExecutor(engine: AnySQLEngine): Executor {
  // Capabilities and dialect are read from the ENGINE (self-describing),
  // NOT switched on its identity string. A wire-compatible alias engine
  // (e.g. CockroachEngine — dialect 'postgres', advisoryLock off) is
  // therefore honoured correctly instead of inheriting stock-Postgres
  // defaults, and there is no silent 'sqlite' fallback for an unknown
  // engine label.
  const dialect = engine.Dialect;
  return {
    capabilities: {
      transactions: engine.Capabilities.transactions === true,
      // Whether DDL rolls back is a SQL-family fact, not a per-server
      // one: Postgres and SQLite keep DDL inside the transaction,
      // MariaDB/MySQL implicitly COMMIT on every DDL statement. Gated on
      // the engine's own transaction flag so an engine that turns
      // transactions off cannot claim transactional DDL.
      transactionalDdl: engine.Capabilities.transactions === true &&
        (dialect === 'postgres' || dialect === 'sqlite'),
      // In-place column/constraint ALTERs need a table rebuild on SQLite;
      // the translators throw there, so the seam reports it honestly.
      alterColumns: engine.Capabilities.inPlaceAlter,
      alterConstraints: engine.Capabilities.inPlaceAlter,
      advisoryLock: engine.Capabilities.advisoryLock,
      dialect,
    },
    async withAdvisoryLock<T>(
      key: string,
      timeoutMs: number,
      fn: () => Promise<T>,
    ): Promise<T> {
      // Honour the engine's own capability — a pg-wire server without
      // advisory locks (CockroachDB) must not be issued pg_advisory_lock.
      if (!engine.Capabilities.advisoryLock) {
        throw new NormUnsupportedError({ feature: 'advisory locks', dialect });
      }
      const lit = lockLiteral(key);
      // ACQUIRE and RELEASE both take an optional transaction id so the
      // pair can be routed to the SAME reserved connection. `txId` set →
      // the driver runs the statement on that transaction's pinned
      // client; unset → an ordinary pooled statement.
      const run = (sql: string, txId?: string) =>
        engine.execute<{ locked: unknown }>({
          sql,
          ...(txId !== undefined ? { transactionId: txId } : {}),
        });
      const acquire = async (txId?: string): Promise<void> => {
        if (dialect === 'maria') {
          // GET_LOCK blocks server-side up to the timeout; 1 = acquired.
          // Sub-second waits round UP to a second (the function's unit),
          // but an explicit 0 stays 0 — "try once, fail fast", which is
          // what the Postgres branch below does with the same input.
          // Clamping it to 1 would silently turn a no-wait request into
          // a one-second block.
          const res = await run(
            `SELECT GET_LOCK(${lit}, ${
              Math.max(0, Math.ceil(timeoutMs / 1000))
            }) AS locked`,
            txId,
          );
          if (Number(res.data[0]?.locked) === 1) return;
          throw new NormAdvisoryLockError({ key, timeoutMs, dialect });
        }
        if (dialect === 'postgres') {
          // Poll try-lock: pg_advisory_lock would block WITHOUT a
          // timeout, hanging a stuck deploy forever.
          const deadline = Date.now() + timeoutMs;
          for (;;) {
            const res = await run(
              `SELECT pg_try_advisory_lock(hashtext(${lit})::bigint) AS locked`,
              txId,
            );
            if (res.data[0]?.locked === true) return;
            if (Date.now() >= deadline) {
              throw new NormAdvisoryLockError({ key, timeoutMs, dialect });
            }
            await new Promise((r) => setTimeout(r, LOCK_POLL_MS));
          }
        }
        // Capability was claimed but this dialect has no advisory-lock
        // implementation — the lock cannot be honoured, so surface it as
        // an acquisition failure rather than silently proceeding unlocked.
        throw new NormAdvisoryLockError({ key, timeoutMs, dialect });
      };
      const release = async (txId?: string): Promise<void> => {
        if (dialect === 'maria') {
          await run(`SELECT RELEASE_LOCK(${lit})`, txId);
          return;
        }
        await run(`SELECT pg_advisory_unlock(hashtext(${lit})::bigint)`, txId);
      };

      // Single-connection pool: every pooled statement reuses the one
      // backend, so a pooled acquire/release pair is already affine.
      // Pinning a connection here would only starve the guarded `fn`.
      if (effectivePoolMax(engine) <= 1) {
        await acquire();
        try {
          return await fn();
        } finally {
          // Swallow release errors so they cannot mask `fn`'s own error;
          // the single backend that holds the lock is the one released.
          await release().catch(() => {});
        }
      }

      // Multi-connection pool: PIN the lock to one reserved connection so
      // the release lands on the SAME backend that took the lock. The
      // guarded `fn` runs on the OTHER pooled connections. The manual
      // transaction handle is the drivers seam that reserves a connection
      // for norm's own lifecycle management.
      //
      // `timeout: 0` DISARMS the driver's auto-rollback timer (default
      // transactionTimeout 120s). This pinned transaction issues no SQL
      // of its own — it exists only to keep the reserved connection out
      // of the pool while `fn` runs. If the default timer fired, the
      // driver would ROLLBACK and RELEASE this connection back to the
      // pool, yet the session-level advisory lock (pg_advisory_lock /
      // GET_LOCK) SURVIVES rollback — silently re-leaking the migration
      // lock onto a pooled connection, and the finally-block release
      // would then throw TRANSACTION_NOT_FOUND (swallowed) and never
      // unlock. Any apply() exceeding 120s would strand the lock.
      const handle = await engine.transaction({ timeout: 0 });
      let acquired = false;
      try {
        await acquire(handle.id);
        acquired = true;
        return await fn();
      } finally {
        if (acquired) {
          // Release on the reserved connection (same backend). Swallowed
          // for the same reason as above; the release is connection-affine
          // so it effectively never fails.
          await release(handle.id).catch(() => {});
        }
        // End the pinned transaction to return its connection to the pool.
        await handle.commit().catch(() => handle.rollback().catch(() => {}));
      }
    },
    raw<R extends Record<string, unknown>>(
      sql: string,
      params?: Record<string, unknown>,
      txId?: string,
    ): Promise<EngineQueryResult<R>> {
      return engine.execute<R>({
        sql,
        ...(params !== undefined ? { params } : {}),
        ...(txId !== undefined ? { transactionId: txId } : {}),
      });
    },
    async execute<R extends Record<string, unknown>>(
      q: ExecutorQuery,
      txId?: string,
    ): Promise<EngineQueryResult<R>> {
      switch (q.type) {
        case 'SELECT':
          return await engine.select<R>(q, txId);
        case 'INSERT':
          return await engine.insert<R>(q, txId);
        case 'INSERT_FROM_QUERY':
          return await engine.insertQuery<R>(q, txId);
        case 'UPDATE':
          return await engine.update<R>(q, txId);
        case 'DELETE':
          return await engine.delete<R>(q, txId);
        case 'UPSERT':
          return await engine.upsert<R>(q, txId);
        case 'COUNT':
          return await engine.count(
            q,
            txId,
          ) as unknown as EngineQueryResult<R>;
        case 'TRUNCATE':
          return await engine.truncate(
            q,
            txId,
          ) as unknown as EngineQueryResult<R>;
        default: {
          const exhaustive: never = q;
          throw new Error(
            `Unsupported query type: ${(exhaustive as { type: string }).type}`,
          );
        }
      }
    },
    async ddl(q: DdlQuery, txId?: string): Promise<void> {
      switch (q.type) {
        case 'CREATE_SCHEMA':
          await engine.createSchema(q, txId);
          return;
        case 'CREATE_TABLE':
          await engine.createTable(q, txId);
          return;
        case 'ALTER_TABLE':
          await engine.alterTable(q, txId);
          return;
        case 'DROP_TABLE':
          await engine.dropTable(q, txId);
          return;
        case 'CREATE_VIEW':
          await engine.createView(q, txId);
          return;
        case 'DROP_VIEW':
          await engine.dropView(q, txId);
          return;
        case 'CREATE_INDEX':
          await engine.createIndex(q, txId);
          return;
        case 'DROP_INDEX':
          await engine.dropIndex(q, txId);
          return;
        default: {
          const exhaustive: never = q;
          throw new Error(
            `Unsupported DDL type: ${(exhaustive as { type: string }).type}`,
          );
        }
      }
    },
    transaction<T>(
      fn: (session: Session) => Promise<T>,
      options?: EngineTransactionOptions,
    ): Promise<T> {
      // The driver's callback form owns the whole lifecycle: reserve the
      // connection, COMMIT on resolve / ROLLBACK on throw, release the
      // connection, and drive nested savepoints. Norm just runs work.
      return engine.transaction(
        (scope) => fn(toSession(scope)),
        options,
      );
    },
    connect: () => engine.connect(),
    disconnect: () => engine.disconnect(),
  };
}

/**
 * Adapter for MongoDB. Honest about its limits: no transactions, and a
 * transaction-scoped call throws instead of silently executing outside
 * the transaction.
 */
export function mongoExecutor(engine: MongoEngine): Executor {
  const unsupported = () =>
    new NormUnsupportedError({ feature: 'transactions', dialect: 'mongo' });
  return {
    // Mongo alterTable add/drop columns are harmless no-ops
    // (schemaless) — honestly "supported".
    capabilities: {
      transactions: false,
      transactionalDdl: false,
      alterColumns: true,
      alterConstraints: true,
      advisoryLock: false,
      dialect: 'mongo',
    },
    raw: () =>
      Promise.reject(
        new NormUnsupportedError({ feature: 'raw SQL', dialect: 'mongo' }),
      ),
    withAdvisoryLock: <T>() =>
      Promise.reject<T>(
        new NormUnsupportedError({
          feature: 'advisory locks',
          dialect: 'mongo',
        }),
      ),
    async execute<R extends Record<string, unknown>>(
      q: ExecutorQuery,
      txId?: string,
    ): Promise<EngineQueryResult<R>> {
      if (txId !== undefined) throw unsupported();
      switch (q.type) {
        case 'SELECT':
          return await engine.select<R>(q);
        case 'INSERT':
          return await engine.insert<R>(q);
        case 'INSERT_FROM_QUERY':
          return await engine.insertQuery<R>(q);
        case 'UPDATE':
          return await engine.update<R>(q);
        case 'DELETE':
          return await engine.delete<R>(q);
        case 'UPSERT':
          return await engine.upsert<R>(q);
        case 'COUNT':
          return await engine.count(q) as unknown as EngineQueryResult<R>;
        case 'TRUNCATE':
          return await engine.truncate(q) as unknown as EngineQueryResult<R>;
        default: {
          const exhaustive: never = q;
          throw new Error(
            `Unsupported query type: ${(exhaustive as { type: string }).type}`,
          );
        }
      }
    },
    async ddl(q: DdlQuery, txId?: string): Promise<void> {
      if (txId !== undefined) throw unsupported();
      switch (q.type) {
        case 'CREATE_SCHEMA':
          await engine.createSchema(q);
          return;
        case 'CREATE_TABLE':
          await engine.createTable(q);
          return;
        case 'ALTER_TABLE':
          await engine.alterTable(q);
          return;
        case 'DROP_TABLE':
          await engine.dropTable(q);
          return;
        case 'CREATE_VIEW':
          await engine.createView(q);
          return;
        case 'DROP_VIEW':
          await engine.dropView(q);
          return;
        case 'CREATE_INDEX':
          await engine.createIndex(q);
          return;
        case 'DROP_INDEX':
          await engine.dropIndex(q);
          return;
        default: {
          const exhaustive: never = q;
          throw new Error(
            `Unsupported DDL type: ${(exhaustive as { type: string }).type}`,
          );
        }
      }
    },
    transaction<T>(): Promise<T> {
      return Promise.reject(unsupported());
    },
    connect: () => engine.connect(),
    disconnect: () => engine.disconnect(),
  };
}

/**
 * Scope an executor to one open transaction: every `execute()` carries
 * the transaction id, and `transaction()` throws — nested transactions
 * are rejected structurally (nesting goes through {@link Session.savepoint}).
 */
export function bindTx(executor: Executor, txId: string): Executor {
  return {
    capabilities: executor.capabilities,
    execute: (q, innerTxId) => {
      if (innerTxId !== undefined && innerTxId !== txId) {
        throw new NormUnsupportedError({
          feature: 'cross-transaction execution',
        });
      }
      return executor.execute(q, txId);
    },
    ddl: (q, innerTxId) => {
      if (innerTxId !== undefined && innerTxId !== txId) {
        throw new NormUnsupportedError({
          feature: 'cross-transaction execution',
        });
      }
      return executor.ddl(q, txId);
    },
    transaction: () =>
      Promise.reject(
        new NormUnsupportedError({ feature: 'nested transactions' }),
      ),
    withAdvisoryLock: <T>() =>
      Promise.reject<T>(
        new NormUnsupportedError({
          feature: 'advisory locks inside a transaction',
        }),
      ),
    raw: (sql, params, innerTxId) => {
      if (innerTxId !== undefined && innerTxId !== txId) {
        throw new NormUnsupportedError({
          feature: 'cross-transaction execution',
        });
      }
      return executor.raw(sql, params, txId);
    },
    connect: () => executor.connect(),
    disconnect: () => executor.disconnect(),
  };
}
