/**
 * Executor-seam tests: sqlExecutor dispatch (every query type → the
 * matching engine method, txId threading, capability mapping),
 * mongoExecutor honesty (no transactions, tx-scoped calls throw), and
 * bindTx structural nesting/cross-tx rejection.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { CockroachEngine, type MongoEngine } from '@tundralibs/drivers';
import {
  type AnySQLEngine,
  bindTx,
  type Executor,
  type ExecutorQuery,
  mongoExecutor,
  NormAdvisoryLockError,
  NormUnsupportedError,
  type Session,
  sqlExecutor,
} from './mod.ts';

type Row = Record<string, unknown>;

const RESULT = { type: 'X', data: [], count: 0, time: 1, isSlow: false };

/** Fake SQL engine recording (method, txId) per call. */
function fakeSqlEngine(transactions = true) {
  const calls: Array<{ method: string; txId: string | undefined }> = [];
  const record = (method: string) => (_q: unknown, txId?: string) => {
    calls.push({ method, txId });
    return Promise.resolve({ ...RESULT, type: method });
  };
  let connects = 0;
  let disconnects = 0;
  const engine = {
    // Capabilities are now read from the engine (self-describing); the
    // `transactions=false` variant stands in for SQLite.
    Capabilities: {
      transactions,
      advisoryLock: transactions,
      inPlaceAlter: transactions,
      referentialActions: true,
    },
    Engine: transactions ? 'POSTGRES' : 'SQLITE',
    Dialect: transactions ? 'postgres' : 'sqlite',
    createSchema: record('createSchema'),
    createTable: record('createTable'),
    alterTable: record('alterTable'),
    dropTable: record('dropTable'),
    createView: record('createView'),
    dropView: record('dropView'),
    createIndex: record('createIndex'),
    dropIndex: record('dropIndex'),
    select: record('select'),
    insert: record('insert'),
    insertQuery: record('insertQuery'),
    update: record('update'),
    delete: record('delete'),
    upsert: record('upsert'),
    count: record('count'),
    truncate: record('truncate'),
    // Driver callback form: run `fn` with a TransactionScope, whose
    // nested `transaction()` opens a savepoint (same tx id).
    transaction: (
      // deno-lint-ignore no-explicit-any
      fn: (scope: any) => Promise<unknown>,
      _o?: unknown,
    ) => {
      // deno-lint-ignore no-explicit-any
      const makeScope = (id: string): any => ({
        id,
        execute: () => Promise.resolve({ ...RESULT }),
        // deno-lint-ignore no-explicit-any
        transaction: (inner: (sp: any) => Promise<unknown>) => {
          calls.push({ method: 'savepoint', txId: id });
          return inner(makeScope(id));
        },
      });
      return fn(makeScope('tx-9'));
    },
    connect: () => {
      connects++;
      return Promise.resolve();
    },
    disconnect: () => {
      disconnects++;
      return Promise.resolve();
    },
  };
  return {
    engine: engine as unknown as AnySQLEngine,
    calls,
    counts: () => ({ connects, disconnects }),
  };
}

/** Fake Mongo engine — same recording surface, no txId params. */
function fakeMongoEngine() {
  const calls: string[] = [];
  const record = (method: string) => (_q: unknown) => {
    calls.push(method);
    return Promise.resolve({ ...RESULT, type: method });
  };
  const engine = {
    select: record('select'),
    insert: record('insert'),
    insertQuery: record('insertQuery'),
    update: record('update'),
    delete: record('delete'),
    upsert: record('upsert'),
    count: record('count'),
    truncate: record('truncate'),
    createSchema: record('createSchema'),
    createTable: record('createTable'),
    alterTable: record('alterTable'),
    dropTable: record('dropTable'),
    createView: record('createView'),
    dropView: record('dropView'),
    createIndex: record('createIndex'),
    dropIndex: record('dropIndex'),
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
  };
  return { engine: engine as unknown as MongoEngine, calls };
}

const q = (type: string): ExecutorQuery =>
  ({ type, table: 't' }) as unknown as ExecutorQuery;

