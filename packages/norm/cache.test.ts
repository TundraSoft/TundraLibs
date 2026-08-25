/**
 * Read-query cache: hit/miss, the type-preserving codec, per-call
 * `noCache`, write + manual invalidation, the never-cache rules
 * (joins/aggregates/transactions), transaction-deferred pruning,
 * VIEW/QUERY dependency invalidation, multi-connection isolation, and
 * the compose-time encryption guard. All in-process (MEMORY cacher +
 * a mock executor) — no database required.
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { AbstractEngine, Cacher } from '@tundralibs/cacher';
import type { CacheValue } from '@tundralibs/cacher';
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
  NormDb,
  NormError,
  type NormEvents,
  Schema,
  type Session,
  use,
} from './mod.ts';
import {
  decodeFromCache,
  encodeForCache,
  type NormCacheConfig,
} from './cache.ts';
import type { AnyDefinition } from './definition/mod.ts';

type Row = Record<string, unknown>;

/** Executor that records every query and serves canned SELECT rows, with
 * a working callback-style transaction. */
class MockExec implements Executor {
  public calls: ExecutorQuery[] = [];
  public selectRows: Row[] = [];
  public countValue = 5;
  public committed = 0;
  public rolledBack = 0;

  public selects(): number {
    return this.calls.filter((c) => c.type === 'SELECT').length;
  }
  public counts(): number {
    return this.calls.filter((c) => c.type === 'COUNT').length;
  }

  public capabilities = {
    transactions: true,
    transactionalDdl: true,
    alterColumns: true,
    alterConstraints: true,
    advisoryLock: false,
    dialect: 'sqlite' as const,
  };

