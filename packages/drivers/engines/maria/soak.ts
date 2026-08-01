/**
 * @fileoverview MariaEngine soak/soak testing script.
 *
 * Mirrors the Postgres soak pattern: random workload mix (insert,
 * select, bulk insert, transactions, type round-trips) running across
 * multiple worker tasks for a configurable duration.
 *
 * Usage:
 * ```
 * deno run --allow-all packages/drivers/engines/maria/soak.ts
 * SOAK_DURATION_S=120 deno run --allow-all packages/drivers/engines/maria/soak.ts
 * ```
 *
 * @module
 */

import { exit, getEnv } from '@tundralibs/compat';
import { envArgs } from '@tundralibs/utils';
import { MariaEngine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';

const env = envArgs('./packages/drivers/');
const sysEnv = getEnv();

const TEST_CONFIG = {
  host: env.get('MARIA_HOST') || 'localhost',
  port: Number.parseInt(env.get('MARIA_PORT') || '3306', 10),
  database: env.get('MARIA_DB') || 'mysql',
  username: env.get('MARIA_USER') || 'root',
  password: env.get('MARIA_PASSWORD') || '',
  pool: { min: 2, max: 8, acquireTimeoutSeconds: 10 },
};

const DURATION_S = Number.parseInt(
  sysEnv['SOAK_DURATION_S'] ?? '30',
  10,
);
const WORKERS = Number.parseInt(sysEnv['SOAK_WORKERS'] ?? '6', 10);
const TABLE = `tundra_soak_maria_${Date.now()}`;

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
        error.code === 'NOT_NULL_VIOLATION' ||
        error.code === 'SYNTAX_ERROR');
    if (!expected) stats.unexpectedErrors.push(error);
  }
}

async function setup(engine: MariaEngine): Promise<void> {
  await engine.connect();
  await engine.execute({ sql: `DROP TABLE IF EXISTS ${TABLE}` });
  await engine.execute({
    sql: `CREATE TABLE ${TABLE} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      payload JSON,
      ratio DOUBLE,
      big BIGINT,
      ts DATETIME(3),
      flag TINYINT(1)
    )`,
  });
}

async function teardown(engine: MariaEngine): Promise<void> {
  try {
    await engine.execute({ sql: `DROP TABLE IF EXISTS ${TABLE}` });
  } catch {
    /* ignore */
  }
  await engine.disconnect();
}

async function scenarioInsert(engine: MariaEngine): Promise<void> {
  const start = performance.now();
  try {
    await engine.execute({
      sql: `INSERT INTO ${TABLE} (name, payload, ratio, big, ts, flag)
            VALUES (:n:, :p:, :r:, :b:, :t:, :f:)`,
      params: {
        n: `user-${Math.floor(Math.random() * 1_000_000)}`,
        p: JSON.stringify({ tags: ['a', 'b'], score: Math.random() }),
        r: Math.random() * 100,
        b: Math.floor(Math.random() * 1e15),
        t: new Date().toISOString().slice(0, 19).replace('T', ' '),
        f: Math.random() > 0.5 ? 1 : 0,
      },
    });
    record('insert', performance.now() - start);
  } catch (e) {
    record('insert', performance.now() - start, e as Error);
  }
}

async function scenarioSelect(engine: MariaEngine): Promise<void> {
  const start = performance.now();
  try {
    await engine.execute({
      sql:
        `SELECT id, name, ratio FROM ${TABLE} WHERE flag = :f: ORDER BY id DESC LIMIT :lim:`,
      params: { f: 1, lim: 100 },
    });
    record('select', performance.now() - start);
  } catch (e) {
    record('select', performance.now() - start, e as Error);
  }
}

async function scenarioSelectLarge(engine: MariaEngine): Promise<void> {
  const start = performance.now();
  try {
    await engine.execute({
      sql: `SELECT * FROM ${TABLE} ORDER BY id DESC LIMIT :lim:`,
      params: { lim: 500 },
    });
    record('select_large', performance.now() - start);
  } catch (e) {
    record('select_large', performance.now() - start, e as Error);
  }
}

