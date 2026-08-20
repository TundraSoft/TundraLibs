/**
 * MariaDB Engine Performance Benchmarks.
 *
 * Run with: deno bench packages/drivers/engines/maria/Engine.bench.ts --allow-all
 */

import { bench } from '@tundralibs/compat/bench';
import { envArgs } from '@tundralibs/utils';
import { MariaEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');
const TEST_CONFIG = {
  host: env.get('MARIA_HOST') || 'localhost',
  port: Number.parseInt(env.get('MARIA_PORT') || '3306', 10),
  database: env.get('MARIA_DB') || 'mysql',
  username: env.get('MARIA_USER') || 'root',
  password: env.get('MARIA_PASSWORD') || '',
};

const single = new MariaEngine('bench-single', {
  ...TEST_CONFIG,
  pool: { min: 1, max: 1 },
});
const pooled = new MariaEngine('bench-pool', {
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
  console.warn('MariaDB unreachable; skipping benchmarks.');
} else {
  // Seed.
  const TABLE = 'tundra_bench_maria';
  await single.execute({
    sql: `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INT PRIMARY KEY,
      name VARCHAR(255),
      payload TEXT
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

  bench('Maria / SELECT 1 (1 conn)', async () => {
    await single.execute({ sql: 'SELECT 1 AS v' });
  });

  bench('Maria / SELECT by PK (1 conn)', async () => {
    await single.execute({
      sql: `SELECT * FROM ${TABLE} WHERE id = :id:`,
      params: { id: 42 },
    });
  });

  bench('Maria / SELECT 10 rows (1 conn)', async () => {
    await single.execute({
      sql: `SELECT * FROM ${TABLE} WHERE id BETWEEN :a: AND :b:`,
      params: { a: 0, b: 9 },
    });
  });

  bench('Maria / INSERT + DELETE (1 conn)', async () => {
    await single.execute({
      sql: `INSERT INTO ${TABLE} (id, name) VALUES (:id:, :n:)`,
      params: { id: 9999, n: 'tmp' },
    });
    await single.execute({
      sql: `DELETE FROM ${TABLE} WHERE id = :id:`,
      params: { id: 9999 },
    });
  });

  bench('Maria / Transaction (BEGIN+INSERT+COMMIT) (1 conn)', async () => {
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
  });

  bench('Maria / 16 concurrent SELECTs (pool 8)', async () => {
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

  globalThis.addEventListener('unload', () => {
    Promise.allSettled([single.disconnect(), pooled.disconnect()]);
  });
}
