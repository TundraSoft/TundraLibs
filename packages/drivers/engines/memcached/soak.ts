/**
 * @fileoverview MemcachedEngine soak/soak testing script.
 *
 * Random workload mix (set/get/add/replace/cas/incr/touch/delete) under
 * concurrent pool pressure for a configurable duration.
 *
 * Usage:
 * ```
 * deno run --allow-all packages/drivers/engines/memcached/soak.ts
 * SOAK_DURATION_S=120 deno run --allow-all packages/drivers/engines/memcached/soak.ts
 * ```
 *
 * @module
 */

import { exit, getEnv } from '@tundralibs/compat';
import { envArgs } from '@tundralibs/utils';
import { MemcachedEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');
const sysEnv = getEnv();

const TEST_CONFIG = {
  host: env.get('MEMCACHED_HOST') || 'localhost',
  port: Number.parseInt(env.get('MEMCACHED_PORT') || '11211', 10),
  pool: { min: 2, max: 8, acquireTimeoutSeconds: 10 },
};

const DURATION_S = Number.parseInt(
  sysEnv['SOAK_DURATION_S'] ?? '30',
  10,
);
const WORKERS = Number.parseInt(sysEnv['SOAK_WORKERS'] ?? '6', 10);
const KEY_PREFIX = `tundra_soak_mc_${Date.now()}`;

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
// the same key.
let _keyCounter = 0;
function mkey(suffix: string): string {
  return `${KEY_PREFIX}_${++_keyCounter}_${suffix}`;
}

async function scenarioSetGet(engine: MemcachedEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = mkey('s');
    await engine.set(k, JSON.stringify({ v: Math.random() }), 60);
    const v = await engine.get(k);
    if (v === null) throw new Error('get null after set');
    JSON.parse(v);
    record('set_get', performance.now() - start);
  } catch (e) {
    record('set_get', performance.now() - start, e as Error);
  }
}

async function scenarioAdd(engine: MemcachedEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = mkey('a');
    const ok = await engine.add(k, 'first', 60);
    if (!ok) throw new Error('add returned false on fresh key');
    // Second add must fail.
    const dup = await engine.add(k, 'second', 60);
    if (dup) throw new Error('add succeeded on duplicate key');
    record('add', performance.now() - start);
  } catch (e) {
    record('add', performance.now() - start, e as Error);
  }
}

async function scenarioReplace(engine: MemcachedEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = mkey('r');
    await engine.set(k, 'orig', 60);
    const ok = await engine.replace(k, 'replaced', 60);
    if (!ok) throw new Error('replace returned false on existing key');
    const v = await engine.get(k);
    if (v !== 'replaced') throw new Error(`expected 'replaced', got '${v}'`);
    record('replace', performance.now() - start);
  } catch (e) {
    record('replace', performance.now() - start, e as Error);
  }
}

async function scenarioCas(engine: MemcachedEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = mkey('c');
    await engine.set(k, 'a', 60);
    const got = await engine.gets(k);
    if (!got) throw new Error('gets returned null');
    const ok = await engine.cas(k, 'b', got.cas, 60);
    if (!ok) throw new Error('cas with valid token failed');
    // CAS with stale token must fail.
    const stale = await engine.cas(k, 'c', got.cas, 60);
    if (stale) throw new Error('cas with stale token succeeded');
    record('cas', performance.now() - start);
  } catch (e) {
    record('cas', performance.now() - start, e as Error);
  }
}

async function scenarioIncrDecr(engine: MemcachedEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = mkey('cnt');
    await engine.set(k, '10', 60);
    const after = await engine.incr(k, 5);
    if (after !== 15) throw new Error(`expected 15, got ${after}`);
    const back = await engine.decr(k, 5);
    if (back !== 10) throw new Error(`expected 10, got ${back}`);
    record('incr_decr', performance.now() - start);
  } catch (e) {
    record('incr_decr', performance.now() - start, e as Error);
  }
}

async function scenarioTouch(engine: MemcachedEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = mkey('t');
    await engine.set(k, 'x', 5);
    const ok = await engine.touch(k, 60);
    if (!ok) throw new Error('touch returned false on existing key');
    record('touch', performance.now() - start);
  } catch (e) {
    record('touch', performance.now() - start, e as Error);
  }
}

async function scenarioDelete(engine: MemcachedEngine): Promise<void> {
  const start = performance.now();
  try {
    const k = mkey('d');
    await engine.set(k, 'x', 60);
    const removed = await engine.delete(k);
    if (!removed) throw new Error('delete returned false on existing key');
    record('delete', performance.now() - start);
  } catch (e) {
    record('delete', performance.now() - start, e as Error);
  }
}

const SCENARIOS: Array<(e: MemcachedEngine) => Promise<void>> = [
  scenarioSetGet,
  scenarioSetGet,
  scenarioSetGet,
  scenarioAdd,
  scenarioReplace,
  scenarioCas,
  scenarioIncrDecr,
  scenarioTouch,
  scenarioDelete,
];

async function worker(
  id: number,
  engine: MemcachedEngine,
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
  console.log(`MemcachedEngine soak — ${DURATION_S}s with ${WORKERS} workers`);
  console.log(`target: ${TEST_CONFIG.host}:${TEST_CONFIG.port}`);

  const engine = new MemcachedEngine('soak', TEST_CONFIG);
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