async function scenarioTxCommit(engine: MariaEngine): Promise<void> {
  const start = performance.now();
  try {
    const tx = await engine.transaction();
    await tx.execute({
      sql: `INSERT INTO ${TABLE} (name) VALUES (:n:)`,
      params: { n: `tx-commit-${Math.random()}` },
    });
    await tx.commit();
    record('tx_commit', performance.now() - start);
  } catch (e) {
    record('tx_commit', performance.now() - start, e as Error);
  }
}

async function scenarioTxRollback(engine: MariaEngine): Promise<void> {
  const start = performance.now();
  try {
    const tx = await engine.transaction();
    await tx.execute({
      sql: `INSERT INTO ${TABLE} (name) VALUES (:n:)`,
      params: { n: `tx-rollback-${Math.random()}` },
    });
    await tx.rollback();
    record('tx_rollback', performance.now() - start);
  } catch (e) {
    record('tx_rollback', performance.now() - start, e as Error);
  }
}

async function scenarioBulkInsert(engine: MariaEngine): Promise<void> {
  const start = performance.now();
  try {
    const rows = 25;
    const placeholders: string[] = [];
    const params: Record<string, unknown> = {};
    for (let i = 0; i < rows; i++) {
      placeholders.push(`(:n${i}:, :r${i}:, :f${i}:)`);
      params[`n${i}`] = `bulk-${i}-${Math.random()}`;
      params[`r${i}`] = Math.random();
      params[`f${i}`] = i % 2 === 0 ? 1 : 0;
    }
    await engine.execute({
      sql: `INSERT INTO ${TABLE} (name, ratio, flag)
            VALUES ${placeholders.join(', ')}`,
      params,
    });
    record('bulk_insert', performance.now() - start);
  } catch (e) {
    record('bulk_insert', performance.now() - start, e as Error);
  }
}

async function scenarioTypeRoundTrip(engine: MariaEngine): Promise<void> {
  const start = performance.now();
  try {
    const r = await engine.execute<{
      i: number;
      f: number;
      t: string;
    }>({
      sql: `SELECT :i: AS i, :f: AS f, :t: AS t`,
      params: { i: 42, f: 3.1415, t: 'hello' },
    });
    const row = r.data[0]!;
    if (Number(row.i) !== 42) throw new Error(`int: ${row.i}`);
    if (Math.abs(Number(row.f) - 3.1415) > 0.0001) {
      throw new Error(`float: ${row.f}`);
    }
    if (row.t !== 'hello') throw new Error(`text: ${row.t}`);
    record('type_round_trip', performance.now() - start);
  } catch (e) {
    record('type_round_trip', performance.now() - start, e as Error);
  }
}

const SCENARIOS: Array<(e: MariaEngine) => Promise<void>> = [
  scenarioInsert,
  scenarioInsert,
  scenarioSelect,
  scenarioSelect,
  scenarioSelectLarge,
  scenarioTxCommit,
  scenarioTxRollback,
  scenarioBulkInsert,
  scenarioTypeRoundTrip,
];

async function worker(
  id: number,
  engine: MariaEngine,
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
  console.log(`MariaEngine soak — ${DURATION_S}s with ${WORKERS} workers`);
  console.log(`target: ${TEST_CONFIG.host}:${TEST_CONFIG.port}`);

  const engine = new MariaEngine('soak', TEST_CONFIG);
  const startWall = performance.now();

  engine.on('connect', (id) => console.log(`[connect]    ${id}`));
  engine.on('disconnect', (id) => console.log(`[disconnect] ${id}`));
  engine.on(
    'connectionFailed',
    (id, err) => console.log(`[fail] ${id}: ${err.message}`),
  );

  await setup(engine);
  console.log(`pool warmed: ${JSON.stringify(engine.poolStats)}`);

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
  console.log(`final pool:  ${JSON.stringify(engine.poolStats)}`);
  console.log('\nby scenario:');
  for (const [name, s] of [...stats.byScenario.entries()].sort()) {
    const avg = s.totalMs / Math.max(1, s.count);
    console.log(
      `  ${name.padEnd(20)} count=${String(s.count).padStart(5)}` +
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