  execute<R extends Row>(
    q: ExecutorQuery,
    _txId?: string,
  ): Promise<EngineQueryResult<R>> {
    this.calls.push(q);
    const make = (data: Row[], count?: number) =>
      Promise.resolve(
        {
          type: q.type,
          data: data as R[],
          count: count ?? data.length,
          time: 1,
          isSlow: false,
        } as unknown as EngineQueryResult<R>,
      );
    switch (q.type) {
      case 'SELECT':
        return make(this.selectRows.map((r) => ({ ...r })));
      case 'COUNT':
        return make([{ Count: String(this.countValue) }]);
      case 'INSERT':
      case 'UPSERT': {
        const rows = (q as unknown as { data: Row | Row[] }).data;
        const arr = Array.isArray(rows) ? rows : [rows];
        return make(arr.map((r) => ({ ...r })));
      }
      case 'UPDATE':
      case 'DELETE':
        return make([], 1);
      default:
        return make([]);
    }
  }
  async transaction<T>(
    run: (session: Session) => Promise<T>,
    _o?: EngineTransactionOptions,
  ): Promise<T> {
    const session: Session = {
      id: 'tx-1',
      savepoint: (fn) => fn(session),
    };
    try {
      const r = await run(session);
      this.committed++;
      return r;
    } catch (e) {
      this.rolledBack++;
      throw e;
    }
  }
  withAdvisoryLock<T>(
    _k: string,
    _t: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    return fn();
  }
  // deno-lint-ignore no-explicit-any
  raw(): Promise<any> {
    return Promise.resolve({ data: [], count: 0, time: 0, isSlow: false });
  }
  ddl(): Promise<void> {
    return Promise.resolve();
  }
  connect(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

// A cacher engine whose every operation fails at init — stands in for
// an unreachable Redis/Memcached so we can prove the cache degrades to
// the database instead of taking the query down with it.
class FailingCacher extends AbstractEngine {
  public readonly Engine = 'FAILING';
  public override init(): Promise<void> {
    return Promise.reject(new Error('backend down'));
  }
  protected _set(): Promise<void> {
    return Promise.reject(new Error('backend down'));
  }
  protected _get(): Promise<CacheValue | undefined> {
    return Promise.reject(new Error('backend down'));
  }
  protected _has(): Promise<boolean> {
    return Promise.reject(new Error('backend down'));
  }
  protected _delete(): Promise<void> {
    return Promise.reject(new Error('backend down'));
  }
  protected _clear(): Promise<void> {
    return Promise.reject(new Error('backend down'));
  }
}
try {
  // deno-lint-ignore no-explicit-any
  Cacher.addEngine('FAILING', FailingCacher as any);
} catch { /* already registered in this process */ }

// A fresh connection name per test keeps the process-global MEMORY cacher
// namespaces isolated (Cacher instances live in a singleton registry).
let connSeq = 0;
const nextConn = () => `normcachetest${++connSeq}`;

type Events = Array<{ event: keyof NormEvents; args: unknown[] }>;

function setup<R extends Record<string, AnyDefinition>>(
  schema: R,
  cache: NormCacheConfig | undefined,
  opts: { secret?: string } = {},
) {
  const exec = new MockExec();
  const events: Events = [];
  const runtime = compileRuntime(
    use(Schema('S', schema as Record<string, AnyDefinition>)),
    { secret: opts.secret },
    exec,
    (event, ...args) => events.push({ event, args }),
    undefined,
    cache,
  );
  const db = new NormDb<R>(runtime, exec);
  return { exec, events, db };
}

const Users = Entity('users', {
  id: Column.integer(),
  name: Column.varchar(40),
}, { pk: ['id'], cache: 5 });

const NoCacheUsers = Entity('users', {
  id: Column.integer(),
  name: Column.varchar(40),
}, { pk: ['id'] }); // no cache

describe('norm read cache', () => {
  describe('codec', () => {
    it('round-trips Date / bigint / Uint8Array and nested json', () => {
      const value = {
        s: 'x',
        n: 42,
        b: true,
        nul: null,
        when: new Date('2020-01-02T03:04:05.678Z'),
        big: 90071992547409910n,
        bytes: new Uint8Array([1, 2, 3, 255]),
        nested: { list: [new Date('2021-06-07T00:00:00.000Z'), 7n] },
      };
      // Mirror cacher's own JSON persistence round-trip.
      const revived = decodeFromCache(
        JSON.parse(JSON.stringify(encodeForCache(value))),
      ) as typeof value;
      asserts.assertInstanceOf(revived.when, Date);
      asserts.assertEquals(revived.when.getTime(), value.when.getTime());
      asserts.assertEquals(typeof revived.big, 'bigint');
      asserts.assertEquals(revived.big, value.big);
      asserts.assertInstanceOf(revived.bytes, Uint8Array);
      asserts.assertEquals([...revived.bytes], [1, 2, 3, 255]);
      asserts.assertInstanceOf(revived.nested.list[0], Date);
      asserts.assertEquals(revived.nested.list[1], 7n);
    });
  });

  describe('hit / miss', () => {
    it('serves a second identical read from cache and emits cacheHit', async () => {
      const { db, exec, events } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      const users = db.repo('Users');
      exec.selectRows = [{ id: 1, name: 'a' }];

      const r1 = await users.find();
      asserts.assertEquals(exec.selects(), 1);
      asserts.assertEquals(r1.data, [{ id: 1, name: 'a' }]);

      const r2 = await users.find();
      asserts.assertEquals(exec.selects(), 1, 'second read must hit the cache');
      asserts.assertEquals(r2.data, [{ id: 1, name: 'a' }]);
      asserts.assertEquals(
        events.filter((e) => e.event === 'cacheHit').length,
        1,
      );
      // A cache hit does NOT emit a `call` (nothing executed).
      asserts.assertEquals(events.filter((e) => e.event === 'call').length, 1);
    });

    it('preserves Date and bigint column values across a cache hit', async () => {
      const Events = Entity('events', {
        id: Column.integer(),
        at: Column.varchar(40),
        big: Column.integer(),
      }, { pk: ['id'], cache: 5 });
      const { db, exec } = setup({ Events }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      const at = new Date('2020-05-05T05:05:05.000Z');
      exec.selectRows = [{ id: 1, at, big: 123456789012345678n }];

      await db.repo('Events').find(); // miss → populate
      exec.selectRows = []; // the DB would now return nothing…
      const hit = await db.repo('Events').find(); // …so this MUST be a hit
      asserts.assertEquals(exec.selects(), 1, 'value came through the cache');
      const row = hit.data[0] as { at: unknown; big: unknown };
      asserts.assertInstanceOf(row.at, Date);
      asserts.assertEquals((row.at as Date).getTime(), at.getTime());
      asserts.assertEquals(row.big, 123456789012345678n);
    });

    it('does nothing when no cache is configured', async () => {
      const { db, exec } = setup({ Users: NoCacheUsers }, undefined);
      exec.selectRows = [{ id: 1, name: 'a' }];
      await db.repo('Users').find();
      await db.repo('Users').find();
      asserts.assertEquals(exec.selects(), 2);
    });

    it('does nothing for an entity that did not opt in (cache: 0)', async () => {
      const { db, exec } = setup({ Users: NoCacheUsers }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      await db.repo('Users').find();
      await db.repo('Users').find();
      asserts.assertEquals(exec.selects(), 2);
    });

    it('caches distinct filters separately', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      const users = db.repo('Users');
      exec.selectRows = [{ id: 1, name: 'a' }];
      await users.find({ '@id': 1 });
      await users.find({ '@id': 2 });
      asserts.assertEquals(exec.selects(), 2, 'different filters → 2 misses');
      await users.find({ '@id': 1 });
      asserts.assertEquals(exec.selects(), 2, 'repeat of first filter → hit');
    });

    it('caches a single-table aggregate (no join)', async () => {
      const Sales = Entity('sales', {
        id: Column.integer(),
        country: Column.varchar(2),
        amount: Column.integer(),
      }, { pk: ['id'], cache: 5 });
      const { db, exec, events } = setup({ Sales }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ country: 'BR', total: 10 }];
      await db.repo('Sales').find(undefined, {
        project: { '@country': true },
        aggregates: { total: { fn: 'SUM', column: '@amount' } },
      });
      await db.repo('Sales').find(undefined, {
        project: { '@country': true },
        aggregates: { total: { fn: 'SUM', column: '@amount' } },
      });
      asserts.assertEquals(exec.selects(), 1, 'join-free aggregate is cached');
      asserts.assertEquals(
        events.filter((e) => e.event === 'warning').length,
        0,
        'no cache-skip for a join-free aggregate',
      );
    });
  });

  describe('noCache', () => {
    it('bypasses the read and does not populate', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      const users = db.repo('Users');
      exec.selectRows = [{ id: 1, name: 'a' }];
      await users.find(undefined, { noCache: true }); // execute, no populate
      asserts.assertEquals(exec.selects(), 1);
      await users.find(); // still a miss (nothing was populated)
      asserts.assertEquals(exec.selects(), 2);
      await users.find(); // now cached
      asserts.assertEquals(exec.selects(), 2);
    });
  });

  describe('write invalidation', () => {
    for (
      const w of ['insert', 'update', 'delete', 'upsert', 'truncate'] as const
    ) {
      it(`${w} prunes the entity's cache`, async () => {
        const { db, exec } = setup({ Users }, {
          engine: 'MEMORY',
          name: nextConn(),
        });
        const users = db.repo('Users');
        exec.selectRows = [{ id: 1, name: 'a' }];
        await users.find();
        await users.find();
        asserts.assertEquals(exec.selects(), 1, 'cached before write');

        if (w === 'insert') await users.insert({ id: 2, name: 'b' });
        else if (w === 'update') {
          await users.update({ name: 'z' }, { '@id': 1 });
        } else if (w === 'delete') await users.delete({ '@id': 1 });
        else if (w === 'upsert') {
          await users.upsert({ id: 2, name: 'b' }, { conflictKeys: ['id'] });
        } else await users.truncate();

        await users.find();
        asserts.assertEquals(exec.selects(), 2, `${w} should have pruned`);
      });
    }
  });

  describe('never cached', () => {
    const Items = Entity('items', {
      id: Column.integer(),
      ownerId: Column.integer(),
      label: Column.varchar(40),
    }, {
      pk: ['id'],
      cache: 5,
      fk: { Owner: { model: 'Owners', on: { ownerId: 'id' } } },
    });
    const Owners = Entity('owners', {
      id: Column.integer(),
      name: Column.varchar(40),
    }, { pk: ['id'] });

    it('does not cache a joined (projected relation) read and warns', async () => {
      const { db, exec, events } = setup({ Items, Owners }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      const items = db.repo('Items');
      exec.selectRows = [];
      await items.find(undefined, { project: { '@id': true, '@Owner': true } });
      await items.find(undefined, { project: { '@id': true, '@Owner': true } });
      asserts.assertEquals(exec.selects(), 2, 'joined reads are never cached');
      const skips = events.filter((e) =>
        e.event === 'warning' && e.args[2] === 'cache-skip'
      );
      asserts.assertEquals(skips.length, 2);
    });

    it('bypasses the cache inside a transaction (read + write)', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      // Prime the cache outside the transaction.
      await db.repo('Users').find();
      await db.repo('Users').find();
      asserts.assertEquals(exec.selects(), 1);

      await db.transaction(async (tx) => {
        // In-tx read must not be served from (or poison) the cache.
        await tx.repo('Users').find();
        asserts.assertEquals(exec.selects(), 2, 'in-tx read bypasses cache');
        await tx.repo('Users').find();
        asserts.assertEquals(exec.selects(), 3, 'in-tx reads never populate');
      });
    });
  });

  describe('transaction pruning', () => {
    it('prunes on commit, not before', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      await db.repo('Users').find(); // populate
      await db.transaction(async (tx) => {
        await tx.repo('Users').insert({ id: 2, name: 'b' });
      });
      // Committed → the outside cache is now pruned.
      await db.repo('Users').find();
      asserts.assertEquals(exec.selects(), 2, 'commit pruned the cache');
    });

    it('does NOT prune on rollback', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      await db.repo('Users').find(); // populate
      await asserts.assertRejects(() =>
        db.transaction(async (tx) => {
          await tx.repo('Users').insert({ id: 2, name: 'b' });
          throw new Error('boom');
        })
      );
      // Rolled back → nothing changed → the cache is still valid.
      await db.repo('Users').find();
      asserts.assertEquals(exec.selects(), 1, 'rollback left the cache intact');
    });
  });

