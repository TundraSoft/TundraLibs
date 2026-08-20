/**
 * Memcached Engine Performance Benchmarks
 *
 * Benchmarks the connection pool and protocol throughput for the
 * MemcachedEngine driver.
 *
 * Run with: deno bench packages/drivers/engines/memcached/Engine.bench.ts --allow-all
 *
 * Requires a reachable Memcached server. Configure via env vars or
 * packages/drivers/.env (MEMCACHED_HOST, MEMCACHED_PORT). When the server
 * is unreachable the benchmark file exits early without running anything.
 */

import { bench } from '@tundralibs/compat/bench';
import { envArgs } from '@tundralibs/utils';
import { MemcachedEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');

const TEST_CONFIG = {
  host: env.get('MEMCACHED_HOST') || 'localhost',
  port: Number.parseInt(env.get('MEMCACHED_PORT') || '11211', 10),
};

// Pre-create one engine per pool size for use across benches. Each engine is
// connected once and reused, since reconnecting per iteration would dwarf the
// command latency.
const single = new MemcachedEngine('bench-single', {
  ...TEST_CONFIG,
  pool: { min: 1, max: 1 },
});
const pooled = new MemcachedEngine('bench-pool', {
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
    'Memcached server unreachable; skipping memcached benchmarks. ' +
      'Set MEMCACHED_HOST/MEMCACHED_PORT or populate packages/drivers/.env to enable.',
  );
} else {
  // Seed values used by `get` / counter benches.
  await single.flush();
  await single.set('bench:hit', 'hello', 600);
  await single.set('bench:counter', '0', 600);
  const padded = 'x'.repeat(1024);
  await single.set('bench:medium', padded, 600);

  const sampleObject = JSON.stringify({
    user: { id: 12345, name: 'Bench User', tags: ['a', 'b', 'c'] },
    metadata: { ts: '2026-01-01T00:00:00Z', version: 1 },
  });

  // ===========================================================================
  // SINGLE-CONNECTION BENCHES (pool min=max=1)
  // ===========================================================================

  bench('Memcached / set (1 conn) - small string', async () => {
    await single.set('bench:set:small', 'value', 60);
  });

  bench('Memcached / set (1 conn) - 1KB payload', async () => {
    await single.set('bench:set:medium', padded, 60);
  });

  bench('Memcached / set (1 conn) - JSON object', async () => {
    await single.set('bench:set:json', sampleObject, 60);
  });

  bench('Memcached / get (1 conn) - hit', async () => {
    await single.get('bench:hit');
  });

  bench('Memcached / get (1 conn) - miss', async () => {
    await single.get('bench:does-not-exist');
  });

  bench('Memcached / get (1 conn) - 1KB payload', async () => {
    await single.get('bench:medium');
  });

  bench('Memcached / incr (1 conn)', async () => {
    await single.incr('bench:counter', 1);
  });

  bench('Memcached / set + get round trip (1 conn)', async () => {
    await single.set('bench:rt', 'value', 60);
    await single.get('bench:rt');
  });

  bench('Memcached / version (1 conn)', async () => {
    await single.version();
  });

  // ===========================================================================
  // POOLED BENCHES (min=4, max=8) — measures throughput under concurrency
  // ===========================================================================

  bench('Memcached / set (pool 8) - small string', async () => {
    await pooled.set('bench:set:small', 'value', 60);
  });

  bench('Memcached / get (pool 8) - hit', async () => {
    await pooled.get('bench:hit');
  });

  bench(
    'Memcached / 16 concurrent gets (pool 8)',
    async () => {
      const ops = Array.from(
        { length: 16 },
        () => pooled.get('bench:hit'),
      );
      await Promise.all(ops);
    },
  );

  bench(
    'Memcached / 16 concurrent sets (pool 8)',
    async () => {
      const ops = Array.from(
        { length: 16 },
        (_, i) => pooled.set(`bench:set:concurrent:${i}`, 'value', 60),
      );
      await Promise.all(ops);
    },
  );

  bench(
    'Memcached / 16 mixed ops (pool 8)',
    async () => {
      const ops = Array.from({ length: 16 }, (_, i) => {
        if (i % 2 === 0) {
          return pooled.set(`bench:mixed:${i}`, 'value', 60);
        }
        return pooled.get('bench:hit');
      });
      await Promise.all(ops);
    },
  );

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  globalThis.addEventListener('unload', () => {
    Promise.allSettled([
      single.disconnect(),
      pooled.disconnect(),
    ]);
  });
}
