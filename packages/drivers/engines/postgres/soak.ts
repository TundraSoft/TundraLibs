/**
 * @fileoverview Postgres driver soak/soak testing script.
 *
 * Hammers `PostgresEngine` with a realistic mix of workloads to surface
 * bugs that won't show up in unit tests:
 *
 * - Concurrent SELECT / INSERT under pool pressure
 * - Transactions (commit + rollback, with auto-rollback on failure)
 * - Type round-trips for every PG type the driver claims to support
 * - Bulk inserts (many params)
 * - Large result sets
 * - Repeated execution to catch slow leaks
 *
 * Run for a configurable duration (default 30 s, override with
 * `SOAK_DURATION_S=N`), then prints stats and exits non-zero on any
 * unexpected error.
 *
 * Usage:
 * ```
 * deno run --allow-all packages/drivers/engines/postgres/soak.ts
 * SOAK_DURATION_S=120 deno run --allow-all packages/drivers/engines/postgres/soak.ts
 * ```
 *
 * @module
 */

import { exit, getEnv } from '@tundralibs/compat';
import { envArgs } from '@tundralibs/utils';
import { PostgresEngine } from './Engine.ts';
import { EngineError } from '../../errors/mod.ts';

const env = envArgs('./packages/drivers/');
const sysEnv = getEnv();

const TEST_CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
  database: env.get('POSTGRES_DB') || 'postgres',
  username: env.get('POSTGRES_USER') || 'postgres',
  password: env.get('POSTGRES_PASSWORD') || '',
  pool: { min: 2, max: 8, acquireTimeoutSeconds: 10 },
};

const DURATION_S = Number.parseInt(
  sysEnv['SOAK_DURATION_S'] ?? '30',
  10,
);
const WORKERS = Number.parseInt(sysEnv['SOAK_WORKERS'] ?? '6', 10);

const TABLE = `tundra_soak_${Date.now()}`;

type Stats = {
  ops: number;
  errors: number;
  slowOps: number;
  byScenario: Map<string, { count: number; errors: number; totalMs: number }>;
  unexpectedErrors: Error[];
};

const stats: Stats = {
  ops: 0,
  errors: 0,
  slowOps: 0,
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
    // PG-side errors that we DELIBERATELY trigger (rollback scenario, dup
    // key tests) are expected. Treat anything else as unexpected.
    const expected = error instanceof EngineError &&
      (error.code === 'DUPLICATE_KEY' ||
        error.code === 'NOT_NULL_VIOLATION' ||
        error.code === 'SYNTAX_ERROR');
    if (!expected) stats.unexpectedErrors.push(error);
  }
}

async function setup(engine: PostgresEngine): Promise<void> {
  await engine.connect();
  await engine.execute({
    sql: `DROP TABLE IF EXISTS ${TABLE}`,
  });
  await engine.execute({
    sql: `CREATE TABLE ${TABLE} (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      payload JSONB,
      ratio FLOAT8,
      big BIGINT,
      ts TIMESTAMPTZ,
      blob BYTEA,
      flag BOOLEAN
    )`,
  });
}

async function teardown(engine: PostgresEngine): Promise<void> {
  try {
    await engine.execute({ sql: `DROP TABLE IF EXISTS ${TABLE}` });
  } catch {
    /* ignore */
  }
  await engine.disconnect();
}

// ---- Scenarios ----------------------------------------------------------

async function scenarioInsert(engine: PostgresEngine): Promise<void> {
  const start = performance.now();
  try {
    await engine.execute({
      sql: `INSERT INTO ${TABLE} (name, payload, ratio, big, ts, blob, flag)
         VALUES (:n:, :p:, :r:, :b:, :t:, :bl:, :f:)`,
      params: {
        n: `user-${Math.floor(Math.random() * 1_000_000)}`,
        p: { tags: ['a', 'b'], score: Math.random() },
        r: Math.random() * 100,
        b: BigInt(Math.floor(Math.random() * 1e15)),
        t: new Date(),
        bl: new Uint8Array([1, 2, 3, 4, 5]),
        f: Math.random() > 0.5,
      },
    });
    record('insert', performance.now() - start);
  } catch (e) {
    record('insert', performance.now() - start, e as Error);
  }
}

