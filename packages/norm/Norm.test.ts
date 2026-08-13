/**
 * Norm facade edges: engine/database config resolution per dialect,
 * lifecycle proxies, transaction capability + commit/rollback failure
 * paths, and crypto helpers without a secret.
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import type {
  EngineQueryResult,
  EngineTransactionOptions,
} from '@tundralibs/drivers';
import {
  Column,
  compileRuntime,
  Entity,
  type Executor,
  type ExecutorQuery,
  Norm,
  NormDb,
  NormUnsupportedError,
  Schema,
  type Session,
  use,
} from './mod.ts';
// `runtimeOf` is the migration seam, not part of the public barrel — the
// test reaches it directly to read the resolved executor's capabilities.
import { runtimeOf } from './Norm.ts';

type Row = Record<string, unknown>;

const Users = Entity('users', {
  id: Column.integer(),
  name: Column.varchar(40),
}, { pk: ['id'] });

/** Tiny executor: enough for lifecycle + transaction paths. */
class StubExecutor implements Executor {
  withAdvisoryLock<T>(
    _key: string,
    _timeoutMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    // Capability is off below, so this stands in as the file-lock-only
    // path: run the guarded work without a server-side lock.
    return fn();
  }
  // deno-lint-ignore no-explicit-any
  raw(sql: string, params?: Record<string, unknown>): Promise<any> {
    this.rawCalls?.push({ sql, params });
    return Promise.resolve({ data: [], count: 0, time: 0, isSlow: false });
  }
  public rawCalls?: Array<{ sql: string; params?: Record<string, unknown> }>;
  public capabilities = {
    transactions: true,
    transactionalDdl: true,
    alterColumns: true,
    alterConstraints: true,
    advisoryLock: false,
    dialect: 'sqlite' as const,
  };
  public connects = 0;
  public disconnects = 0;
  public failCommit = false;
  public failRollback = false;
  public committed: string[] = [];
  public rolledBack: string[] = [];

