/**
 * PostgreSQL Engine Performance Benchmarks.
 *
 * Run with: deno bench packages/drivers/engines/postgres/Engine.bench.ts --allow-all
 */

import { bench } from '@tundralibs/compat/bench';
import { envArgs } from '@tundralibs/utils';
import { PostgresEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');
const TEST_CONFIG = {
  host: env.get('POSTGRES_HOST') || 'localhost',
  port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
  database: env.get('POSTGRES_DB') || 'postgres',
  username: env.get('POSTGRES_USER') || 'postgres',
  password: env.get('POSTGRES_PASSWORD') || '',
};

const single = new PostgresEngine('bench-single', {
  ...TEST_CONFIG,
  pool: { min: 1, max: 1 },
});
const pooled = new PostgresEngine('bench-pool', {
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
  console.warn('PostgreSQL unreachable; skipping benchmarks.');
} else {
  const TABLE = 'tundra_bench_pg';
  await single.execute({
    sql: `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INT PRIMARY KEY,
      name TEXT,
      payload TEXT,
      ts TIMESTAMP DEFAULT NOW()
    )`,
  });
  await single.execute({ sql: `TRUNCATE TABLE ${TABLE}` });
  for (let i = 0; i < 100; i++) {
    await single.execute({
      sql:
        `INSERT INTO ${TABLE} (id, name, payload) VALUES (:id:, :name:, :p:)`,
      params: { id: i, name: `name-${i}`, p: 'x'.repeat(64) },
    });
  }

  bench('Postgres / SELECT 1 (1 conn)', async () => {
    await single.execute({ sql: 'SELECT 1' });
  });

  bench('Postgres / SELECT by PK (1 conn)', async () => {
    await single.execute({
      sql: `SELECT * FROM ${TABLE} WHERE id = :id:`,
      params: { id: 42 },
    });
  });

  bench('Postgres / SELECT 10 rows (1 conn)', async () => {
    await single.execute({
      sql: `SELECT * FROM ${TABLE} WHERE id BETWEEN :a: AND :b:`,
      params: { a: 0, b: 9 },
    });
  });

  bench('Postgres / INSERT + DELETE (1 conn)', async () => {
    await single.execute({
      sql: `INSERT INTO ${TABLE} (id, name) VALUES (:id:, :n:)`,
      params: { id: 9999, n: 'tmp' },
    });
    await single.execute({
      sql: `DELETE FROM ${TABLE} WHERE id = :id:`,
      params: { id: 9999 },
    });
  });

  bench(
    'Postgres / Transaction (BEGIN+INSERT+COMMIT) (1 conn)',
    async () => {
      const tx = await single.transaction();
      await tx.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES (:id:, :n:)`,
        params: { id: 10000, n: 'tx' },
      });
      await tx.commit();
      await single.execute({
        sql: `DELETE FROM ${TABLE} WHERE id = :id:`,
        params: { id: 10000 },
      });
    },
  );

  bench('Postgres / 16 concurrent SELECTs (pool 8)', async () => {
    const ops = Array.from(
      { length: 16 },
      () =>
        pooled.execute({
          sql: `SELECT * FROM ${TABLE} WHERE id = :id:`,
          params: { id: 1 },
        }),
    );
    await Promise.all(ops);
  });

  bench('Postgres / type-decode mix (1 conn)', async () => {
    await single.execute({
      sql: `SELECT
        42::int AS i,
        42::bigint AS bi,
        3.14::float8 AS f,
        true AS b,
        'hello'::text AS t,
        NOW() AS ts,
        '{"a":1}'::jsonb AS j`,
    });
  });

  globalThis.addEventListener('unload', () => {
    Promise.allSettled([single.disconnect(), pooled.disconnect()]);
  });
}