  describe('count / getByPK', () => {
    it('caches count and invalidates it on write', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      const users = db.repo('Users');
      exec.countValue = 7;
      const c1 = await users.count();
      const c2 = await users.count();
      asserts.assertEquals(c1.count, 7);
      asserts.assertEquals(c2.count, 7);
      asserts.assertEquals(exec.counts(), 1, 'second count is a cache hit');
      await users.insert({ id: 1, name: 'a' });
      await users.count();
      asserts.assertEquals(exec.counts(), 2, 'write pruned the count');
    });

    it('caches getByPK (rides find)', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      const users = db.repo('Users');
      exec.selectRows = [{ id: 1, name: 'a' }];
      await users.getByPK({ id: 1 });
      await users.getByPK({ id: 1 });
      asserts.assertEquals(exec.selects(), 1, 'second getByPK is a hit');
    });
  });

  describe('view / query dependency invalidation', () => {
    const Owners = Entity('owners', {
      id: Column.integer(),
      name: Column.varchar(40),
    }, { pk: ['id'] });
    const VOwners = Entity('v_owners', {
      id: Column.integer(),
      name: Column.varchar(40),
    }, {
      type: 'VIEW',
      cache: 5,
      query: {
        type: 'SELECT',
        table: 'owners',
        columns: ['id', 'name'],
        projection: { '@id': true, '@name': true },
      },
    });
    const QOwners = Entity('q_owners', {
      name: Column.varchar(40),
    }, {
      type: 'QUERY',
      cache: 5,
      query: {
        type: 'SELECT',
        table: 'v_owners',
        columns: ['name'],
        projection: { '@name': true },
      },
    });

    it('prunes a VIEW and a QUERY when their source table is written', async () => {
      const { db, exec } = setup({ Owners, VOwners, QOwners }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      await db.repo('VOwners').find();
      await db.repo('VOwners').find();
      await db.repo('QOwners').find();
      await db.repo('QOwners').find();
      asserts.assertEquals(exec.selects(), 2, 'view + query cached');

      // Write the base table: both the view and the (transitively
      // dependent) query caches must drop.
      await db.repo('Owners').insert({ id: 2, name: 'b' });
      await db.repo('VOwners').find();
      await db.repo('QOwners').find();
      asserts.assertEquals(exec.selects(), 4, 'base write pruned view + query');
    });
  });

  describe('manual clear', () => {
    it('repo.clearCache() drops one entity (and its dependents)', async () => {
      const { db, exec } = setup({ Users }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      await db.repo('Users').find();
      await db.repo('Users').find();
      asserts.assertEquals(exec.selects(), 1);
      await db.repo('Users').clearCache();
      await db.repo('Users').find();
      asserts.assertEquals(exec.selects(), 2);
    });

    it('db.clearCache() drops every entity', async () => {
      const Other = Entity('other', {
        id: Column.integer(),
      }, { pk: ['id'], cache: 5 });
      const { db, exec } = setup({ Users, Other }, {
        engine: 'MEMORY',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      await db.repo('Users').find();
      await db.repo('Other').find();
      await db.repo('Users').find();
      await db.repo('Other').find();
      asserts.assertEquals(exec.selects(), 2, 'both cached');
      await db.clearCache();
      await db.repo('Users').find();
      await db.repo('Other').find();
      asserts.assertEquals(exec.selects(), 4, 'all dropped');
    });
  });

  describe('multi-connection isolation', () => {
    it('two Norms sharing MEMORY do not cross-populate or cross-prune', async () => {
      const cfgA: NormCacheConfig = { engine: 'MEMORY', name: nextConn() };
      const cfgB: NormCacheConfig = { engine: 'MEMORY', name: nextConn() };
      const a = setup({ Users }, cfgA);
      const b = setup({ Users }, cfgB);
      a.exec.selectRows = [{ id: 1, name: 'a' }];
      b.exec.selectRows = [{ id: 9, name: 'b' }];

      await a.db.repo('Users').find();
      await b.db.repo('Users').find();
      // Each connection has its OWN entry; neither is a hit off the other.
      const ra = await a.db.repo('Users').find();
      const rb = await b.db.repo('Users').find();
      asserts.assertEquals(a.exec.selects(), 1);
      asserts.assertEquals(b.exec.selects(), 1);
      asserts.assertEquals(ra.data, [{ id: 1, name: 'a' }]);
      asserts.assertEquals(rb.data, [{ id: 9, name: 'b' }]);

      // A write on A must not prune B.
      await a.db.repo('Users').insert({ id: 2, name: 'c' });
      await b.db.repo('Users').find();
      asserts.assertEquals(b.exec.selects(), 1, 'B untouched by A write');
    });
  });

  describe('encryption guard (compose time)', () => {
    const Secretive = Entity('secretive', {
      id: Column.integer(),
      ssn: Column.varchar(64).encrypt(),
    }, { pk: ['id'], cache: 5 });

    const build = (cache: NormCacheConfig) =>
      compileRuntime(
        use(Schema('S', { Secretive })),
        { secret: 'test-secret' },
        new MockExec(),
        () => {},
        undefined,
        cache,
      );

    it('rejects encrypted + cache on a non-MEMORY engine', () => {
      const err = asserts.assertThrows(
        () => build({ engine: 'REDIS', name: nextConn() }),
        NormError,
      );
      asserts.assertEquals(
        (err as NormError).code,
        'INVALID_CACHE_CONFIG',
      );
    });

    it('allows encrypted + cache on MEMORY', () => {
      build({ engine: 'MEMORY', name: nextConn() }); // must not throw
    });
  });

  describe('graceful degradation', () => {
    it('serves from the database and warns when the backend fails', async () => {
      const { db, exec, events } = setup({ Users }, {
        engine: 'FAILING',
        name: nextConn(),
      });
      exec.selectRows = [{ id: 1, name: 'a' }];
      const r1 = await db.repo('Users').find(); // get fails → miss → DB
      const r2 = await db.repo('Users').find(); // set failed → still DB
      asserts.assertEquals(exec.selects(), 2, 'both reads fell back to the DB');
      asserts.assertEquals(r1.data, [{ id: 1, name: 'a' }]);
      asserts.assertEquals(r2.data, [{ id: 1, name: 'a' }]);
      // A write whose prune fails must still succeed.
      await db.repo('Users').insert({ id: 2, name: 'b' });
      const errs = events.filter((e) =>
        e.event === 'warning' && e.args[2] === 'cache-error'
      );
      asserts.assert(errs.length > 0, 'surfaced cache-error warnings');
    });
  });

  describe('config validation', () => {
    it('rejects a missing name', () => {
      asserts.assertThrows(
        () => setup({ Users }, { engine: 'MEMORY', name: '' }),
        NormError,
      );
    });
    it('rejects a name containing the reserved separators', () => {
      asserts.assertThrows(
        () => setup({ Users }, { engine: 'MEMORY', name: 'a__b' }),
        NormError,
      );
      asserts.assertThrows(
        () => setup({ Users }, { engine: 'MEMORY', name: 'a:b' }),
        NormError,
      );
    });
    it('rejects a non-integer / out-of-range per-entity cache TTL', () => {
      const Bad = Entity('bad', { id: Column.integer() }, {
        pk: ['id'],
        cache: 1.5,
      });
      asserts.assertThrows(
        () => setup({ Bad }, { engine: 'MEMORY', name: nextConn() }),
        NormError,
      );
      const TooLong = Entity('toolong', { id: Column.integer() }, {
        pk: ['id'],
        cache: 60 * 24 * 31, // > 30 days
      });
      asserts.assertThrows(
        () => setup({ TooLong }, { engine: 'MEMORY', name: nextConn() }),
        NormError,
      );
    });
  });
});
