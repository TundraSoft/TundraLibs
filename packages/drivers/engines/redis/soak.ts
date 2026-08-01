/**
 * @fileoverview RedisEngine soak/soak testing script.
 *
 * Mirrors the Postgres soak pattern but exercises Redis-shaped
 * operations (string KV, hashes, lists, scan, expire/ttl, mget/mset,
 * incr/decr) under concurrent pool pressure.
 *
 * Usage:
 * ```
 * deno run --allow-all packages/drivers/engines/redis/soak.ts
 * SOAK_DURATION_S=120 deno run --allow-all packages/drivers/engines/redis/soak.ts
 * ```
 *
 * @module
 */

import { exit, getEnv } from '@tundralibs/compat';
import { envArgs } from '@tundralibs/utils';
import { RedisEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');

const TEST_CONFIG = {
  host: env.get('REDIS_HOST') || env.get('MEMCACHED_HOST') || 'localhost',
  port: Number.parseInt(env.get('REDIS_PORT') || '6379', 10),
  database: 0,
  pool: { min: 2, max: 8, acquireTimeoutSeconds: 10 },
};

const sysEnv = getEnv();
const DURATION_S = Number.parseInt(
  sysEnv['SOAK_DURATION_S'] ?? '30',
  10,
);
const WORKERS = Number.parseInt(sysEnv['SOAK_WORKERS'] ?? '6', 10);
const KEY_PREFIX = `tundra:soak:${Date.now()}`;

type Stats = {
  ops: number;
  errors: number;
  byScenario: Map<string, { count: number; errors: number; totalMs: number }>;
  unexpectedErrors: Error[];
};

const stats: Stats = {
  ops: 0,
  errors: 0,
  byScenario: new Map(),
  unexpectedErrors: [],
};

function record(scenario: string, ms: number, error?: Error): void {
  stats.ops++;
  let slot = stats.byScenario.get(scenario);
  if (!slot) {
    slot = { count: 0, errors: 0, totalMs: 0 };
    stats.byScenario.set(scenario, slot);
  }
  slot.count++;
  slot.totalMs += ms;
  if (error) {
    stats.errors++;
    slot.errors++;
    stats.unexpectedErrors.push(error);
  }
}

// Per-process counter so workers running in parallel never collide on
// the same key (a 10_000-bucket random was not enough — under 100k ops
// the birthday-paradox makes collisions certain, which corrupts
// scenarios that assume a fresh key each call).
let _keyCounter = 0;
function rkey(suffix: string): string {
  return `${KEY_PREFIX}:${++_keyCounter}:${suffix}`;
}

async function scenarioSetGet(engine: RedisEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = rkey('s');
    await engine.set(k, JSON.stringify({ v: Math.random() }), { ex: 60 });
    const v = await engine.get(k);
    if (v === null) throw new Error('get returned null after set');
    JSON.parse(v); // verify roundtrip parse
    record('set_get', performance.now() - start);
  } catch (e) {
    record('set_get', performance.now() - start, e as Error);
  }
}

async function scenarioMSetMGet(engine: RedisEngine): Promise<void> {
  const start = performance.now();
  try {
    const pairs: Record<string, string> = {};
    const keys: string[] = [];
    for (let i = 0; i < 5; i++) {
      const k = rkey(`m${i}`);
      keys.push(k);
      pairs[k] = `value-${i}`;
    }
    await engine.mset(pairs);
    const r = await engine.mget(...keys);
    if (r.length !== 5) throw new Error(`expected 5 values, got ${r.length}`);
    record('mset_mget', performance.now() - start);
  } catch (e) {
    record('mset_mget', performance.now() - start, e as Error);
  }
}

async function scenarioIncrDecr(engine: RedisEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = rkey('cnt');
    await engine.incr(k);
    await engine.incrBy(k, 5);
    await engine.decr(k);
    const v = await engine.get(k);
    if (v !== '5') throw new Error(`expected '5', got '${v}'`);
    record('incr_decr', performance.now() - start);
  } catch (e) {
    record('incr_decr', performance.now() - start, e as Error);
  }
}

async function scenarioExpire(engine: RedisEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = rkey('exp');
    await engine.set(k, 'x');
    const ok = await engine.expire(k, 30);
    if (!ok) throw new Error('expire returned false on existing key');
    const ttl = await engine.ttl(k);
    if (ttl < 0) throw new Error(`unexpected ttl: ${ttl}`);
    record('expire', performance.now() - start);
  } catch (e) {
    record('expire', performance.now() - start, e as Error);
  }
}

