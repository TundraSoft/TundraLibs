/**
 * Redis Engine Performance Benchmarks.
 *
 * Run with: deno bench packages/drivers/engines/redis/Engine.bench.ts --allow-all
 *
 * Requires a reachable Redis server. Configure via env vars or
 * packages/drivers/.env (REDIS_HOST / REDIS_PORT). Skipped if unreachable.
 */

import { bench } from '@tundralibs/compat/bench';
import { envArgs } from '@tundralibs/utils';
import { RedisEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');
const TEST_CONFIG = {
  host: env.get('REDIS_HOST') || env.get('MEMCACHED_HOST') || 'localhost',
  port: Number.parseInt(env.get('REDIS_PORT') || '6379', 10),
};

const single = new RedisEngine('bench-single', {
  ...TEST_CONFIG,
  pool: { min: 1, max: 1 },
});
const pooled = new RedisEngine('bench-pool', {
  ...TEST_CONFIG,
  pool: { min: 4, max: 8 },
});

let serverAvailable = false;
try {
  await single.connect();
  await pooled.connect();
  serverAvailable = await single.ping() && await pooled.ping();
} catch {
  serverAvailable = false;
}

if (!serverAvailable) {
  console.warn(
    'Redis unreachable; skipping benchmarks. Configure REDIS_HOST/REDIS_PORT.',
  );
} else {
  // Seed shared keys.
  await single.flushDb();
  await single.set('bench:hit', 'hello');
  await single.set('bench:counter', '0');
  const padded = 'x'.repeat(1024);
  await single.set('bench:medium', padded);

  const sampleObject = JSON.stringify({
    user: { id: 12345, name: 'Bench User', tags: ['a', 'b', 'c'] },
    metadata: { ts: '2026-01-01T00:00:00Z', version: 1 },
  });

  // ===========================================================================
  // SINGLE CONNECTION
  // ===========================================================================

  bench('Redis / SET (1 conn) - small string', async () => {
    await single.set('bench:set:small', 'value');
  });

  bench('Redis / SET (1 conn) - 1KB payload', async () => {
    await single.set('bench:set:medium', padded);
  });

  bench('Redis / SET (1 conn) - JSON object', async () => {
    await single.set('bench:set:json', sampleObject);
  });

  bench('Redis / GET (1 conn) - hit', async () => {
    await single.get('bench:hit');
  });

  bench('Redis / GET (1 conn) - miss', async () => {
    await single.get('bench:does-not-exist');
  });

  bench('Redis / GET (1 conn) - 1KB payload', async () => {
    await single.get('bench:medium');
  });

  bench('Redis / INCR (1 conn)', async () => {
    await single.incr('bench:counter');
  });

  bench('Redis / SET + GET round trip (1 conn)', async () => {
    await single.set('bench:rt', 'value');
    await single.get('bench:rt');
  });

  bench('Redis / HSET multi-field (1 conn)', async () => {
    await single.hset('bench:hash', { a: '1', b: '2', c: '3' });
  });

  bench('Redis / HGETALL (1 conn)', async () => {
    await single.hgetAll('bench:hash');
  });

  bench('Redis / LPUSH+LRANGE 10 items (1 conn)', async () => {
    await single.del('bench:list');
    await single.rpush(
      'bench:list',
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
      'g',
      'h',
      'i',
      'j',
    );
    await single.lrange('bench:list', 0, -1);
  });

  bench('Redis / MULTI/EXEC 4 cmds (1 conn)', async () => {
    await single.multi([
      ['SET', 'bench:m:k1', 'v1'],
      ['INCR', 'bench:m:c'],
      ['GET', 'bench:m:k1'],
      ['DEL', 'bench:m:k1', 'bench:m:c'],
    ]);
  });

  bench('Redis / PING (1 conn)', async () => {
    await single.ping();
  });

  // ===========================================================================
  // POOL OF 8 — concurrency throughput
  // ===========================================================================

  bench('Redis / SET (pool 8) - small string', async () => {
    await pooled.set('bench:set:small', 'value');
  });

  bench('Redis / GET (pool 8) - hit', async () => {
    await pooled.get('bench:hit');
  });

  bench('Redis / 16 concurrent GETs (pool 8)', async () => {
    const ops = Array.from({ length: 16 }, () => pooled.get('bench:hit'));
    await Promise.all(ops);
  });

  bench('Redis / 16 concurrent SETs (pool 8)', async () => {
    const ops = Array.from(
      { length: 16 },
      (_, i) => pooled.set(`bench:set:concurrent:${i}`, 'value'),
    );
    await Promise.all(ops);
  });

  bench('Redis / 16 mixed ops (pool 8)', async () => {
    const ops = Array.from({ length: 16 }, (_, i) => {
      if (i % 2 === 0) return pooled.set(`bench:mixed:${i}`, 'value');
      return pooled.get('bench:hit');
    });
    await Promise.all(ops);
  });

  globalThis.addEventListener('unload', () => {
    Promise.allSettled([single.disconnect(), pooled.disconnect()]);
  });
}
