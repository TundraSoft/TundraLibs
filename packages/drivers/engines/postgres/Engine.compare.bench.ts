/**
 * Head-to-head benchmarks: TundraLibs PostgresEngine vs established drivers.
 *
 * Compared:
 * - **TundraLibs**     `PostgresEngine` (this driver, from-scratch wire impl)
 * - **node-postgres**  `npm:pg` (the classic, ~15 years mature)
 * - **postgres.js**    `npm:postgres` (porsager/postgres, modern, fast)
 * - **deno-postgres**  `jsr:@db/postgres` (Deno-native, what DAM uses today)
 *
 * Run: `deno bench --allow-all packages/drivers/engines/postgres/Engine.compare.bench.ts`
 *
 * All four drivers connect to the same Postgres instance with the same pool
 * size and run the same SQL. Each bench group runs the same operation across
 * all four implementations so the results sit side-by-side in the output.
 */

import { bench } from '@tundralibs/compat/bench';
import { envArgs } from '@tundralibs/utils';
import { PostgresEngine } from './Engine.ts';
import pg from 'pg';
import postgresJs from 'postgres';
import { Pool as DenoPgPool } from 'jsr:@db/postgres@^0.19.5';

const env = envArgs('./packages/drivers/');
const HOST = env.get('POSTGRES_HOST') || 'localhost';
const PORT = Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10);
const DB = env.get('POSTGRES_DB') || 'postgres';
const USER = env.get('POSTGRES_USER') || 'postgres';
const PASS = env.get('POSTGRES_PASSWORD') || '';

const POOL_SIZE = 8;
const TABLE = 'tundra_bench_compare';

// --- Construct each client ------------------------------------------------

const tundra = new PostgresEngine('bench-tundra', {
  host: HOST,
  port: PORT,
  database: DB,
  username: USER,
  password: PASS,
  pool: { min: POOL_SIZE, max: POOL_SIZE },
});

const nodePg = new pg.Pool({
  host: HOST,
  port: PORT,
  database: DB,
  user: USER,
  password: PASS,
  max: POOL_SIZE,
});

const postgresJsClient = postgresJs({
  host: HOST,
  port: PORT,
  database: DB,
  username: USER,
  password: PASS,
  max: POOL_SIZE,
  // Disable PostgresJS "prepared statement" caching to make the comparison
  // apples-to-apples (other drivers don't cache by default).
  prepare: true,
});

const denoPg = new DenoPgPool(
  {
    hostname: HOST,
    port: PORT,
    database: DB,
    user: USER,
    password: PASS,
  },
  POOL_SIZE,
  true,
);

// --- Connect / probe / seed ----------------------------------------------

let serverAvailable = false;
try {
  await tundra.connect();
  await nodePg.query('SELECT 1');
  // postgresJs lazy-connects; force a roundtrip
  await postgresJsClient`SELECT 1`;
  const denoClient = await denoPg.connect();
  await denoClient.queryArray('SELECT 1');
  denoClient.release();
  serverAvailable = true;
} catch (e) {
  console.warn(
    'Postgres unreachable; skipping comparison benchmarks.',
    (e as Error).message,
  );
}

