import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';
import { RedisEngine } from './Engine.ts';
import { RespError, type RespValue } from './resp.ts';
import { RedisConnection } from './RedisConnection.ts';
import { EngineError } from '../../errors/mod.ts';
import type { Connection } from '@tundralibs/compat';

// Wave-note: emission/option accessors are protected now — tests reach
// them through deliberate casts.
// deno-lint-ignore no-explicit-any
const readOption = (t: unknown, k: string): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOption(k);
// deno-lint-ignore no-explicit-any
const readOptions = (t: unknown): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._getOptions();
// deno-lint-ignore no-explicit-any
const fireEvent = (t: unknown, e: string, ...a: unknown[]): any =>
  // deno-lint-ignore no-explicit-any
  (t as any)._emitRaw(e, ...a);

const env = envArgs('./packages/drivers/');

const TEST_CONFIG = {
  host: env.get('REDIS_HOST') || env.get('MEMCACHED_HOST') || 'localhost',
  port: Number.parseInt(env.get('REDIS_PORT') || '6379', 10),
};

async function isRedisAvailable(): Promise<boolean> {
  const probe = new RedisEngine('redis-probe', TEST_CONFIG);
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

const redisAvailable = await isRedisAvailable();

let keyCounter = 0;
const k = (label: string) =>
  `tundra-test:${Date.now()}:${++keyCounter}:${label}`;

describe({
  name: 'drivers.RedisEngine',
  ignore: !redisAvailable,
  fn: () => {
    describe('configuration', () => {
      it('should expose Engine and Capabilities', () => {
        const engine = new RedisEngine('cfg-1', TEST_CONFIG);
        asserts.assertEquals(engine.Engine, 'REDIS');
        asserts.assertEquals(engine.Capabilities.pooledConnections, true);
        asserts.assertEquals(engine.instanceId, 'REDIS::cfg-1');
      });

      it('should default port to 6379', () => {
        const engine = new RedisEngine('cfg-2', { host: TEST_CONFIG.host });
        asserts.assertEquals(readOption(engine, 'port'), 6379);
      });

      it('should default database to 0', () => {
        const engine = new RedisEngine('cfg-3', TEST_CONFIG);
        asserts.assertEquals(readOption(engine, 'database'), 0);
      });

      it('should require host', () => {
        asserts.assertThrows(
          // deno-lint-ignore no-explicit-any
          () => new RedisEngine('cfg-4', {} as any),
          EngineError,
          'host',
        );
      });
    });

    describe('lifecycle', () => {
      it('should connect, ping, and disconnect', async () => {
        const engine = new RedisEngine('life-1', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(engine.status, 'READY');
        asserts.assertEquals(await engine.ping(), true);
        await engine.disconnect();
        asserts.assertEquals(engine.status, 'CLOSED');
      });

      it('should auto-connect on first operation', async () => {
        const engine = new RedisEngine('life-2', TEST_CONFIG);
        asserts.assertEquals(engine.status, 'CLOSED');
        await engine.echo('hi');
        asserts.assertEquals(engine.status, 'READY');
        await engine.disconnect();
      });

      it('should emit a query event per command (verb + key, no value)', async () => {
        const engine = new RedisEngine('life-evt', {
          ...TEST_CONFIG,
          slowQueryThreshold: 0.000001, // ~0ms → every command counts slow
        });
        const queries: string[] = [];
        let slow = 0;
        engine.on('query', (_id, r) => queries.push(r.query.sql));
        engine.on('slowQuery', () => slow++);
        await engine.connect();
        await engine.set('evt-key', 'secret-value');
        await engine.get('evt-key');
        await engine.del('evt-key');
        // One query event per command; payload is the verb + key only.
        asserts.assertEquals(queries.length >= 3, true);
        asserts.assertArrayIncludes(queries, ['SET evt-key', 'GET evt-key']);
        for (const q of queries) {
          asserts.assertEquals(q.includes('secret-value'), false);
        }
        asserts.assertEquals(slow >= 3, true);
        await engine.disconnect();
      });

      it({
        name: 'should fail to connect with bad password',
        // Skipped by default — many test Redis instances run without
        // requirepass, and the server holds the auth-failure socket open
        // long enough that this test can hang.
        ignore: true,
        fn: async () => {
          const engine = new RedisEngine('life-3', {
            ...TEST_CONFIG,
            password: 'definitely-wrong-password',
            pool: { min: 1, acquireTimeoutSeconds: 2 },
          });
          await asserts.assertRejects(() => engine.connect(), EngineError);
        },
      });
    });

    describe('strings', () => {
      it('should set and get a value', async () => {
        const engine = new RedisEngine('str-1', TEST_CONFIG);
        await engine.connect();
        const key = k('basic');
        await engine.set(key, 'hello-world');
        asserts.assertEquals(await engine.get(key), 'hello-world');
        await engine.del(key);
        await engine.disconnect();
      });

      it('should return null for missing keys', async () => {
        const engine = new RedisEngine('str-2', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(await engine.get(k('missing')), null);
        await engine.disconnect();
      });

      it('should honor SET EX (TTL)', async () => {
        const engine = new RedisEngine('str-3', TEST_CONFIG);
        await engine.connect();
        const key = k('ttl');
        await engine.set(key, 'short-lived', { ex: 1 });
        asserts.assertEquals(await engine.get(key), 'short-lived');
        await new Promise((r) => setTimeout(r, 1500));
        asserts.assertEquals(await engine.get(key), null);
        await engine.disconnect();
      });

      it('should honor SET NX (only-if-absent)', async () => {
        const engine = new RedisEngine('str-4', TEST_CONFIG);
        await engine.connect();
        const key = k('nx');
        asserts.assertEquals(
          await engine.set(key, 'first', { nx: true }),
          'OK',
        );
        asserts.assertEquals(
          await engine.set(key, 'second', { nx: true }),
          null,
        );
        asserts.assertEquals(await engine.get(key), 'first');
        await engine.del(key);
        await engine.disconnect();
      });

      it('should honor SET XX (only-if-present)', async () => {
        const engine = new RedisEngine('str-5', TEST_CONFIG);
        await engine.connect();
        const key = k('xx');
        asserts.assertEquals(
          await engine.set(key, 'first', { xx: true }),
          null,
        );
        await engine.set(key, 'first');
        asserts.assertEquals(
          await engine.set(key, 'second', { xx: true }),
          'OK',
        );
        asserts.assertEquals(await engine.get(key), 'second');
        await engine.del(key);
        await engine.disconnect();
      });

      it('should preserve UTF-8 values', async () => {
        const engine = new RedisEngine('str-6', TEST_CONFIG);
        await engine.connect();
        const key = k('utf8');
        const value = '日本語 🚀 émoji';
        await engine.set(key, value);
        asserts.assertEquals(await engine.get(key), value);
        await engine.del(key);
        await engine.disconnect();
      });

      it('should mget multiple keys', async () => {
        const engine = new RedisEngine('str-7', TEST_CONFIG);
        await engine.connect();
        const keys = [k('m1'), k('m2'), k('m3')];
        await engine.set(keys[0]!, 'a');
        await engine.set(keys[2]!, 'c');
        const values = await engine.mget(...keys);
        asserts.assertEquals(values, ['a', null, 'c']);
        await engine.del(...keys);
        await engine.disconnect();
      });

      it('should mset multiple pairs', async () => {
        const engine = new RedisEngine('str-8', TEST_CONFIG);
        await engine.connect();
        const a = k('ms-a');
        const b = k('ms-b');
        await engine.mset({ [a]: 'A', [b]: 'B' });
        asserts.assertEquals(await engine.get(a), 'A');
        asserts.assertEquals(await engine.get(b), 'B');
        await engine.del(a, b);
        await engine.disconnect();
      });

      it('should append to a string', async () => {
        const engine = new RedisEngine('str-9', TEST_CONFIG);
        await engine.connect();
        const key = k('app');
        await engine.set(key, 'foo');
        const len = await engine.append(key, '-bar');
        asserts.assertEquals(len, 7);
        asserts.assertEquals(await engine.get(key), 'foo-bar');
        await engine.del(key);
        await engine.disconnect();
      });
    });

    describe('counters', () => {
      it('incr should start at 1', async () => {
        const engine = new RedisEngine('cnt-1', TEST_CONFIG);
        await engine.connect();
        const key = k('cnt-incr');
        asserts.assertEquals(await engine.incr(key), 1);
        asserts.assertEquals(await engine.incr(key), 2);
        await engine.del(key);
        await engine.disconnect();
      });

      it('incrBy / decrBy should adjust by amount', async () => {
        const engine = new RedisEngine('cnt-2', TEST_CONFIG);
        await engine.connect();
        const key = k('cnt-by');
        asserts.assertEquals(await engine.incrBy(key, 5), 5);
        asserts.assertEquals(await engine.decrBy(key, 2), 3);
        await engine.del(key);
        await engine.disconnect();
      });

      it('incr should fail on non-numeric value', async () => {
        const engine = new RedisEngine('cnt-3', TEST_CONFIG);
        await engine.connect();
        const key = k('cnt-bad');
        await engine.set(key, 'not-a-number');
        await asserts.assertRejects(() => engine.incr(key), EngineError);
        await engine.del(key);
        await engine.disconnect();
      });

      it('incr past 2^53 returns an exact bigint (no rounding)', async () => {
        const engine = new RedisEngine('cnt-i64', TEST_CONFIG);
        await engine.connect();
        const key = k('cnt-i64');
        // Seed just below the signed 64-bit max, then INCR across the
        // safe-integer boundary. A JS `number` would round
        // 9223372036854775807 up to ...808; the driver must return the
        // exact value as a bigint.
        await engine.set(key, '9223372036854775806');
        const next = await engine.incr(key);
        asserts.assertStrictEquals(next, 9223372036854775807n);
        await engine.del(key);
        await engine.disconnect();
      });

      it('a small counter stays a JS number', async () => {
        const engine = new RedisEngine('cnt-small', TEST_CONFIG);
        await engine.connect();
        const key = k('cnt-small');
        const v = await engine.incr(key);
        asserts.assertStrictEquals(typeof v, 'number');
        asserts.assertStrictEquals(v, 1);
        await engine.del(key);
        await engine.disconnect();
      });
    });

    describe('keys / TTL', () => {
      it('exists should count existing keys', async () => {
        const engine = new RedisEngine('keys-1', TEST_CONFIG);
        await engine.connect();
        const a = k('e-a');
        const b = k('e-b');
        await engine.set(a, 'x');
        asserts.assertEquals(await engine.exists(a, b, a), 2);
        await engine.del(a);
        await engine.disconnect();
      });

      it('expire / ttl / persist should round-trip', async () => {
        const engine = new RedisEngine('keys-2', TEST_CONFIG);
        await engine.connect();
        const key = k('ttl-rt');
        await engine.set(key, 'v');
        asserts.assertEquals(await engine.expire(key, 60), true);
        const ttl = await engine.ttl(key);
        asserts.assert(ttl > 0 && ttl <= 60);
        asserts.assertEquals(await engine.persist(key), true);
        asserts.assertEquals(await engine.ttl(key), -1);
        await engine.del(key);
        await engine.disconnect();
      });

      it('keys pattern should match', async () => {
        const engine = new RedisEngine('keys-3', TEST_CONFIG);
        await engine.connect();
        const prefix = `tundra-test-keys-${Date.now()}`;
        await engine.mset({
          [`${prefix}:a`]: '1',
          [`${prefix}:b`]: '2',
        });
        const keys = await engine.keys(`${prefix}:*`);
        asserts.assertEquals(keys.sort().length, 2);
        await engine.del(`${prefix}:a`, `${prefix}:b`);
        await engine.disconnect();
      });

      it('type should report value type', async () => {
        const engine = new RedisEngine('keys-4', TEST_CONFIG);
        await engine.connect();
        const key = k('type');
        await engine.set(key, 'v');
        asserts.assertEquals(await engine.type(key), 'string');
        await engine.del(key);
        await engine.disconnect();
      });

      it('scan should walk the keyspace', async () => {
        const engine = new RedisEngine('keys-5', TEST_CONFIG);
        await engine.connect();
        const prefix = `tundra-test-scan-${Date.now()}`;
        for (let i = 0; i < 5; i++) await engine.set(`${prefix}:${i}`, 'v');

        const seen = new Set<string>();
        let cursor = '0';
        do {
          const r = await engine.scan(cursor, {
            match: `${prefix}:*`,
            count: 10,
          });
          for (const x of r.keys) seen.add(x);
          cursor = r.cursor;
        } while (cursor !== '0');
        asserts.assertEquals(seen.size, 5);
        for (let i = 0; i < 5; i++) await engine.del(`${prefix}:${i}`);
        await engine.disconnect();
      });
    });

    describe('hashes', () => {
      it('should hset/hget single field', async () => {
        const engine = new RedisEngine('hash-1', TEST_CONFIG);
        await engine.connect();
        const key = k('h-single');
        asserts.assertEquals(await engine.hset(key, 'f1', 'v1'), 1);
        asserts.assertEquals(await engine.hget(key, 'f1'), 'v1');
        await engine.del(key);
        await engine.disconnect();
      });

      it('should hset multiple fields at once', async () => {
        const engine = new RedisEngine('hash-2', TEST_CONFIG);
        await engine.connect();
        const key = k('h-multi');
        const n = await engine.hset(key, { a: '1', b: '2', c: '3' });
        asserts.assertEquals(n, 3);
        asserts.assertEquals(await engine.hgetAll(key), {
          a: '1',
          b: '2',
          c: '3',
        });
        await engine.del(key);
        await engine.disconnect();
      });

      it('hmget should return ordered values with nulls for missing', async () => {
        const engine = new RedisEngine('hash-3', TEST_CONFIG);
        await engine.connect();
        const key = k('h-mget');
        await engine.hset(key, { a: '1', c: '3' });
        asserts.assertEquals(await engine.hmget(key, 'a', 'b', 'c'), [
          '1',
          null,
          '3',
        ]);
        await engine.del(key);
        await engine.disconnect();
      });

      it('hdel should remove fields', async () => {
        const engine = new RedisEngine('hash-4', TEST_CONFIG);
        await engine.connect();
        const key = k('h-del');
        await engine.hset(key, { a: '1', b: '2', c: '3' });
        asserts.assertEquals(await engine.hdel(key, 'a', 'b'), 2);
        asserts.assertEquals(await engine.hkeys(key), ['c']);
        await engine.del(key);
        await engine.disconnect();
      });

      it('hincrBy should increment numeric field', async () => {
        const engine = new RedisEngine('hash-5', TEST_CONFIG);
        await engine.connect();
        const key = k('h-incr');
        await engine.hset(key, { count: '10' });
        asserts.assertEquals(await engine.hincrBy(key, 'count', 5), 15);
        await engine.del(key);
        await engine.disconnect();
      });
    });

    describe('lists', () => {
      it('should lpush/rpush and lrange', async () => {
        const engine = new RedisEngine('list-1', TEST_CONFIG);
        await engine.connect();
        const key = k('l-basic');
        await engine.rpush(key, 'a', 'b', 'c');
        await engine.lpush(key, 'z');
        asserts.assertEquals(await engine.lrange(key, 0, -1), [
          'z',
          'a',
          'b',
          'c',
        ]);
        asserts.assertEquals(await engine.llen(key), 4);
        await engine.del(key);
        await engine.disconnect();
      });

      it('lpop/rpop should remove from ends', async () => {
        const engine = new RedisEngine('list-2', TEST_CONFIG);
        await engine.connect();
        const key = k('l-pop');
        await engine.rpush(key, 'a', 'b', 'c');
        asserts.assertEquals(await engine.lpop(key), 'a');
        asserts.assertEquals(await engine.rpop(key), 'c');
        asserts.assertEquals(await engine.lrange(key, 0, -1), ['b']);
        await engine.del(key);
        await engine.disconnect();
      });

      it('pop on empty list returns null', async () => {
        const engine = new RedisEngine('list-3', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(await engine.lpop(k('empty')), null);
        await engine.disconnect();
      });
    });

    describe('sets', () => {
      it('should sadd/srem/sismember', async () => {
        const engine = new RedisEngine('set-1', TEST_CONFIG);
        await engine.connect();
        const key = k('s-basic');
        asserts.assertEquals(await engine.sadd(key, 'a', 'b', 'c'), 3);
        asserts.assertEquals(await engine.sadd(key, 'b'), 0);
        asserts.assertEquals(await engine.sismember(key, 'a'), true);
        asserts.assertEquals(await engine.sismember(key, 'z'), false);
        asserts.assertEquals(await engine.srem(key, 'b', 'z'), 1);
        asserts.assertEquals(await engine.scard(key), 2);
        await engine.del(key);
        await engine.disconnect();
      });

      it('smembers should return all members', async () => {
        const engine = new RedisEngine('set-2', TEST_CONFIG);
        await engine.connect();
        const key = k('s-members');
        await engine.sadd(key, 'x', 'y', 'z');
        const members = (await engine.smembers(key)).sort();
        asserts.assertEquals(members, ['x', 'y', 'z']);
        await engine.del(key);
        await engine.disconnect();
      });
    });

    describe('sorted sets', () => {
      it('zadd/zrange/zscore should round-trip', async () => {
        const engine = new RedisEngine('zset-1', TEST_CONFIG);
        await engine.connect();
        const key = k('z-basic');
        await engine.zadd(key, 1, 'apple');
        await engine.zadd(key, 5, 'cherry');
        await engine.zadd(key, 3, 'banana');
        asserts.assertEquals(await engine.zrange(key, 0, -1), [
          'apple',
          'banana',
          'cherry',
        ]);
        asserts.assertEquals(await engine.zscore(key, 'banana'), 3);
        asserts.assertEquals(await engine.zscore(key, 'missing'), null);
        await engine.del(key);
        await engine.disconnect();
      });

      it('zcard / zrem should reflect membership changes', async () => {
        const engine = new RedisEngine('zset-2', TEST_CONFIG);
        await engine.connect();
        const key = k('z-card');
        await engine.zadd(key, 1, 'a');
        await engine.zadd(key, 2, 'b');
        asserts.assertEquals(await engine.zcard(key), 2);
        asserts.assertEquals(await engine.zrem(key, 'a'), 1);
        asserts.assertEquals(await engine.zcard(key), 1);
        await engine.del(key);
        await engine.disconnect();
      });
    });

    describe('pub/sub (publish only)', () => {
      it('publish returns the subscriber count', async () => {
        const engine = new RedisEngine('ps-1', TEST_CONFIG);
        await engine.connect();
        const count = await engine.publish(k('chan'), 'hello');
        asserts.assert(typeof count === 'number');
        asserts.assert(count >= 0);
        await engine.disconnect();
      });
    });

    describe('multi / exec', () => {
      it('should execute queued commands atomically', async () => {
        const engine = new RedisEngine('multi-1', TEST_CONFIG);
        await engine.connect();
        const key = k('mx');
        const replies = await engine.multi([
          ['SET', key, '0'],
          ['INCR', key],
          ['INCR', key],
          ['GET', key],
        ]);
        asserts.assertEquals(replies.length, 4);
        // last reply should be the bulk string '2'
        const lastReply = replies[3];
        if (lastReply && lastReply.kind === 'bulk') {
          asserts.assertEquals(lastReply.value, '2');
        } else {
          asserts.fail(`unexpected last reply: ${JSON.stringify(lastReply)}`);
        }
        await engine.del(key);
        await engine.disconnect();
      });

      it('should DISCARD a queued command on error and surface it', async () => {
        const engine = new RedisEngine('multi-2', TEST_CONFIG);
        await engine.connect();
        await asserts.assertRejects(
          // Empty MULTI is ok; inject an invalid arg count for SET to force a
          // queue-time error.
          () => engine.multi([['SET']]),
          EngineError,
        );
        await engine.disconnect();
      });
    });

    describe('server / admin', () => {
      it('echo should bounce a message', async () => {
        const engine = new RedisEngine('srv-1', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(await engine.echo('round-trip'), 'round-trip');
        await engine.disconnect();
      });

      it('info should return a non-empty string', async () => {
        const engine = new RedisEngine('srv-2', TEST_CONFIG);
        await engine.connect();
        const info = await engine.info('server');
        asserts.assert(info.length > 0);
        asserts.assert(info.includes('redis_version'));
        await engine.disconnect();
      });

      it('dbsize should be a number', async () => {
        const engine = new RedisEngine('srv-3', TEST_CONFIG);
        await engine.connect();
        const n = await engine.dbsize();
        asserts.assertEquals(typeof n, 'number');
        asserts.assert(n >= 0);
        await engine.disconnect();
      });

      it('select should switch logical database', async () => {
        const engine = new RedisEngine('srv-4', TEST_CONFIG);
        await engine.connect();
        asserts.assertEquals(await engine.select(1), 'OK');
        // Switching back is also fine.
        asserts.assertEquals(await engine.select(0), 'OK');
        await engine.disconnect();
      });
    });

    describe('pool behavior', () => {
      it('should reuse pooled connections', async () => {
        const engine = new RedisEngine('pool-1', {
          ...TEST_CONFIG,
          pool: { min: 1, max: 2 },
        });
        await engine.connect();
        for (let i = 0; i < 20; i++) {
          await engine.set(k(`reuse-${i}`), `v${i}`, { ex: 30 });
        }
        const stats = engine.poolStats;
        asserts.assert(
          stats.total <= 2,
          `pool should not exceed max (got ${stats.total})`,
        );
        await engine.disconnect();
      });

      it('should serialize concurrent ops under pool pressure', async () => {
        const engine = new RedisEngine('pool-2', {
          ...TEST_CONFIG,
          pool: { max: 2 },
        });
        await engine.connect();
        const ops = Array.from(
          { length: 25 },
          (_, i) => engine.set(k(`conc-${i}`), `v${i}`, { ex: 30 }),
        );
        await Promise.all(ops);
        await engine.disconnect();
      });
    });
  },
});

// `multi()` runs a multi-step exchange on one connection, so its failure
// paths decide whether a connection that may still be inside an open MULTI
// block — or sitting on a half-consumed reply — goes back to the idle pool.
// A stub connection stands in for the socket, so this suite is NOT gated on
// `redisAvailable`.
describe('drivers.RedisEngine - multi() connection health', () => {
  type Responder = (
    parts: ReadonlyArray<string | number>,
  ) => Promise<RespValue>;

  /** Stands in for a `RedisConnection`; records what was written to it. */
  class StubConnection {
    public closed = false;
    public readonly sent: string[] = [];

    constructor(private readonly __respond: Responder) {}

    send(parts: ReadonlyArray<string | number>): Promise<RespValue> {
      this.sent.push(String(parts[0] ?? ''));
      return this.__respond(parts);
    }

    close(): void {
      this.closed = true;
    }
  }

  /** A `RedisEngine` whose pool is filled with {@link StubConnection}s. */
  class StubRedisEngine extends RedisEngine {
    public readonly conns: StubConnection[] = [];

    constructor(name: string, private readonly __respond: Responder) {
      super(name, TEST_CONFIG);
    }

    protected override _createResource(): Promise<RedisConnection> {
      const conn = new StubConnection(this.__respond);
      this.conns.push(conn);
      return Promise.resolve(conn as unknown as RedisConnection);
    }
  }

  const ok = (value: string): Promise<RespValue> =>
    Promise.resolve({ kind: 'string', value });
  const serverError = (message: string): Promise<RespValue> =>
    Promise.resolve({
      kind: 'error',
      value: new RespError(message, message.split(' ')[0] ?? 'ERR'),
    });

  it('should release the connection after a clean MULTI/EXEC', async () => {
    const engine = new StubRedisEngine('multi-clean', (parts) => {
      if (parts[0] === 'EXEC') {
        return Promise.resolve({
          kind: 'array',
          value: [{ kind: 'string', value: 'OK' }],
        });
      }
      return ok(parts[0] === 'MULTI' ? 'OK' : 'QUEUED');
    });
    await engine.connect();

    const replies = await engine.multi([['SET', 'k', '1']]);

    asserts.assertEquals(replies.length, 1);
    asserts.assertEquals(engine.poolStats.idle, 1);
    asserts.assertEquals(engine.poolStats.active, 0);
    asserts.assertEquals(engine.conns[0]!.closed, false);

    await engine.disconnect();
  });

  // Regression: the `finally` released unconditionally, so a connection that
  // died between MULTI and EXEC went back to the idle pool still inside the
  // transaction. `_validateResource` only rejects a *closed* connection, so
  // the next acquirer inherited the broken framing.
  it('should destroy the connection when an I/O error interrupts MULTI', async () => {
    const engine = new StubRedisEngine('multi-io', (parts) => {
      if (parts[0] === 'EXEC') {
        return Promise.reject(new Error('read timeout'));
      }
      return ok(parts[0] === 'MULTI' ? 'OK' : 'QUEUED');
    });
    await engine.connect();

    await asserts.assertRejects(
      () => engine.multi([['SET', 'k', '1']]),
      Error,
      'read timeout',
    );

    asserts.assertEquals(engine.poolStats.idle, 0);
    asserts.assertEquals(engine.poolStats.active, 0);
    asserts.assertEquals(engine.conns[0]!.closed, true);

    await engine.disconnect();
  });

  it('should destroy the connection when MULTI itself fails on I/O', async () => {
    const engine = new StubRedisEngine('multi-io-open', (parts) => {
      if (parts[0] === 'MULTI') {
        return Promise.reject(new Error('connection reset'));
      }
      return ok('QUEUED');
    });
    await engine.connect();

    await asserts.assertRejects(
      () => engine.multi([['SET', 'k', '1']]),
      Error,
      'connection reset',
    );

    asserts.assertEquals(engine.poolStats.idle, 0);
    asserts.assertEquals(engine.conns[0]!.closed, true);

    await engine.disconnect();
  });

  // Regression: the DISCARD rejection was swallowed by `.catch(() => {})` and
  // the connection released anyway — still in MULTI.
  it('should destroy the connection when DISCARD fails after a queue error', async () => {
    const engine = new StubRedisEngine('multi-discard-io', (parts) => {
      if (parts[0] === 'MULTI') return ok('OK');
      if (parts[0] === 'DISCARD') {
        return Promise.reject(new Error('socket closed'));
      }
      return serverError("ERR wrong number of arguments for 'set' command");
    });
    await engine.connect();

    await asserts.assertRejects(() => engine.multi([['SET']]), EngineError);

    asserts.assertEquals(engine.conns[0]!.sent.includes('DISCARD'), true);
    asserts.assertEquals(engine.poolStats.idle, 0);
    asserts.assertEquals(engine.conns[0]!.closed, true);

    await engine.disconnect();
  });

  it('should destroy the connection when the server rejects DISCARD', async () => {
    const engine = new StubRedisEngine('multi-discard-err', (parts) => {
      if (parts[0] === 'MULTI') return ok('OK');
      if (parts[0] === 'DISCARD') return serverError('ERR DISCARD failed');
      return serverError("ERR wrong number of arguments for 'set' command");
    });
    await engine.connect();

    await asserts.assertRejects(() => engine.multi([['SET']]), EngineError);

    // The abort couldn't be confirmed, so the connection isn't reusable.
    asserts.assertEquals(engine.poolStats.idle, 0);
    asserts.assertEquals(engine.conns[0]!.closed, true);

    await engine.disconnect();
  });

  // The other half of the contract: a plain server *error reply* leaves the
  // socket in a known state, so a cleanly-discarded transaction must NOT cost
  // us the connection.
  it('should keep the connection when DISCARD cleanly aborts a queue error', async () => {
    const engine = new StubRedisEngine('multi-discard-ok', (parts) => {
      if (parts[0] === 'MULTI') return ok('OK');
      if (parts[0] === 'DISCARD') return ok('OK');
      return serverError("ERR wrong number of arguments for 'set' command");
    });
    await engine.connect();

    await asserts.assertRejects(() => engine.multi([['SET']]), EngineError);

    asserts.assertEquals(engine.poolStats.idle, 1);
    asserts.assertEquals(engine.conns[0]!.closed, false);

    await engine.disconnect();
  });

  it('should keep the connection when the server returns an EXEC error', async () => {
    const engine = new StubRedisEngine('multi-exec-err', (parts) => {
      if (parts[0] === 'EXEC') {
        return serverError('EXECABORT Transaction discarded');
      }
      return ok(parts[0] === 'MULTI' ? 'OK' : 'QUEUED');
    });
    await engine.connect();

    await asserts.assertRejects(
      () => engine.multi([['SET', 'k', '1']]),
      EngineError,
    );

    asserts.assertEquals(engine.poolStats.idle, 1);
    asserts.assertEquals(engine.conns[0]!.closed, false);

    await engine.disconnect();
  });
});

// A fake compat `Connection` that replays a fixed script of read chunks and
// swallows writes. `'EOF'` in the script yields a `null` read (socket closed).
class ScriptSocket implements Connection {
  public closed = false;
  private readonly __out: (Uint8Array | 'EOF')[];
  private __pending: ((v: Uint8Array | null) => void) | null = null;
  constructor(chunks: (Uint8Array | 'EOF')[]) {
    this.__out = [...chunks];
  }
  read(): Promise<Uint8Array | null> {
    const c = this.__out.shift();
    if (c === 'EOF') return Promise.resolve(null);
    if (c !== undefined) return Promise.resolve(c);
    return new Promise((res) => {
      this.__pending = res;
    });
  }
  write(_data: Uint8Array | string): Promise<number> {
    return Promise.resolve(0);
  }
  close(): void {
    this.closed = true;
    if (this.__pending) {
      const p = this.__pending;
      this.__pending = null;
      p(null);
    }
  }
}

// Round-3 findings #3/#4: a reply that exceeds maxBufferSize leaves the socket
// mid-frame. A `RedisConnection` built over a fake socket with a tiny cap lets
// us exercise `readReply`'s overflow path with no live server.
describe('drivers.RedisEngine - max-buffer overflow poisoning', () => {
  const enc = new TextEncoder();

  /** RedisEngine whose pooled connections wrap scripted sockets (no handshake). */
  class OverflowRedisEngine extends RedisEngine {
    public readonly conns: RedisConnection[] = [];
    constructor(name: string, private readonly __sockets: Connection[]) {
      super(name, TEST_CONFIG);
    }
    protected override _createResource(): Promise<RedisConnection> {
      const socket = this.__sockets[this.conns.length]!;
      // 64-byte cap stands in for the 16 MB default; skip the handshake.
      const conn = new RedisConnection(socket, 64, this.instanceId);
      this.conns.push(conn);
      return Promise.resolve(conn);
    }
  }

  it('destroys a connection left mid-frame by an oversized reply', async () => {
    const big = 'A'.repeat(200); // > 64-byte cap
    const oversized = enc.encode(`$${big.length}\r\n${big}\r\n`);
    const genuine = enc.encode('$8\r\nGENUINE!\r\n');
    const engine = new OverflowRedisEngine('redis-overflow', [
      new ScriptSocket([oversized]),
      new ScriptSocket([genuine]),
    ]);
    await engine.connect();

    // The oversized reply overflows the cap mid-frame.
    await asserts.assertRejects(() => engine.get('user:1'), EngineError);

    // Fixed: the poisoned connection was closed and destroyed, not recycled.
    asserts.assertStrictEquals(engine.conns[0]!.closed, true);
    asserts.assertStrictEquals(engine.poolStats.idle, 0);

    // The next command runs on a fresh connection and returns the correct
    // value — not a leftover frame from the previous (oversized) reply.
    const value = await engine.get('user:2');
    asserts.assertStrictEquals(value, 'GENUINE!');
    asserts.assert(engine.conns.length >= 2);

    await engine.disconnect();
  });
});

// Round-3 finding #10: `select()` used to switch a single arbitrary pooled
// connection, splitting the pool across keyspaces. It must move the whole
// engine, bringing every connection onto the target database.
describe('drivers.RedisEngine - select() pool safety', () => {
  const ok = (value: string): Promise<RespValue> =>
    Promise.resolve({ kind: 'string', value });

  /** Send-level stub that records the verbs it was asked to run. */
  class RecordingConn {
    public closed = false;
    public readonly sent: string[] = [];
    constructor(
      private readonly __respond: (
        parts: ReadonlyArray<string | number>,
      ) => Promise<RespValue>,
    ) {}
    send(parts: ReadonlyArray<string | number>): Promise<RespValue> {
      this.sent.push(String(parts[0] ?? ''));
      return this.__respond(parts);
    }
    close(): void {
      this.closed = true;
    }
  }

  /** RedisEngine whose pooled connections are recording stubs, but which (like
   * the real factory) run the handshake so per-connection db tracking is set. */
  class SelectStubRedisEngine extends RedisEngine {
    public readonly conns: RecordingConn[] = [];
    constructor(
      name: string,
      private readonly __respond: (
        parts: ReadonlyArray<string | number>,
      ) => Promise<RespValue>,
      pool: { min: number; max: number },
    ) {
      super(name, { ...TEST_CONFIG, pool });
    }
    protected override async _createResource(): Promise<RedisConnection> {
      const conn = new RecordingConn(this.__respond);
      this.conns.push(conn);
      await (this as unknown as {
        __handshake(c: RedisConnection): Promise<void>;
      }).__handshake(conn as unknown as RedisConnection);
      return conn as unknown as RedisConnection;
    }
  }

  const responder = (
    parts: ReadonlyArray<string | number>,
  ): Promise<RespValue> => {
    const verb = String(parts[0] ?? '');
    if (verb === 'GET') return Promise.resolve({ kind: 'bulk', value: 'v' });
    return ok('OK'); // HELLO / SELECT / everything else
  };

  it('brings every pooled connection onto the selected database', async () => {
    const engine = new SelectStubRedisEngine('select-safe', responder, {
      min: 2,
      max: 2,
    });
    await engine.connect(); // 2 handshaked connections, both on db 0.

    await engine.select(1);
    // Drive commands across the pool so both connections are exercised.
    await Promise.all([engine.get('a'), engine.get('b')]);

    // Every connection issued a SELECT to converge on db 1 — buggy code left
    // one connection on db 0 (only the arbitrary select() target switched).
    for (const conn of engine.conns) {
      asserts.assert(
        conn.sent.includes('SELECT'),
        `connection ${engine.conns.indexOf(conn)} never SELECTed db 1: ${
          conn.sent.join(',')
        }`,
      );
    }

    await engine.disconnect();
  });

  it('a connection created after select() handshakes onto the target db', async () => {
    const engine = new SelectStubRedisEngine('select-handshake', responder, {
      min: 1,
      max: 3,
    });
    await engine.connect(); // 1 connection on db 0.
    const before = engine.conns.length;
    await engine.select(2); // engine target is now db 2.

    // Concurrent gets force new connections to be created after select().
    await Promise.all([engine.get('x'), engine.get('y'), engine.get('z')]);
    asserts.assert(
      engine.conns.length > before,
      'expected new connections to be created',
    );

    // Every connection — including the ones created after select(2) — reached
    // db 2 (new connections adopt the target in their handshake).
    for (const conn of engine.conns) {
      asserts.assert(
        conn.sent.includes('SELECT'),
        `connection never reached db 2: ${conn.sent.join(',')}`,
      );
    }

    await engine.disconnect();
  });

  // Round-4 finding #2: `select()` used to move `__targetDb` *before* the
  // SELECT round-trip. A server that rejects the index (default `databases
  // 16`, a `databases 1` server, or cluster mode, which rejects SELECT
  // outright) then left the engine pointing at an index nothing can reach:
  // every later command, `multi`, and new-connection handshake failed in
  // `__ensureDb`/`__handshake`. One bad index wedged the whole engine — a
  // strictly worse outcome than the split-keyspace bug being fixed.
  const limitedResponder = (
    parts: ReadonlyArray<string | number>,
  ): Promise<RespValue> => {
    const verb = String(parts[0] ?? '');
    if (verb === 'SELECT' && Number(parts[1]) > 15) {
      return Promise.resolve({
        kind: 'error',
        value: new RespError('ERR DB index is out of range', 'ERR'),
      });
    }
    if (verb === 'GET') return Promise.resolve({ kind: 'bulk', value: 'v' });
    if (verb === 'EXEC') {
      return Promise.resolve({
        kind: 'array',
        value: [{ kind: 'string', value: 'OK' }],
      });
    }
    return ok('OK');
  };

  it('leaves the engine usable when the server rejects the SELECT', async () => {
    const engine = new SelectStubRedisEngine(
      'select-reject',
      limitedResponder,
      {
        min: 1,
        max: 1,
      },
    );
    await engine.connect();
    asserts.assertEquals(await engine.get('a'), 'v');

    await asserts.assertRejects(() => engine.select(99), EngineError);

    // The engine must still be on its previous database and fully working —
    // not stuck re-issuing a SELECT the server will never accept.
    asserts.assertEquals(await engine.get('a'), 'v');
    asserts.assertEquals(await engine.get('b'), 'v');
    // …including inside MULTI, which also runs `__ensureDb` first.
    await engine.multi([['SET', 'k', 'v']]);

    await engine.disconnect();
  });

  it('a connection created after a rejected select() still handshakes', async () => {
    const engine = new SelectStubRedisEngine(
      'select-reject-handshake',
      limitedResponder,
      { min: 1, max: 2 },
    );
    await engine.connect();
    await asserts.assertRejects(() => engine.select(42), EngineError);

    // Tear the pool down so the next command has to build a brand-new
    // connection: its handshake SELECTs the engine target, which must not be
    // the rejected index.
    await engine.disconnect();
    await engine.connect();
    asserts.assertEquals(await engine.get('a'), 'v');

    await engine.disconnect();
  });

  it('a successful select() after a rejected one still moves the pool', async () => {
    const engine = new SelectStubRedisEngine(
      'select-reject-recover',
      limitedResponder,
      { min: 2, max: 2 },
    );
    await engine.connect();
    await asserts.assertRejects(() => engine.select(64), EngineError);

    await engine.select(3);
    await Promise.all([engine.get('a'), engine.get('b')]);
    for (const conn of engine.conns) {
      asserts.assert(
        conn.sent.includes('SELECT'),
        `connection never SELECTed db 3: ${conn.sent.join(',')}`,
      );
    }

    await engine.disconnect();
  });
});

// A fake compat `Connection` whose socket resets: the write lands, then every
// read — and every subsequent write — rejects. This is what compat's
// `wrapNodeSocket` does after a TCP RST (it stores the socket error and
// rejects forever) and what Deno's native read does on ConnectionReset.
class RstSocket implements Connection {
  public closed = false;
  private __error: Error | null = null;
  constructor(private readonly __failOn: 'read' | 'write' = 'read') {}
  read(): Promise<Uint8Array | null> {
    if (this.__error) return Promise.reject(this.__error);
    this.__error = new Error('read ECONNRESET');
    return Promise.reject(this.__error);
  }
  write(_data: Uint8Array | string): Promise<number> {
    if (this.__error) return Promise.reject(this.__error);
    if (this.__failOn === 'write') {
      this.__error = new Error('write ECONNRESET');
      return Promise.reject(this.__error);
    }
    return Promise.resolve(0);
  }
  close(): void {
    this.closed = true;
  }
}

// Round-4 finding #1, Redis sibling: `RedisConnection` only flipped `closed`
// on a clean EOF (`read()` → `null`) and on the max-buffer overflow. A
// *rejected* read/write left `closed === false`, and `_validateResource` is
// exactly `!conn.closed` — so any path that releases instead of destroying
// (notably `BaseEngine.ping()`, which always `_release`s) put a dead socket
// back in the pool where it validated true forever.
describe('drivers.RedisEngine - transport-reject poisoning (offline)', () => {
  const enc = new TextEncoder();

  /** RedisEngine over scripted sockets, no handshake (mirrors the overflow suite). */
  class RstRedisEngine extends RedisEngine {
    public readonly conns: RedisConnection[] = [];
    constructor(name: string, private readonly __sockets: Connection[]) {
      super(name, { ...TEST_CONFIG, pool: { min: 0, max: 1 } });
    }
    protected override _createResource(): Promise<RedisConnection> {
      const socket = this.__sockets[this.conns.length]!;
      const conn = new RedisConnection(socket, 1024, this.instanceId);
      this.conns.push(conn);
      return Promise.resolve(conn);
    }
  }

  it('marks a connection closed when the read rejects', async () => {
    const engine = new RstRedisEngine('redis-rst-read', [
      new RstSocket('read'),
      new ScriptSocket([enc.encode('$8\r\nGENUINE!\r\n')]),
    ]);
    await engine.connect();

    // `ping()` releases (never destroys), so the pool's `!conn.closed`
    // validation is the only guard against re-serving the corpse.
    asserts.assertEquals(await engine.ping(), false);
    asserts.assertEquals(engine.conns[0]!.closed, true);

    // The next command runs on a fresh connection.
    asserts.assertEquals(await engine.get('k'), 'GENUINE!');
    asserts.assertEquals(engine.conns.length, 2);

    await engine.disconnect();
  });

  it('marks a connection closed when the write rejects', async () => {
    const engine = new RstRedisEngine('redis-rst-write', [
      new RstSocket('write'),
      new ScriptSocket([enc.encode('$8\r\nGENUINE!\r\n')]),
    ]);
    await engine.connect();

    asserts.assertEquals(await engine.ping(), false);
    asserts.assertEquals(engine.conns[0]!.closed, true);

    asserts.assertEquals(await engine.get('k'), 'GENUINE!');
    asserts.assertEquals(engine.conns.length, 2);

    await engine.disconnect();
  });
});