async function scenarioHash(engine: RedisEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = rkey('h');
    await engine.hset(k, { name: 'alice', age: '30', active: 'true' });
    const all = await engine.hgetAll(k);
    if (all.name !== 'alice') throw new Error(`hash get name: ${all.name}`);
    record('hash', performance.now() - start);
  } catch (e) {
    record('hash', performance.now() - start, e as Error);
  }
}

async function scenarioScan(engine: RedisEngine): Promise<void> {
  const start = performance.now();
  try {
    let cursor = '0';
    let total = 0;
    let iter = 0;
    do {
      const r = await engine.scan(cursor, {
        match: `${KEY_PREFIX}:*`,
        count: 50,
      });
      cursor = r.cursor;
      total += r.keys.length;
      iter++;
      // Don't run forever — bound iterations.
      if (iter > 100) break;
    } while (cursor !== '0');
    record('scan', performance.now() - start);
    void total;
  } catch (e) {
    record('scan', performance.now() - start, e as Error);
  }
}

async function scenarioDelete(engine: RedisEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = rkey('d');
    await engine.set(k, 'x');
    const removed = await engine.del(k);
    if (removed !== 1) throw new Error(`expected del=1, got ${removed}`);
    record('delete', performance.now() - start);
  } catch (e) {
    record('delete', performance.now() - start, e as Error);
  }
}

const SCENARIOS: Array<(e: RedisEngine) => Promise<void>> = [
  scenarioSetGet,
  scenarioSetGet,
  scenarioSetGet, // weight reads/writes higher
  scenarioMSetMGet,
  scenarioIncrDecr,
  scenarioExpire,
  scenarioHash,
  scenarioScan,
  scenarioDelete,
];

async function worker(
  id: number,
  engine: RedisEngine,
  deadline: number,
): Promise<void> {
  while (performance.now() < deadline) {
    const fn = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]!;
    try {
      await fn(engine);
    } catch (e) {
      stats.unexpectedErrors.push(e as Error);
    }
    if (Math.random() < 0.1) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }
  console.log(`worker ${id} stopping at op #${stats.ops}`);
}

async function main(): Promise<number> {
  console.log(`RedisEngine soak — ${DURATION_S}s with ${WORKERS} workers`);
  console.log(`target: ${TEST_CONFIG.host}:${TEST_CONFIG.port}`);

  const engine = new RedisEngine('soak', TEST_CONFIG);
  const startWall = performance.now();

  engine.on('connect', (id) => console.log(`[connect]    ${id}`));
  engine.on('disconnect', (id) => console.log(`[disconnect] ${id}`));
  engine.on(
    'connectionFailed',
    (id, err) => console.log(`[fail] ${id}: ${err.message}`),
  );

  await engine.connect();
  console.log(`pool warmed: ${JSON.stringify(engine.poolStats)}`);

  const deadline = performance.now() + DURATION_S * 1000;
  await Promise.all(
    Array.from({ length: WORKERS }, (_, i) => worker(i, engine, deadline)),
  );

  const totalMs = performance.now() - startWall;

  // Cleanup keys.
  try {
    let cursor = '0';
    do {
      const r = await engine.scan(cursor, {
        match: `${KEY_PREFIX}:*`,
        count: 200,
      });
      cursor = r.cursor;
      if (r.keys.length > 0) await engine.del(...r.keys);
    } while (cursor !== '0');
  } catch {
    /* ignore */
  }
  await engine.disconnect();

  console.log('\n=== soak summary ===');
  console.log(`duration:    ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`ops:         ${stats.ops}`);
  console.log(`ops/sec:     ${(stats.ops / (totalMs / 1000)).toFixed(1)}`);
  console.log(`errors:      ${stats.errors}`);
  console.log(`unexpected:  ${stats.unexpectedErrors.length}`);
  console.log(`final pool:  ${JSON.stringify(engine.poolStats)}`);
  console.log('\nby scenario:');
  for (const [name, s] of [...stats.byScenario.entries()].sort()) {
    const avg = s.totalMs / Math.max(1, s.count);
    console.log(
      `  ${name.padEnd(20)} count=${String(s.count).padStart(6)}` +
        ` errors=${String(s.errors).padStart(3)}` +
        ` avg=${avg.toFixed(2)}ms`,
    );
  }

  if (stats.unexpectedErrors.length > 0) {
    console.error('\nUNEXPECTED ERRORS:');
    for (const e of stats.unexpectedErrors.slice(0, 10)) {
      console.error(`  ${e.constructor.name}: ${e.message}`);
    }
    if (stats.unexpectedErrors.length > 10) {
      console.error(
        `  ... ${stats.unexpectedErrors.length - 10} more suppressed`,
      );
    }
    return 1;
  }
  console.log('\n✓ no unexpected errors');
  return 0;
}

const code = await main();
exit(code);
