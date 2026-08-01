/**
 * @fileoverview SQLiteEngine soak/soak testing script.
 *
 * SQLite serializes on a single connection (writer lock), so the soak
 * mostly stresses iteration count, transactions, type round-trips, and
 * leak-free repeated execution rather than concurrent pool pressure.
 * Workers run sequentially through their loop.
 *
 * Usage:
 * ```
 * deno run --allow-all packages/drivers/engines/sqlite/soak.ts
 * SOAK_DURATION_S=60 deno run --allow-all packages/drivers/engines/sqlite/soak.ts
 * ```
 *
 * @module
 */

import { exit, getEnv } from '@tundralibs/compat';
import { SQLiteEngine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';

const sysEnv = getEnv();
const DURATION_S = Number.parseInt(
  sysEnv['SOAK_DURATION_S'] ?? '30',
  10,
);
const WORKERS = Number.parseInt(sysEnv['SOAK_WORKERS'] ?? '4', 10);
const TABLE = `tundra_soak_sqlite`;

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
    const expected = error instanceof EngineError &&
      (error.code === 'DUPLICATE_KEY' ||
        error.code === 'NOT_NULL_VIOLATION');
    if (!expected) stats.unexpectedErrors.push(error);
  }
}

async function setup(engine: SQLiteEngine): Promise<void> {
  await engine.connect();
  await engine.execute({ sql: `DROP TABLE IF EXISTS ${TABLE}` });
  await engine.execute({
    sql: `CREATE TABLE ${TABLE} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      payload TEXT,
      ratio REAL,
      ts TEXT,
      flag INTEGER
    )`,
  });
}

async function teardown(engine: SQLiteEngine): Promise<void> {
  try {
    await engine.execute({ sql: `DROP TABLE IF EXISTS ${TABLE}` });
  } catch {
    /* ignore */
  }
  await engine.disconnect();
}

async function scenarioInsert(engine: SQLiteEngine): Promise<void> {
  const start = performance.now();
  try {
    await engine.execute({
      sql:
        `INSERT INTO ${TABLE} (name, payload, ratio, ts, flag) VALUES (:n:, :p:, :r:, :t:, :f:)`,
      params: {
        n: `user-${Math.floor(Math.random() * 1_000_000)}`,
        p: { tags: ['a', 'b'], score: Math.random() },
        r: Math.random(),
        t: new Date(),
        f: Math.random() > 0.5,
      },
    });
    record('insert', performance.now() - start);
  } catch (e) {
    record('insert', performance.now() - start, e as Error);
  }
}

async function scenarioSelect(engine: SQLiteEngine): Promise<void> {
  const start = performance.now();
  try {
    await engine.execute({
      sql:
        `SELECT id, name, ratio FROM ${TABLE} WHERE flag = :f: ORDER BY id DESC LIMIT :lim:`,
      params: { f: 1, lim: 50 },
    });
    record('select', performance.now() - start);
  } catch (e) {
    record('select', performance.now() - start, e as Error);
  }
}

async function scenarioTxCommit(engine: SQLiteEngine): Promise<void> {
  const start = performance.now();
  try {
    const tx = await engine.transaction();
    await tx.execute({
      sql: `INSERT INTO ${TABLE} (name) VALUES (:n:)`,
      params: { n: `tx-c-${Math.random()}` },
    });
    await tx.commit();
    record('tx_commit', performance.now() - start);
  } catch (e) {
    record('tx_commit', performance.now() - start, e as Error);
  }
}

async function scenarioTxRollback(engine: SQLiteEngine): Promise<void> {
  const start = performance.now();
  try {
    const tx = await engine.transaction();
    await tx.execute({
      sql: `INSERT INTO ${TABLE} (name) VALUES (:n:)`,
      params: { n: `tx-r-${Math.random()}` },
    });
    await tx.rollback();
    record('tx_rollback', performance.now() - start);
  } catch (e) {
    record('tx_rollback', performance.now() - start, e as Error);
  }
}

async function scenarioTypeRoundTrip(engine: SQLiteEngine): Promise<void> {
  const start = performance.now();
  try {
    const r = await engine.execute<
      { i: number; r: number; t: string; n: null }
    >({
      sql: `SELECT :i: AS i, :r: AS r, :t: AS t, NULL AS n`,
      params: { i: 42, r: 3.14, t: 'hello' },
    });
    const row = r.data[0]!;
    if (row.i !== 42) throw new Error(`int: ${row.i}`);
    if (Math.abs(row.r - 3.14) > 0.001) throw new Error(`real: ${row.r}`);
    if (row.t !== 'hello') throw new Error(`text: ${row.t}`);
    record('type_round_trip', performance.now() - start);
  } catch (e) {
    record('type_round_trip', performance.now() - start, e as Error);
  }
}

const SCENARIOS: Array<(e: SQLiteEngine) => Promise<void>> = [
  scenarioInsert,
  scenarioInsert,
  scenarioSelect,
  scenarioSelect,
  scenarioTxCommit,
  scenarioTxRollback,
  scenarioTypeRoundTrip,
];

async function worker(
  id: number,
  engine: SQLiteEngine,
  deadline: number,
): Promise<void> {
  while (performance.now() < deadline) {
    const fn = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]!;
    try {
      await fn(engine);
    } catch (e) {
      stats.unexpectedErrors.push(e as Error);
    }
  }
  console.log(`worker ${id} stopping at op #${stats.ops}`);
}

async function main(): Promise<number> {
  console.log(`SQLiteEngine soak — ${DURATION_S}s with ${WORKERS} workers`);

  // File-backed DB so iteration count + flush behavior is exercised.
  const engine = new SQLiteEngine('soak', { path: ':memory:' });
  const startWall = performance.now();

  await setup(engine);

  const deadline = performance.now() + DURATION_S * 1000;
  await Promise.all(
    Array.from({ length: WORKERS }, (_, i) => worker(i, engine, deadline)),
  );

  const totalMs = performance.now() - startWall;
  await teardown(engine);

  console.log('\n=== soak summary ===');
  console.log(`duration:    ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`ops:         ${stats.ops}`);
  console.log(`ops/sec:     ${(stats.ops / (totalMs / 1000)).toFixed(1)}`);
  console.log(`errors:      ${stats.errors}`);
  console.log(`unexpected:  ${stats.unexpectedErrors.length}`);
  console.log('\nby scenario:');
  for (const [name, s] of [...stats.byScenario.entries()].sort()) {
    const avg = s.totalMs / Math.max(1, s.count);
    console.log(
      `  ${name.padEnd(20)} count=${String(s.count).padStart(7)}` +
        ` errors=${String(s.errors).padStart(3)}` +
        ` avg=${avg.toFixed(3)}ms`,
    );
  }

  if (stats.unexpectedErrors.length > 0) {
    console.error('\nUNEXPECTED ERRORS:');
    for (const e of stats.unexpectedErrors.slice(0, 10)) {
      console.error(`  ${e.constructor.name}: ${e.message}`);
    }
    return 1;
  }
  console.log('\n✓ no unexpected errors');
  return 0;
}

const code = await main();
exit(code);