const DISPATCH: Array<[string, string]> = [
  ['SELECT', 'select'],
  ['INSERT', 'insert'],
  ['INSERT_FROM_QUERY', 'insertQuery'],
  ['UPDATE', 'update'],
  ['DELETE', 'delete'],
  ['UPSERT', 'upsert'],
  ['COUNT', 'count'],
  ['TRUNCATE', 'truncate'],
];

describe('norm.executor (seam adapters)', () => {
  // A fake SQL engine that records (sql, txId) per execute and honours the
  // MANUAL transaction handle (`engine.transaction()` no-arg) the executor
  // uses to PIN the advisory lock to one reserved connection. `poolMax`
  // drives the pinned (> 1) vs pooled (=== 1) branch.
  const fakeLockEngine = (opts: {
    dialect: string;
    advisoryLock?: boolean;
    poolMax: number;
    answers: unknown[];
  }) => {
    const calls: Array<{ sql: string; txId: string | undefined }> = [];
    const commits: string[] = [];
    const rollbacks: string[] = [];
    const txOptions: unknown[] = [];
    let i = 0;
    let txSeq = 0;
    const answer = () => ({
      ...RESULT,
      data: [opts.answers[Math.min(i++, opts.answers.length - 1)]],
    });
    const engine = {
      _poolMax: opts.poolMax,
      Capabilities: {
        transactions: true,
        advisoryLock: opts.advisoryLock ??
          (opts.dialect === 'POSTGRES' || opts.dialect === 'MARIA'),
        inPlaceAlter: opts.dialect !== 'SQLITE',
        referentialActions: true,
      },
      Engine: opts.dialect,
      Dialect: opts.dialect.toLowerCase(),
      execute: (query: { sql: string; transactionId?: string }) => {
        calls.push({ sql: query.sql, txId: query.transactionId });
        return Promise.resolve(answer());
      },
      // Manual transaction handle: reserves a connection, exposes its id,
      // and RECORDS the options it was opened with (the pin must disarm
      // the driver's auto-rollback timer via `{ timeout: 0 }`).
      transaction: (options?: unknown) => {
        txOptions.push(options);
        const id = `lock-tx-${++txSeq}`;
        return Promise.resolve({
          id,
          commit: () => {
            commits.push(id);
            return Promise.resolve();
          },
          rollback: () => {
            rollbacks.push(id);
            return Promise.resolve();
          },
          execute: (query: { sql: string }) => {
            calls.push({ sql: query.sql, txId: id });
            return Promise.resolve(answer());
          },
        });
      },
    };
    return {
      ex: sqlExecutor(engine as unknown as AnySQLEngine),
      calls,
      commits,
      rollbacks,
      txOptions,
    };
  };

  it('advisory locks (multi-connection): lock + unlock PIN to one reserved connection', async () => {
    // Postgres, pool max > 1: acquire and release must both land on the
    // SAME reserved backend, or the release misses the lock and it leaks.
    const pg = fakeLockEngine({
      dialect: 'POSTGRES',
      poolMax: 4,
      answers: [{ locked: true }],
    });
    asserts.assertEquals(pg.ex.capabilities.advisoryLock, true);
    let ran = false;
    const out = await pg.ex.withAdvisoryLock('norm:migrator', 5_000, () => {
      ran = true;
      return Promise.resolve('done');
    });
    asserts.assertEquals(out, 'done');
    asserts.assertEquals(ran, true);
    // Exactly the acquire and the release ran on the pinned connection.
    const lockCalls = pg.calls.filter((c) =>
      c.sql.includes('pg_try_advisory_lock') ||
      c.sql.includes('pg_advisory_unlock')
    );
    asserts.assertEquals(lockCalls.length, 2);
    asserts.assertStringIncludes(lockCalls[0]!.sql, 'pg_try_advisory_lock');
    asserts.assertStringIncludes(lockCalls[0]!.sql, "'norm:migrator'");
    asserts.assertStringIncludes(lockCalls[1]!.sql, 'pg_advisory_unlock');
    // THE regression: same, non-undefined, reserved connection for both.
    asserts.assertNotEquals(lockCalls[0]!.txId, undefined);
    asserts.assertEquals(lockCalls[0]!.txId, lockCalls[1]!.txId);
    // The reserved connection was returned to the pool.
    asserts.assertEquals(pg.commits.length, 1);

    // Maria, pool max > 1: GET_LOCK / RELEASE_LOCK, same pinning.
    const maria = fakeLockEngine({
      dialect: 'MARIA',
      poolMax: 8,
      answers: [{ locked: 1 }],
    });
    await maria.ex.withAdvisoryLock(
      'norm:migrator',
      5_000,
      () => Promise.resolve(),
    );
    const mCalls = maria.calls.filter((c) =>
      c.sql.includes('GET_LOCK') || c.sql.includes('RELEASE_LOCK')
    );
    asserts.assertEquals(mCalls.length, 2);
    asserts.assertStringIncludes(mCalls[0]!.sql, 'GET_LOCK');
    asserts.assertStringIncludes(mCalls[1]!.sql, 'RELEASE_LOCK');
    asserts.assertNotEquals(mCalls[0]!.txId, undefined);
    asserts.assertEquals(mCalls[0]!.txId, mCalls[1]!.txId);
    asserts.assertEquals(maria.commits.length, 1);
    // 5_000 ms → whole seconds, GET_LOCK's unit.
    asserts.assertStringIncludes(mCalls[0]!.sql, ', 5)');

    // A 0 timeout means "try once, fail fast" — the Postgres branch
    // honours it (its deadline is already past), so Maria must too. A
    // Math.max(1, …) clamp would silently block for a second instead.
    const nowait = fakeLockEngine({
      dialect: 'MARIA',
      poolMax: 8,
      answers: [{ locked: 1 }],
    });
    await nowait.ex.withAdvisoryLock('norm:migrator', 0, () => {
      return Promise.resolve();
    });
    const nCalls = nowait.calls.filter((c) => c.sql.includes('GET_LOCK'));
    asserts.assertStringIncludes(nCalls[0]!.sql, ', 0)');
  });

  it('advisory locks: the pinned connection DISARMS the auto-rollback timer (regression)', async () => {
    // The pin exists only to hold the reserved connection out of the pool
    // while `fn` runs — it issues no SQL of its own and stays idle. If the
    // driver's default 120s transactionTimeout fired, it would ROLLBACK +
    // RELEASE the connection back to the pool, but the session advisory
    // lock SURVIVES rollback — silently re-leaking the migration lock onto
    // a pooled connection. The pin MUST open with `{ timeout: 0 }`.
    const pg = fakeLockEngine({
      dialect: 'POSTGRES',
      poolMax: 4,
      answers: [{ locked: true }],
    });
    await pg.ex.withAdvisoryLock(
      'norm:migrator',
      5_000,
      () => Promise.resolve(),
    );
    asserts.assertEquals(pg.txOptions.length, 1);
    asserts.assertEquals(pg.txOptions[0], { timeout: 0 });
  });

  it('advisory locks: a throw inside the critical section STILL releases on the reserved connection', async () => {
    const pg = fakeLockEngine({
      dialect: 'POSTGRES',
      poolMax: 4,
      answers: [{ locked: true }],
    });
    const boom = new Error('migration blew up');
    const err = await asserts.assertRejects(
      () =>
        pg.ex.withAdvisoryLock(
          'norm:migrator',
          5_000,
          () => Promise.reject(boom),
        ),
      Error,
      'migration blew up',
    );
    asserts.assertStrictEquals(err, boom); // fn's error propagates UNCHANGED
    const lockCalls = pg.calls.filter((c) =>
      c.sql.includes('pg_try_advisory_lock') ||
      c.sql.includes('pg_advisory_unlock')
    );
    // Release still ran, on the SAME reserved connection as the acquire.
    asserts.assertEquals(lockCalls.length, 2);
    asserts.assertStringIncludes(lockCalls[1]!.sql, 'pg_advisory_unlock');
    asserts.assertEquals(lockCalls[0]!.txId, lockCalls[1]!.txId);
    asserts.assertEquals(pg.commits.length, 1); // connection returned
  });

  it('advisory locks: an acquire timeout throws NormAdvisoryLockError and runs no work', async () => {
    // Postgres poll never sees the lock → loud, and the guarded fn never
    // runs. The reserved connection is still returned to the pool.
    const pg = fakeLockEngine({
      dialect: 'POSTGRES',
      poolMax: 4,
      answers: [{ locked: false }],
    });
    let ran = false;
    await asserts.assertRejects(
      () =>
        pg.ex.withAdvisoryLock('k', 1, () => {
          ran = true;
          return Promise.resolve();
        }),
      NormAdvisoryLockError,
      'not acquired within',
    );
    asserts.assertEquals(ran, false);
    asserts.assertEquals(pg.commits.length, 1);
    // No pg_advisory_unlock — nothing was ever locked.
    asserts.assertEquals(
      pg.calls.some((c) => c.sql.includes('pg_advisory_unlock')),
      false,
    );

    // Maria GET_LOCK returning 0 = refused → same loud error.
    const maria = fakeLockEngine({
      dialect: 'MARIA',
      poolMax: 8,
      answers: [{ locked: 0 }],
    });
    await asserts.assertRejects(
      () => maria.ex.withAdvisoryLock('k', 1_000, () => Promise.resolve()),
      NormAdvisoryLockError,
    );
  });

  it('advisory locks (single-connection): pooled acquire/unlock, naturally affine', async () => {
    // Pool max === 1: the one backend is reused for every statement, so
    // the executor does NOT pin a connection (which would starve fn). The
    // lock/unlock run as ordinary pooled statements (undefined txId).
    const pg = fakeLockEngine({
      dialect: 'POSTGRES',
      poolMax: 1,
      answers: [{ locked: true }],
    });
    await pg.ex.withAdvisoryLock(
      'norm:migrator',
      5_000,
      () => Promise.resolve(),
    );
    const lockCalls = pg.calls.filter((c) =>
      c.sql.includes('pg_try_advisory_lock') ||
      c.sql.includes('pg_advisory_unlock')
    );
    asserts.assertEquals(lockCalls.length, 2);
    asserts.assertEquals(lockCalls[0]!.txId, undefined);
    asserts.assertEquals(lockCalls[1]!.txId, undefined);
    // No manual transaction handle was reserved at max === 1.
    asserts.assertEquals(pg.commits.length, 0);
  });

  it('advisory locks: SQLite / Mongo have none — withAdvisoryLock is loud and runs no work', async () => {
    // SQLite: file-local database — capability false, method loud.
    const lite = fakeLockEngine({
      dialect: 'SQLITE',
      advisoryLock: false,
      poolMax: 1,
      answers: [],
    });
    asserts.assertEquals(lite.ex.capabilities.advisoryLock, false);
    let ran = false;
    await asserts.assertRejects(
      () =>
        lite.ex.withAdvisoryLock('k', 1_000, () => {
          ran = true;
          return Promise.resolve();
        }),
      NormUnsupportedError,
    );
    asserts.assertEquals(ran, false); // capability gate, before any work

    // Mongo: same honesty.
    const { engine: mongo } = fakeMongoEngine();
    const mex = mongoExecutor(mongo);
    asserts.assertEquals(mex.capabilities.advisoryLock, false);
    await asserts.assertRejects(
      () => mex.withAdvisoryLock('k', 1_000, () => Promise.resolve()),
      NormUnsupportedError,
    );
  });

  it('capabilities come from the ENGINE, not its dialect string — an alias engine is honoured', async () => {
    // A real CockroachEngine (constructed, never connected): it reuses the
    // Postgres translator (dialect 'postgres') but declares advisoryLock
    // off. The seam must reflect the ENGINE's capability, not assume every
    // "postgres" server has advisory locks.
    const cr = new CockroachEngine('cr', {
      host: 'h',
      database: 'd',
      username: 'u',
    });
    const ex = sqlExecutor(cr as unknown as AnySQLEngine);
    asserts.assertEquals(ex.capabilities.dialect, 'postgres');
    asserts.assertEquals(ex.capabilities.advisoryLock, false);
    asserts.assertEquals(ex.capabilities.alterColumns, true);
    // Calling it anyway fails closed (no doomed pg_advisory_lock issued).
    await asserts.assertRejects(
      () => ex.withAdvisoryLock('k', 1_000, () => Promise.resolve()),
      NormUnsupportedError,
    );
  });

  it('sqlExecutor dispatches every query type to the matching engine method', async () => {
    const { engine, calls } = fakeSqlEngine();
    const exec = sqlExecutor(engine);
    for (const [type] of DISPATCH) await exec.execute(q(type));
    asserts.assertEquals(calls.map((c) => c.method), DISPATCH.map((d) => d[1]));
    // No txId unless supplied.
    asserts.assertEquals(calls.every((c) => c.txId === undefined), true);
  });

  it('sqlExecutor threads txId through to the engine', async () => {
    const { engine, calls } = fakeSqlEngine();
    const exec = sqlExecutor(engine);
    await exec.execute(q('SELECT'), 'tx-1');
    await exec.execute(q('UPDATE'), 'tx-1');
    asserts.assertEquals(calls.map((c) => c.txId), ['tx-1', 'tx-1']);
  });

  it('sqlExecutor maps capabilities and proxies begin/connect/disconnect', async () => {
    const yes = fakeSqlEngine(true);
    const no = fakeSqlEngine(false);
    asserts.assertEquals(
      sqlExecutor(yes.engine).capabilities.transactions,
      true,
    );
    asserts.assertEquals(
      sqlExecutor(no.engine).capabilities.transactions,
      false,
    );

    const exec = sqlExecutor(yes.engine);
    let sessionId: string | undefined;
    const out = await exec.transaction(async (session: Session) => {
      sessionId = session.id;
      // Nesting delegates to the driver scope's savepoint.
      const inner = await session.savepoint(() => Promise.resolve('sp-ok'));
      asserts.assertEquals(inner, 'sp-ok');
      return 'done';
    });
    asserts.assertEquals(out, 'done');
    asserts.assertEquals(sessionId, 'tx-9');
    asserts.assertEquals(
      yes.calls.some((c) => c.method === 'savepoint'),
      true,
    );

    await exec.connect();
    await exec.disconnect();
    asserts.assertEquals(yes.counts(), { connects: 1, disconnects: 1 });
  });

  it('mongoExecutor dispatches every query type; capabilities are honest', async () => {
    const { engine, calls } = fakeMongoEngine();
    const exec = mongoExecutor(engine);
    asserts.assertEquals(exec.capabilities.transactions, false);
    for (const [type] of DISPATCH) await exec.execute(q(type));
    asserts.assertEquals(calls, DISPATCH.map((d) => d[1]));
    await exec.connect();
    await exec.disconnect();
  });

  it('mongoExecutor: tx-scoped execute and transaction() both throw NormUnsupportedError', async () => {
    const { engine, calls } = fakeMongoEngine();
    const exec = mongoExecutor(engine);
    await asserts.assertRejects(
      // deno-lint-ignore require-await
      async () => await exec.execute(q('SELECT'), 'tx-1'),
      NormUnsupportedError,
    );
    asserts.assertEquals(calls, []); // never reached the engine
    await asserts.assertRejects(
      () => exec.transaction(() => Promise.resolve()),
      NormUnsupportedError,
    );
  });

  it('bindTx stamps the txId on every execute', async () => {
    const seen: Array<string | undefined> = [];
    const inner: Executor = {
      capabilities: {
        transactions: true,
        transactionalDdl: true,
        alterColumns: true,
        alterConstraints: true,
        advisoryLock: false,
        dialect: 'sqlite' as const,
      },
      withAdvisoryLock: <T>(
        _key: string,
        _timeoutMs: number,
        fn: () => Promise<T>,
      ) => fn(),
      // deno-lint-ignore no-explicit-any
      raw: (): Promise<any> =>
        Promise.resolve({ data: [], count: 0, time: 0, isSlow: false }),
      execute: <R extends Row>(_q: ExecutorQuery, txId?: string) => {
        seen.push(txId);
        return Promise.resolve(
          RESULT as unknown as import('@tundralibs/drivers').EngineQueryResult<
            R
          >,
        );
      },
      ddl: () => Promise.resolve(),
      transaction: () => Promise.reject(new Error('unused')),
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
    };
    const bound = bindTx(inner, 'tx-7');
    await bound.execute(q('SELECT'));
    await bound.execute(q('DELETE'), 'tx-7'); // same tx is fine
    asserts.assertEquals(seen, ['tx-7', 'tx-7']);
    asserts.assertEquals(bound.capabilities, inner.capabilities);
    await bound.connect();
    await bound.disconnect();
  });

  it('ddl(): every DDL type dispatches to the matching engine method; capability flags follow the dialect', async () => {
    const { engine, calls } = fakeSqlEngine();
    const exec = sqlExecutor(engine);
    const DDL: Array<[string, string]> = [
      ['CREATE_SCHEMA', 'createSchema'],
      ['CREATE_TABLE', 'createTable'],
      ['ALTER_TABLE', 'alterTable'],
      ['DROP_TABLE', 'dropTable'],
      ['CREATE_VIEW', 'createView'],
      ['DROP_VIEW', 'dropView'],
      ['CREATE_INDEX', 'createIndex'],
      ['DROP_INDEX', 'dropIndex'],
    ];
    for (const [type] of DDL) await exec.ddl(q(type) as never);
    asserts.assertEquals(calls.map((c) => c.method), DDL.map((d) => d[1]));

    // Engine: 'SQLITE' → in-place alters honestly unsupported.
    asserts.assertEquals(exec.capabilities.alterColumns, true);
    const sqlite = sqlExecutor(fakeSqlEngine(false).engine);
    asserts.assertEquals(sqlite.capabilities.alterColumns, false);
    asserts.assertEquals(sqlite.capabilities.alterConstraints, false);

    // Mongo: ddl dispatches too; tx-scoped ddl throws.
    const mongo = fakeMongoEngine();
    const mexec = mongoExecutor(mongo.engine);
    await mexec.ddl(q('CREATE_SCHEMA') as never);
    await mexec.ddl(q('CREATE_TABLE') as never);
    asserts.assertEquals(mongo.calls, ['createSchema', 'createTable']);
    await asserts.assertRejects(
      () => mexec.ddl(q('DROP_TABLE') as never, 'tx-1'),
      NormUnsupportedError,
    );
  });

  it('bindTx rejects cross-transaction execution and nested transaction()', async () => {
    const inner: Executor = {
      capabilities: {
        transactions: true,
        transactionalDdl: true,
        alterColumns: true,
        alterConstraints: true,
        advisoryLock: false,
        dialect: 'sqlite' as const,
      },
      withAdvisoryLock: <T>(
        _key: string,
        _timeoutMs: number,
        fn: () => Promise<T>,
      ) => fn(),
      // deno-lint-ignore no-explicit-any
      raw: (): Promise<any> =>
        Promise.resolve({ data: [], count: 0, time: 0, isSlow: false }),
      execute: () => Promise.reject(new Error('must not reach engine')),
      ddl: () => Promise.resolve(),
      transaction: () => Promise.reject(new Error('unused')),
      connect: () => Promise.resolve(),
      disconnect: () => Promise.resolve(),
    };
    const bound = bindTx(inner, 'tx-7');
    asserts.assertThrows(
      () => bound.execute(q('SELECT'), 'tx-OTHER'),
      NormUnsupportedError,
    );
    await asserts.assertRejects(
      () => bound.transaction(() => Promise.resolve()),
      NormUnsupportedError,
    );
  });
});