async function scenarioSelect(engine: PostgresEngine): Promise<void> {
  const start = performance.now();
  try {
    await engine.execute({
      sql: `SELECT id, name, payload, ratio FROM ${TABLE}
            WHERE flag = :f: ORDER BY id DESC LIMIT :lim:`,
      params: { f: true, lim: 100 },
    });
    record('select', performance.now() - start);
  } catch (e) {
    record('select', performance.now() - start, e as Error);
  }
}

async function scenarioSelectLarge(engine: PostgresEngine): Promise<void> {
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

async function scenarioTxCommit(engine: PostgresEngine): Promise<void> {
  const start = performance.now();
  try {
    const tx = await engine.transaction();
    await tx.execute({
      sql: `INSERT INTO ${TABLE} (name) VALUES (:n:)`,
      params: { n: `tx-commit-${Math.random()}` },
    });
    await tx.execute({
      sql:
        `UPDATE ${TABLE} SET flag = NOT flag WHERE id = (SELECT MAX(id) FROM ${TABLE})`,
    });
    await tx.commit();
    record('tx_commit', performance.now() - start);
  } catch (e) {
    record('tx_commit', performance.now() - start, e as Error);
  }
}

async function scenarioTxRollback(engine: PostgresEngine): Promise<void> {
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

async function scenarioTxAutoRollback(engine: PostgresEngine): Promise<void> {
  const start = performance.now();
  try {
    const tx = await engine.transaction();
    try {
      // First insert succeeds.
      await tx.execute({
        sql: `INSERT INTO ${TABLE} (name) VALUES (:n:)`,
        params: { n: 'tx-auto-1' },
      });
      // Force a NOT NULL violation — driver should auto-rollback.
      await tx.execute({
        sql: `INSERT INTO ${TABLE} (name) VALUES (NULL)`,
      });
    } catch {
      // Expected — auto-rollback already happened.
    }
    // Make sure the helper is idempotent after auto-rollback.
    await tx.rollback();
    record('tx_auto_rollback', performance.now() - start);
  } catch (e) {
    record('tx_auto_rollback', performance.now() - start, e as Error);
  }
}

async function scenarioBulkInsert(engine: PostgresEngine): Promise<void> {
  const start = performance.now();
  try {
    // Single multi-row INSERT — exercises a long parameter list.
    const rows = 25;
    const placeholders: string[] = [];
    const params: Record<string, unknown> = {};
    for (let i = 0; i < rows; i++) {
      placeholders.push(`(:n${i}:, :r${i}:, :f${i}:)`);
      params[`n${i}`] = `bulk-${i}-${Math.random()}`;
      params[`r${i}`] = Math.random();
      params[`f${i}`] = i % 2 === 0;
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

async function scenarioTypeRoundTrip(engine: PostgresEngine): Promise<void> {
  const start = performance.now();
  try {
    const r = await engine.execute<{
      i: number;
      bi: bigint;
      f: number;
      b: boolean;
      t: string;
      n: null;
      ts: Date;
      j: { x: number };
    }>({
      sql: `
        SELECT
          :i:::int AS i,
          :bi:::bigint AS bi,
          :f:::float8 AS f,
          :b:::bool AS b,
          :t:::text AS t,
          NULL::int AS n,
          :ts:::timestamptz AS ts,
          :j:::jsonb AS j
      `,
      params: {
        i: 42,
        bi: 9_000_000_000_000n,
        f: 3.1415,
        b: true,
        t: 'hello',
        ts: new Date('2026-04-28T00:30:00.000Z'),
        j: { x: 42 },
      },
    });
    const row = r.data[0]!;
    if (row.i !== 42) throw new Error(`int round-trip failed: ${row.i}`);
    if (row.bi !== 9_000_000_000_000n) {
      throw new Error(`bigint round-trip failed: ${row.bi}`);
    }
    if (Math.abs(row.f - 3.1415) > 0.0001) {
      throw new Error(`float8 round-trip failed: ${row.f}`);
    }
    if (row.b !== true) throw new Error(`bool round-trip failed: ${row.b}`);
    if (row.t !== 'hello') throw new Error(`text round-trip failed: ${row.t}`);
    if (row.n !== null) throw new Error(`null round-trip failed: ${row.n}`);
    if (!(row.ts instanceof Date)) {
      throw new Error(`timestamptz round-trip failed: ${row.ts}`);
    }
    if (row.j.x !== 42) {
      throw new Error(`jsonb round-trip failed: ${JSON.stringify(row.j)}`);
    }
    record('type_round_trip', performance.now() - start);
  } catch (e) {
    record('type_round_trip', performance.now() - start, e as Error);
  }
}

const SCENARIOS: Array<(e: PostgresEngine) => Promise<void>> = [
  scenarioInsert,
  scenarioInsert, // weight
  scenarioSelect,
  scenarioSelect, // weight
  scenarioSelectLarge,
  scenarioTxCommit,
  scenarioTxRollback,
  scenarioTxAutoRollback,
  scenarioBulkInsert,
  scenarioTypeRoundTrip,
];

async function worker(
  id: number,
  engine: PostgresEngine,
  deadline: number,
): Promise<void> {
  while (performance.now() < deadline) {
    const fn = SCENARIOS[Math.floor(Math.random() * SCENARIOS.length)]!;
    try {
      await fn(engine);
    } catch (e) {
      stats.unexpectedErrors.push(e as Error);
    }
    // Tiny jitter so workers don't all hit the same scenario at once.
    if (Math.random() < 0.1) {
      await new Promise((r) => setTimeout(r, 1));
    }
  }
  console.log(`worker ${id} stopping at op #${stats.ops}`);
}

// ---- Main ---------------------------------------------------------------

async function main(): Promise<number> {
  console.log(`PostgresEngine soak — ${DURATION_S}s with ${WORKERS} workers`);
  console.log(`target: ${TEST_CONFIG.host}:${TEST_CONFIG.port}`);

  const engine = new PostgresEngine('soak', TEST_CONFIG);
  const startWall = performance.now();

  // Wire up the events we care about so we can observe what the driver emits.
  engine.on('connect', (id) => console.log(`[connect]    ${id}`));
  engine.on('disconnect', (id) => console.log(`[disconnect] ${id}`));
  engine.on(
    'connectionFailed',
    (id, err) => console.log(`[fail] ${id}: ${err.message}`),
  );
  engine.on('slowQuery', () => stats.slowOps++);

  await setup(engine);
  console.log(`pool warmed: ${JSON.stringify(engine.poolStats)}`);

  const deadline = performance.now() + DURATION_S * 1000;
  const workers = Array.from(
    { length: WORKERS },
    (_, i) => worker(i, engine, deadline),
  );
  await Promise.all(workers);

  const totalMs = performance.now() - startWall;
  await teardown(engine);

  // ---- Report ------------------------------------------------------------
  console.log('\n=== soak summary ===');
  console.log(`duration:    ${(totalMs / 1000).toFixed(1)}s`);
  console.log(`ops:         ${stats.ops}`);
  console.log(`ops/sec:     ${(stats.ops / (totalMs / 1000)).toFixed(1)}`);
  console.log(`errors:      ${stats.errors}`);
  console.log(`slow ops:    ${stats.slowOps}`);
  console.log(`unexpected:  ${stats.unexpectedErrors.length}`);
  console.log(`final pool:  ${JSON.stringify(engine.poolStats)}`);
  const queryStats = engine.queryStats;
  console.log(`engine.queryStats: ${JSON.stringify(queryStats)}`);
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
