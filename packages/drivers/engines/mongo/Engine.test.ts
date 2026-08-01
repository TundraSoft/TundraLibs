import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import { envArgs } from '@tundralibs/utils';
import { MongoEngine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';

const env = envArgs('./packages/drivers/');

const TEST_CONFIG = {
  host: env.get('MONGO_HOST') || 'localhost',
  port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
  username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') || undefined,
  password: env.get('MONGO_PASSWORD') || undefined,
  // Root user (MONGO_INITDB_ROOT_*) authenticates against `admin`; set only
  // when MONGO_AUTHSOURCE is provided so local anon runs are untouched.
  authSource: env.get('MONGO_AUTHSOURCE') || undefined,
  // CI sets DB_SCHEMA to isolate this suite from NORM's, which runs in
  // parallel against the same container (Option A); local keeps MONGO_DB.
  database: env.get('DB_SCHEMA')
    ? `${env.get('DB_SCHEMA')}_drivers`
    : env.get('MONGO_DB') || 'tundra_test',
};

async function isMongoAvailable(): Promise<boolean> {
  const probe = new MongoEngine('mongo-probe', TEST_CONFIG);
  try {
    await probe.connect();
    const ok = await probe.ping();
    await probe.disconnect();
    return ok;
  } catch {
    try {
      await probe.disconnect();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const mongoAvailable = await isMongoAvailable();

let collCounter = 0;
const colName = (label: string) =>
  `tundra_test_${label}_${Date.now()}_${++collCounter}`;

describe({
  name: 'drivers.MongoEngine',
  ignore: !mongoAvailable,
  fn: () => {
    describe('configuration', () => {
      it('should expose Engine and Capabilities', () => {
        const engine = new MongoEngine('cfg-1', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'MONGO');
        // Mongo uses its own internal pool so we declare pooledConnections=false.
        asserts.assertEquals(engine.Capabilities.pooledConnections, false);
      });

      it('should default port to 27017', () => {
        const { port: _port, ...rest } = TEST_CONFIG;
        const engine = new MongoEngine('cfg-2', rest);
        asserts.assertEquals(engine.getOption('port'), 27017);
      });

      it('should require host or uri', () => {
        asserts.assertThrows(
          // deno-lint-ignore no-explicit-any
          () => new MongoEngine('cfg-3', { database: 'x' } as any),
          EngineError,
        );
      });
    });

    describe('lifecycle', () => {
      it('should connect, ping, and disconnect', async () => {
        const engine = new MongoEngine('life-1', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should be idempotent on repeated connect/disconnect', async () => {
        const engine = new MongoEngine('life-2', TEST_CONFIG);
        await engine.connect();
        await engine.connect();
        await engine.disconnect();
        await engine.disconnect();
      });
    });

    describe('CRUD', () => {
      it('insertOne / findOne should round-trip', async () => {
        const engine = new MongoEngine('crud-1', TEST_CONFIG);
        const coll = colName('roundtrip');
        try {
          const id = await engine.insertOne(coll, {
            name: 'Alice',
            age: 30,
          });
          asserts.assertExists(id);
          const found = await engine.findOne<{ name: string }>(coll, {
            name: 'Alice',
          });
          asserts.assertEquals(found?.name, 'Alice');
        } finally {
          await engine.deleteMany(coll, {});
          await engine.disconnect();
        }
      });

      it('insertMany / find should return docs in sort order', async () => {
        const engine = new MongoEngine('crud-2', TEST_CONFIG);
        const coll = colName('many');
        try {
          await engine.insertMany(coll, [
            { name: 'Alice', age: 30 },
            { name: 'Bob', age: 25 },
            { name: 'Charlie', age: 35 },
          ]);
          const all = await engine.find<{ name: string; age: number }>(
            coll,
            {},
            { sort: { age: 1 } },
          );
          asserts.assertEquals(all.map((d) => d.name), [
            'Bob',
            'Alice',
            'Charlie',
          ]);
        } finally {
          await engine.deleteMany(coll, {});
          await engine.disconnect();
        }
      });

      it('countDocuments should match insert count', async () => {
        const engine = new MongoEngine('crud-3', TEST_CONFIG);
        const coll = colName('count');
        try {
          await engine.insertMany(coll, [
            { x: 1 },
            { x: 2 },
            { x: 3 },
          ]);
          asserts.assertEquals(await engine.countDocuments(coll), 3);
          asserts.assertEquals(
            await engine.countDocuments(coll, { x: { $gte: 2 } }),
            2,
          );
        } finally {
          await engine.deleteMany(coll, {});
          await engine.disconnect();
        }
      });

      it('updateOne / updateMany should modify matching docs', async () => {
        const engine = new MongoEngine('crud-4', TEST_CONFIG);
        const coll = colName('update');
        try {
          await engine.insertMany(coll, [
            { name: 'A', score: 1 },
            { name: 'B', score: 1 },
            { name: 'C', score: 2 },
          ]);
          asserts.assertEquals(
            await engine.updateOne(
              coll,
              { name: 'A' },
              { $set: { score: 100 } },
            ),
            1,
          );
          asserts.assertEquals(
            await engine.updateMany(
              coll,
              { score: 1 },
              { $set: { active: true } },
            ),
            1,
          );
          const a = await engine.findOne<{ score: number; active: boolean }>(
            coll,
            { name: 'A' },
          );
          asserts.assertEquals(a?.score, 100);
        } finally {
          await engine.deleteMany(coll, {});
          await engine.disconnect();
        }
      });

      it('deleteOne / deleteMany should remove matching docs', async () => {
        const engine = new MongoEngine('crud-5', TEST_CONFIG);
        const coll = colName('delete');
        try {
          await engine.insertMany(coll, [
            { x: 1 },
            { x: 1 },
            { x: 2 },
          ]);
          asserts.assertEquals(await engine.deleteOne(coll, { x: 1 }), 1);
          asserts.assertEquals(
            await engine.deleteMany(coll, { x: { $exists: true } }),
            2,
          );
          asserts.assertEquals(await engine.countDocuments(coll), 0);
        } finally {
          await engine.deleteMany(coll, {});
          await engine.disconnect();
        }
      });
    });

    describe('aggregation', () => {
      it('should run a simple pipeline', async () => {
        const engine = new MongoEngine('agg-1', TEST_CONFIG);
        const coll = colName('agg');
        try {
          await engine.insertMany(coll, [
            { dept: 'eng', salary: 100 },
            { dept: 'eng', salary: 200 },
            { dept: 'sales', salary: 300 },
          ]);
          const result = await engine.aggregate<{ _id: string; total: number }>(
            coll,
            [
              { $group: { _id: '$dept', total: { $sum: '$salary' } } },
              { $sort: { _id: 1 } },
            ],
          );
          asserts.assertEquals(result.length, 2);
          asserts.assertEquals(result[0]?._id, 'eng');
          asserts.assertEquals(result[0]?.total, 300);
        } finally {
          await engine.deleteMany(coll, {});
          await engine.disconnect();
        }
      });
    });

    describe('error mapping', () => {
      it('should map duplicate _id to DUPLICATE_KEY', async () => {
        const engine = new MongoEngine('err-1', TEST_CONFIG);
        const coll = colName('dup');
        try {
          await engine.insertOne(coll, { _id: 1, name: 'A' });
          try {
            await engine.insertOne(coll, { _id: 1, name: 'B' });
            asserts.fail('expected DUPLICATE_KEY');
          } catch (e) {
            asserts.assertInstanceOf(e, EngineError);
            asserts.assertEquals(
              (e as EngineError).code,
              'DUPLICATE_KEY',
            );
          }
        } finally {
          await engine.deleteMany(coll, {});
          await engine.disconnect();
        }
      });
    });
  },
});

// Runs without a live Mongo — exercises the pure URI-builder guard.
describe('drivers.MongoEngine.__buildUri', () => {
  // `__buildUri` is private; reach it through bracket access for the test.
  const buildUri = (engine: MongoEngine): string =>
    (engine as unknown as { __buildUri(): string }).__buildUri();

  it('should build a plain mongodb:// uri for a bare host', () => {
    const engine = new MongoEngine('uri-ok', {
      host: 'db.internal',
      port: 27017,
      database: 'app',
    });
    asserts.assertEquals(buildUri(engine), 'mongodb://db.internal:27017/app');
  });

  it('should accept an IPv4 host and bracketed IPv6 host', () => {
    const v4 = new MongoEngine('uri-v4', { host: '10.1.10.3', port: 27017 });
    asserts.assert(buildUri(v4).startsWith('mongodb://10.1.10.3:27017/'));
    const v6 = new MongoEngine('uri-v6', { host: '[::1]', port: 27017 });
    asserts.assert(buildUri(v6).startsWith('mongodb://[::1]:27017/'));
  });

  it('should reject hosts that could inject extra uri options or authority', () => {
    for (
      const bad of [
        'evil.com/?authSource=admin',
        'a@attacker.com',
        'host?retryWrites=false',
        'host#frag',
        'has space',
      ]
    ) {
      const engine = new MongoEngine('uri-bad', { host: bad, port: 27017 });
      const err = asserts.assertThrows(
        () => buildUri(engine),
        EngineError,
      );
      asserts.assertEquals((err as EngineError).code, 'INVALID_CONFIG_VALUE');
    }
  });

  it('should return the explicit uri verbatim (no host validation)', () => {
    const engine = new MongoEngine('uri-explicit', {
      uri: 'mongodb+srv://user:pass@cluster.example.com/db?retryWrites=true',
    });
    asserts.assertEquals(
      buildUri(engine),
      'mongodb+srv://user:pass@cluster.example.com/db?retryWrites=true',
    );
  });
});

// Regression (round-3 finding): concurrent first operations on a cold engine
// used to race `connect()` — the second caller short-circuited on the status
// check while `__client` was still null and threw NO_CONNECTION on a healthy
// server. `_connectClient` is a test seam so the race is reproducible offline.
describe('drivers.MongoEngine - concurrent connect (offline)', () => {
  // A stand-in `MongoClient`: enough surface for `client()`, `disconnect()`,
  // and the `findOne`/`insertOne` dispatch through `__run`.
  const makeFakeClient = () => {
    const collection = {
      // deno-lint-ignore no-explicit-any
      findOne: (_filter: any) => Promise.resolve({ _id: 'x', hit: true }),
      insertOne: (_doc: unknown) =>
        Promise.resolve({ acknowledged: true, insertedId: 'x' }),
    };
    return {
      db: () => ({ collection: () => collection }),
      close: () => Promise.resolve(),
    };
  };

  /** MongoEngine whose client factory is a controllable, genuinely-async fake. */
  class RaceMongoEngine extends MongoEngine {
    public connectCalls = 0;
    public readonly fakeClient = makeFakeClient();
    // deno-lint-ignore no-explicit-any
    protected override _connectClient(): Promise<any> {
      this.connectCalls++;
      // Resolve on a later tick so both concurrent callers are already parked
      // when the client materialises — the exact window the bug lived in.
      return new Promise((resolve) =>
        setTimeout(() => resolve(this.fakeClient), 15)
      );
    }
  }

  it('joins the in-flight connect instead of returning a null client', async () => {
    const engine = new RaceMongoEngine('race-client', {
      host: 'db.internal',
      database: 'app',
    });
    const [a, b] = await Promise.all([engine.client(), engine.client()]);
    // Both callers get the SAME, non-null client (buggy code handed the
    // second caller `this.__client!` while it was still null).
    asserts.assert(a !== null && a !== undefined);
    asserts.assertStrictEquals(a, b);
    asserts.assertStrictEquals(engine.connectCalls, 1);
    await engine.disconnect();
  });

  it('concurrent first operations both succeed (no NO_CONNECTION)', async () => {
    const engine = new RaceMongoEngine('race-ops', {
      host: 'db.internal',
      database: 'app',
    });
    // Fan-out at boot — the finding's headline scenario.
    const [found, inserted] = await Promise.all([
      engine.findOne('users', { id: 1 }),
      engine.insertOne('audit', { event: 'boot' }),
    ]);
    asserts.assertEquals((found as { hit: boolean }).hit, true);
    asserts.assertEquals(inserted, 'x');
    asserts.assertStrictEquals(engine.connectCalls, 1);
    await engine.disconnect();
  });

  it('propagates a connect failure to every joined caller', async () => {
    class FailingMongoEngine extends MongoEngine {
      // deno-lint-ignore no-explicit-any
      protected override _connectClient(): Promise<any> {
        return new Promise((_resolve, reject) =>
          setTimeout(() => reject(new Error('server unreachable')), 15)
        );
      }
    }
    const engine = new FailingMongoEngine('race-fail', {
      host: 'db.internal',
      database: 'app',
    });
    const results = await Promise.allSettled([
      engine.connect(),
      engine.connect(),
    ]);
    // Neither joined caller is told "connected" while the attempt failed.
    for (const r of results) {
      asserts.assertStrictEquals(r.status, 'rejected');
    }
    asserts.assertStrictEquals(engine.status, 'CLOSED');
  });
});

// Regression (C-mongo FIX 1): a `disconnect()` that lands while `connect()` is
// still in flight (status CONNECTING, `__client` still null) used to inspect
// only `__client` — closing nothing, flipping to CLOSED — and then the resuming
// attempt unconditionally installed a live client + flipped status back to
// READY, orphaning a MongoClient that was never closed. `_connectClient` is a
// test seam so the race is reproducible offline, with NO live Mongo.
describe('drivers.MongoEngine - disconnect during in-flight connect (offline)', () => {
  // Fake client with a `close()` spy so we can assert the racing connect's
  // live client is actually closed (not orphaned).
  const makeSpyClient = () => {
    const spy = {
      closeCalls: 0,
      db: () => ({ collection: () => ({}) }),
      close: () => {
        spy.closeCalls++;
        return Promise.resolve();
      },
    };
    return spy;
  };

  /** Its `_connectClient` resolves on a later tick, so a `disconnect()` issued
   * in the same turn lands squarely in the CONNECTING/null-client window. */
  class SlowConnectEngine extends MongoEngine {
    public connectCalls = 0;
    public readonly spyClient = makeSpyClient();
    // deno-lint-ignore no-explicit-any
    protected override _connectClient(): Promise<any> {
      this.connectCalls++;
      return new Promise((resolve) =>
        setTimeout(() => resolve(this.spyClient), 15)
      );
    }
  }

  it('awaited race: disconnect joins the connect, closes the client, ends CLOSED', async () => {
    const engine = new SlowConnectEngine('disc-await', {
      host: 'db.internal',
      database: 'app',
    });
    // Both kicked off in the same turn: disconnect() sees the in-flight
    // `__connecting` (set synchronously by connect before it yields) and
    // joins it rather than racing an as-yet-null client.
    await Promise.all([engine.connect(), engine.disconnect()]);
    // The live client the connect installed IS closed, and status is CLOSED —
    // not stuck READY on an orphaned MongoClient.
    asserts.assertStrictEquals(engine.status, 'CLOSED');
    asserts.assertStrictEquals(engine.spyClient.closeCalls, 1);
    asserts.assertStrictEquals(engine.connectCalls, 1);
  });

  it('not-awaited race: connect() left pending, disconnect() awaited alone', async () => {
    const engine = new SlowConnectEngine('disc-noawait', {
      host: 'db.internal',
      database: 'app',
    });
    const connecting = engine.connect(); // deliberately not awaited yet
    await engine.disconnect(); // joins the in-flight attempt, then closes it
    await connecting; // let the attempt settle
    asserts.assertStrictEquals(engine.status, 'CLOSED');
    asserts.assertStrictEquals(engine.spyClient.closeCalls, 1);
    asserts.assertStrictEquals(engine.connectCalls, 1);
  });
});

// Regression (C-mongo FIX 2): the update/upsert return sites reported Mongo's
// `modifiedCount`, so an UPDATE matching a row whose `$set` values already
// equal the stored values returned 0 — while all three SQL engines report
// matched=1 for the identical no-op UPDATE. The fix returns matched (found)
// rows. Exercised offline via a fake client whose update results carry
// matchedCount > modifiedCount; NO live Mongo required.
describe('drivers.MongoEngine - update reports matched (found) rows (offline)', () => {
  /** Fake client whose update/upsert calls return a caller-supplied result
   * shape, so we can model the matched-but-unmodified case. */
  class MatchedUpdateEngine extends MongoEngine {
    // deno-lint-ignore no-explicit-any
    public result: any = {
      matchedCount: 1,
      modifiedCount: 0,
      upsertedCount: 0,
    };
    // deno-lint-ignore no-explicit-any
    protected override _connectClient(): Promise<any> {
      const result = () => this.result;
      return Promise.resolve({
        db: () => ({
          collection: () => ({
            updateOne: () => Promise.resolve(result()),
            updateMany: () => Promise.resolve(result()),
            bulkWrite: () => Promise.resolve(result()),
          }),
        }),
        close: () => Promise.resolve(),
      });
    }
  }

  it('updateOne on a matched-but-unchanged doc returns 1 (matched), not 0 (modified)', async () => {
    const engine = new MatchedUpdateEngine('upd-one', {
      host: 'db.internal',
      database: 'app',
    });
    // matchedCount 1, modifiedCount 0 → the old code returned 0.
    const n = await engine.updateOne('users', { _id: 1 }, {
      $set: { a: 1 },
    });
    asserts.assertStrictEquals(n, 1);
    await engine.disconnect();
  });

  it('updateMany on matched-but-unchanged docs returns the matched count, not modified', async () => {
    const engine = new MatchedUpdateEngine('upd-many', {
      host: 'db.internal',
      database: 'app',
    });
    engine.result = { matchedCount: 3, modifiedCount: 0, upsertedCount: 0 };
    const n = await engine.updateMany('users', { a: 1 }, {
      $set: { a: 1 },
    });
    asserts.assertStrictEquals(n, 3);
    await engine.disconnect();
  });

  it('bulkUpsert returns matched + upserted (found) rows, not modified + upserted', async () => {
    const engine = new MatchedUpdateEngine('upd-bulk', {
      host: 'db.internal',
      database: 'app',
    });
    // 2 matched (unchanged) + 1 upserted → 3. Old code (modifiedCount 0 + 1)
    // would have returned 1.
    engine.result = { matchedCount: 2, modifiedCount: 0, upsertedCount: 1 };
    const n = await engine.bulkUpsert('users', [
      { filter: { _id: 1 }, update: { $set: { a: 1 } } },
      { filter: { _id: 2 }, update: { $set: { a: 1 } } },
      { filter: { _id: 3 }, update: { $set: { a: 1 } } },
    ]);
    asserts.assertStrictEquals(n, 3);
    await engine.disconnect();
  });
});