  execute<R extends Row>(
    q: ExecutorQuery,
    _txId?: string,
  ): Promise<EngineQueryResult<R>> {
    return Promise.resolve(
      {
        type: q.type,
        data: [],
        count: 0,
        time: 1,
        isSlow: false,
      } as unknown as EngineQueryResult<R>,
    );
  }
  async transaction<T>(
    run: (session: Session) => Promise<T>,
    _o?: EngineTransactionOptions,
  ): Promise<T> {
    const id = 'tx-1';
    let result: T;
    try {
      result = await run(this.#session(id));
    } catch (e) {
      // The callback threw → ROLLBACK; a rollback failure is swallowed
      // (driver parity) so the original error surfaces unmasked.
      try {
        if (this.failRollback) throw new Error('rollback-fail');
        this.rolledBack.push(id);
      } catch { /* driver swallows the rollback failure */ }
      throw e;
    }
    if (this.failCommit) throw new Error('commit-fail');
    this.committed.push(id);
    return result;
  }

  #session(id: string): Session {
    return { id, savepoint: (run) => run(this.#session(id)) };
  }
  ddl(): Promise<void> {
    return Promise.resolve();
  }
  connect(): Promise<void> {
    this.connects++;
    return Promise.resolve();
  }
  disconnect(): Promise<void> {
    this.disconnects++;
    return Promise.resolve();
  }
}

function stubDb(exec: Executor = new StubExecutor()) {
  const runtime = compileRuntime(
    use(Schema('S', { Users })),
    {},
    exec,
    () => {},
  );
  return new NormDb<{ Users: typeof Users }>(runtime, exec, undefined);
}

describe('norm.Norm (config + lifecycle + tx edges)', () => {
  let dir = '';
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'norm-test-' });
  });
  afterAll(async () => {
    await removeDir(dir, { recursive: true });
  });

  it('rejects engine AND database together, and unknown dialects', () => {
    asserts.assertThrows(
      () =>
        new Norm({
          engine: {} as never,
          database: { dialect: 'sqlite', path: dir },
        }),
      Error,
      "exactly one of 'engine' or 'database'",
    );
    asserts.assertThrows(
      () =>
        new Norm({
          database: { dialect: 'oracle' } as never,
        }),
      Error,
      "unknown dialect 'oracle'",
    );
  });

  it('database config: sqlite dialect constructs a working engine', async () => {
    const norm = new Norm({
      database: { dialect: 'sqlite', path: dir },
    });
    await norm.connect(); // Norm-level proxy
    const db = norm.use(Schema('S', { Users }));
    asserts.assertEquals(Object.keys(db.entities), ['Users']);
    await norm.disconnect();
  });

  it('forwards the engine connect + query events onto the Norm bus (metadata only)', async () => {
    const connects: string[] = [];
    const queries: Array<{ queryId: string; timeMs: number; isSlow: boolean }> =
      [];
    const norm = new Norm({
      database: { dialect: 'sqlite', path: dir },
      _onconnect: (id) => connects.push(id),
      _onquery: (_engineId, queryId, timeMs, isSlow) =>
        queries.push({ queryId, timeMs, isSlow }),
    });
    await norm.connect();
    const db = norm.use(Schema('S', { Users }));
    // A raw statement reaches engine.execute, which emits the driver
    // `query` event — norm should re-emit it, metadata only.
    await db.raw('SELECT 1 AS n');

    asserts.assertEquals(connects.length >= 1, true);
    asserts.assertEquals(queries.length >= 1, true);
    // Metadata is present; the SQL text / params never appear here.
    asserts.assertEquals(typeof queries[0]!.queryId, 'string');
    asserts.assertEquals(typeof queries[0]!.timeMs, 'number');
    asserts.assertEquals(typeof queries[0]!.isSlow, 'boolean');
    await norm.disconnect();
  });

  it('database config: postgres / maria / mongo dialects construct engines lazily', () => {
    // Construction resolves the dialect branch; nothing connects.
    new Norm({
      database: {
        dialect: 'postgres',
        host: 'localhost',
        username: 'u',
        password: 'p',
        database: 'd',
      } as never,
    });
    new Norm({
      database: {
        dialect: 'maria',
        host: 'localhost',
        username: 'u',
        password: 'p',
        database: 'd',
      } as never,
    });
    new Norm({
      database: {
        dialect: 'mongo',
        uri: 'mongodb://localhost:27017',
        database: 'd',
      } as never,
    });
  });

  it('database config: the fetch-only edge dialects construct engines lazily', () => {
    // neon / turso / d1 are registered by the root barrel exactly like the
    // four original dialects — no import beyond `@tundralibs/norm`, no
    // connection attempted at construction.
    const neon = new Norm({
      database: {
        dialect: 'neon',
        host: 'ep-x.eu-central-1.aws.neon.tech',
        token: 'tok',
      },
    });
    const turso = new Norm({
      database: {
        dialect: 'turso',
        url: 'https://db-org.turso.io',
        authToken: 'tok',
      },
    });
    const d1 = new Norm({
      database: {
        dialect: 'd1',
        accountId: 'acct',
        databaseId: 'db',
        apiToken: 'tok',
      },
    });
    // Each resolved to a SQL executor (not the Mongo one) and reports the
    // dialect family its translator emits: Neon speaks Postgres, Turso and
    // D1 speak SQLite — no oql change was needed for any of them.
    for (
      const [norm, dialect] of [
        [neon, 'postgres'],
        [turso, 'sqlite'],
        [d1, 'sqlite'],
      ] as const
    ) {
      const caps =
        runtimeOf(norm.use(Schema('S', { Users }))).executor.capabilities;
      asserts.assertEquals(caps.dialect, dialect);
      // One-shot HTTP: nothing survives a call, so no transactions.
      asserts.assertEquals(caps.transactions, false);
    }
  });

  it('mongo is detected without an instanceof check on the driver class', () => {
    // `wrap()` keys on the engine's own `Engine` label so `Norm.ts` needs
    // no value import of MongoEngine. A SQL engine must not be routed to
    // the Mongo executor, and vice versa.
    const mongo = new Norm({
      database: {
        dialect: 'mongo',
        uri: 'mongodb://localhost:27017',
        database: 'd',
      } as never,
    });
    const sqlite = new Norm({ database: { dialect: 'sqlite', path: dir } });
    asserts.assertEquals(
      runtimeOf(mongo.use(Schema('S', { Users }))).executor.capabilities
        .dialect,
      'mongo',
    );
    asserts.assertEquals(
      runtimeOf(sqlite.use(Schema('S', { Users }))).executor.capabilities
        .dialect,
      'sqlite',
    );
  });

  it('NormDb: entities getter, lifecycle proxies', async () => {
    const exec = new StubExecutor();
    const db = stubDb(exec);
    asserts.assertEquals(Object.keys(db.entities), ['Users']);
    asserts.assertEquals(db.inTransaction, false);
    await db.connect();
    await db.disconnect();
    asserts.assertEquals(exec.connects, 1);
    asserts.assertEquals(exec.disconnects, 1);
  });

  it('transaction: engine without transaction support throws up front', async () => {
    const exec = new StubExecutor();
    exec.capabilities = {
      transactions: false,
      transactionalDdl: false,
      alterColumns: true,
      alterConstraints: true,
      advisoryLock: false,
      dialect: 'sqlite' as const,
    };
    const db = stubDb(exec);
    await asserts.assertRejects(
      () => db.transaction(() => Promise.resolve(0)),
      NormUnsupportedError,
    );
  });

  it('transaction: a commit-time failure surfaces, and is not counted as a rollback', async () => {
    const exec = new StubExecutor();
    exec.failCommit = true;
    const db = stubDb(exec);
    await asserts.assertRejects(
      () => db.transaction(() => Promise.resolve('ok')),
      Error,
      'commit-fail',
    );
    // The driver owns the lifecycle: a COMMIT failure is not a rollback
    // (the data may be on the wire), so nothing committed and nothing
    // rolled back at the seam.
    asserts.assertEquals(exec.committed, []);
    asserts.assertEquals(exec.rolledBack, []);
  });

  it('encrypt/decrypt without a secret fail with a clear message; hash still works', async () => {
    const db = stubDb();
    await asserts.assertRejects(
      () => db.encrypt('x'),
      Error,
      "no 'secret' was supplied",
    );
    await asserts.assertRejects(
      () => db.decrypt('x'),
      Error,
      "no 'secret' was supplied",
    );
    const digest = await db.hash('x');
    asserts.assertMatch(digest, /^[0-9a-f]{64}$/);
  });
});