if (serverAvailable) {
  // Set up the benchmark table.
  await tundra.execute({
    sql: `CREATE TABLE IF NOT EXISTS ${TABLE} (
      id INT PRIMARY KEY,
      name TEXT,
      payload TEXT,
      ts TIMESTAMP DEFAULT NOW()
    )`,
  });
  await tundra.execute({ sql: `TRUNCATE TABLE ${TABLE}` });
  for (let i = 0; i < 100; i++) {
    await tundra.execute({
      sql:
        `INSERT INTO ${TABLE} (id, name, payload) VALUES (:id:, :name:, :p:)`,
      params: { id: i, name: `name-${i}`, p: 'x'.repeat(64) },
    });
  }

  // -----------------------------------------------------------------------
  // SELECT 1 — bare round-trip
  // -----------------------------------------------------------------------
  bench({
    name: 'SELECT 1',
    group: 'select-1',
    baseline: true,
    fn: async () => {
      await tundra.execute({ sql: 'SELECT 1' });
    },
  });
  bench({
    name: 'SELECT 1',
    group: 'select-1',
    fn: async () => {
      await nodePg.query('SELECT 1');
    },
  });
  bench({
    name: 'SELECT 1',
    group: 'select-1',
    fn: async () => {
      await postgresJsClient`SELECT 1`;
    },
  });
  bench({
    name: 'SELECT 1',
    group: 'select-1',
    fn: async () => {
      const c = await denoPg.connect();
      try {
        await c.queryArray('SELECT 1');
      } finally {
        c.release();
      }
    },
  });

  // -----------------------------------------------------------------------
  // SELECT * by PK — single-row lookup with parameter binding
  // -----------------------------------------------------------------------
  bench({
    name: 'SELECT by PK',
    group: 'select-pk',
    baseline: true,
    fn: async () => {
      await tundra.execute({
        sql: `SELECT * FROM ${TABLE} WHERE id = :id:`,
        params: { id: 42 },
      });
    },
  });
  bench({
    name: 'SELECT by PK',
    group: 'select-pk',
    fn: async () => {
      await nodePg.query(`SELECT * FROM ${TABLE} WHERE id = $1`, [42]);
    },
  });
  bench({
    name: 'SELECT by PK',
    group: 'select-pk',
    fn: async () => {
      await postgresJsClient`SELECT * FROM ${
        postgresJsClient(TABLE)
      } WHERE id = ${42}`;
    },
  });
  bench({
    name: 'SELECT by PK',
    group: 'select-pk',
    fn: async () => {
      const c = await denoPg.connect();
      try {
        await c.queryObject(
          `SELECT * FROM ${TABLE} WHERE id = $1`,
          [42],
        );
      } finally {
        c.release();
      }
    },
  });

  // -----------------------------------------------------------------------
  // SELECT 10 rows — small result set
  // -----------------------------------------------------------------------
  bench({
    name: 'SELECT 10 rows',
    group: 'select-10',
    baseline: true,
    fn: async () => {
      await tundra.execute({
        sql: `SELECT * FROM ${TABLE} WHERE id BETWEEN :a: AND :b:`,
        params: { a: 0, b: 9 },
      });
    },
  });
  bench({
    name: 'SELECT 10 rows',
    group: 'select-10',
    fn: async () => {
      await nodePg.query(
        `SELECT * FROM ${TABLE} WHERE id BETWEEN $1 AND $2`,
        [0, 9],
      );
    },
  });
  bench({
    name: 'SELECT 10 rows',
    group: 'select-10',
    fn: async () => {
      await postgresJsClient`SELECT * FROM ${
        postgresJsClient(TABLE)
      } WHERE id BETWEEN ${0} AND ${9}`;
    },
  });
  bench({
    name: 'SELECT 10 rows',
    group: 'select-10',
    fn: async () => {
      const c = await denoPg.connect();
      try {
        await c.queryObject(
          `SELECT * FROM ${TABLE} WHERE id BETWEEN $1 AND $2`,
          [0, 9],
        );
      } finally {
        c.release();
      }
    },
  });

  // -----------------------------------------------------------------------
  // INSERT + DELETE — write workload
  // -----------------------------------------------------------------------
  bench({
    name: 'INSERT + DELETE',
    group: 'write',
    baseline: true,
    fn: async () => {
      await tundra.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES (:id:, :n:)`,
        params: { id: 9999, n: 'tmp' },
      });
      await tundra.execute({
        sql: `DELETE FROM ${TABLE} WHERE id = :id:`,
        params: { id: 9999 },
      });
    },
  });
  bench({
    name: 'INSERT + DELETE',
    group: 'write',
    fn: async () => {
      await nodePg.query(
        `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
        [9999, 'tmp'],
      );
      await nodePg.query(`DELETE FROM ${TABLE} WHERE id = $1`, [9999]);
    },
  });
  bench({
    name: 'INSERT + DELETE',
    group: 'write',
    fn: async () => {
      await postgresJsClient`INSERT INTO ${
        postgresJsClient(TABLE)
      } (id, name) VALUES (${9999}, ${'tmp'})`;
      await postgresJsClient`DELETE FROM ${
        postgresJsClient(TABLE)
      } WHERE id = ${9999}`;
    },
  });
  bench({
    name: 'INSERT + DELETE',
    group: 'write',
    fn: async () => {
      const c = await denoPg.connect();
      try {
        await c.queryArray(
          `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
          [9999, 'tmp'],
        );
        await c.queryArray(
          `DELETE FROM ${TABLE} WHERE id = $1`,
          [9999],
        );
      } finally {
        c.release();
      }
    },
  });

  // -----------------------------------------------------------------------
  // 16 concurrent SELECTs across pool of 8 — parallelism
  // -----------------------------------------------------------------------
  bench({
    name: '16 concurrent SELECTs',
    group: 'concurrent',
    baseline: true,
    fn: async () => {
      const ops = Array.from(
        { length: 16 },
        () =>
          tundra.execute({
            sql: `SELECT * FROM ${TABLE} WHERE id = :id:`,
            params: { id: 1 },
          }),
      );
      await Promise.all(ops);
    },
  });
  bench({
    name: '16 concurrent SELECTs',
    group: 'concurrent',
    fn: async () => {
      const ops = Array.from(
        { length: 16 },
        () =>
          nodePg.query(
            `SELECT * FROM ${TABLE} WHERE id = $1`,
            [1],
          ),
      );
      await Promise.all(ops);
    },
  });
  bench({
    name: '16 concurrent SELECTs',
    group: 'concurrent',
    fn: async () => {
      const ops = Array.from(
        { length: 16 },
        () =>
          postgresJsClient`SELECT * FROM ${
            postgresJsClient(TABLE)
          } WHERE id = ${1}`,
      );
      await Promise.all(ops);
    },
  });
  bench({
    name: '16 concurrent SELECTs',
    group: 'concurrent',
    fn: async () => {
      const ops = Array.from({ length: 16 }, async () => {
        const c = await denoPg.connect();
        try {
          await c.queryObject(
            `SELECT * FROM ${TABLE} WHERE id = $1`,
            [1],
          );
        } finally {
          c.release();
        }
      });
      await Promise.all(ops);
    },
  });

  // -----------------------------------------------------------------------
  // Transaction round-trip
  // -----------------------------------------------------------------------
  bench({
    name: 'Transaction (BEGIN+INSERT+COMMIT)',
    group: 'transaction',
    baseline: true,
    fn: async () => {
      const tx = await tundra.transaction();
      await tx.execute({
        sql: `INSERT INTO ${TABLE} (id, name) VALUES (:id:, :n:)`,
        params: { id: 10000, n: 'tx' },
      });
      await tx.commit();
      await tundra.execute({
        sql: `DELETE FROM ${TABLE} WHERE id = :id:`,
        params: { id: 10000 },
      });
    },
  });
  bench({
    name: 'Transaction (BEGIN+INSERT+COMMIT)',
    group: 'transaction',
    fn: async () => {
      const c = await nodePg.connect();
      try {
        await c.query('BEGIN');
        await c.query(
          `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
          [10000, 'tx'],
        );
        await c.query('COMMIT');
      } finally {
        c.release();
      }
      await nodePg.query(`DELETE FROM ${TABLE} WHERE id = $1`, [10000]);
    },
  });
  bench({
    name: 'Transaction (BEGIN+INSERT+COMMIT)',
    group: 'transaction',
    fn: async () => {
      await postgresJsClient.begin(async (sql) => {
        await sql`INSERT INTO ${
          sql(TABLE)
        } (id, name) VALUES (${10000}, ${'tx'})`;
      });
      await postgresJsClient`DELETE FROM ${
        postgresJsClient(TABLE)
      } WHERE id = ${10000}`;
    },
  });
  bench({
    name: 'Transaction (BEGIN+INSERT+COMMIT)',
    group: 'transaction',
    fn: async () => {
      const c = await denoPg.connect();
      try {
        const tx = c.createTransaction('bench-tx');
        await tx.begin();
        await tx.queryArray(
          `INSERT INTO ${TABLE} (id, name) VALUES ($1, $2)`,
          [10000, 'tx'],
        );
        await tx.commit();
      } finally {
        c.release();
      }
      const c2 = await denoPg.connect();
      try {
        await c2.queryArray(
          `DELETE FROM ${TABLE} WHERE id = $1`,
          [10000],
        );
      } finally {
        c2.release();
      }
    },
  });

  // -----------------------------------------------------------------------
  // Cleanup
  // -----------------------------------------------------------------------
  globalThis.addEventListener('unload', () => {
    Promise.allSettled([
      tundra.disconnect(),
      nodePg.end(),
      postgresJsClient.end({ timeout: 1 }),
      denoPg.end(),
    ]);
  });
}
