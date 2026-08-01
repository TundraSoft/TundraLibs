/**
 * Live integration tests: OQL surface on {@link MariaEngine} executed
 * against a real MariaDB / MySQL instance.
 *
 * Connection details come from `packages/drivers/.env` (`MARIA_*`). When
 * the database is unreachable, the whole suite is skipped — these tests
 * are intentionally optional, not required for CI green.
 *
 * Each test creates its own table (timestamped name) so the suite is safe
 * to run repeatedly even if a previous run left orphans behind.
 *
 * @module drivers/engines/maria/Translator.live.test
 */

import * as asserts from '@std/asserts';
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';
import type { Query } from '@tundralibs/oql/types';
import { DialectUnsupportedError } from '@tundralibs/oql/translator';
import { MariaEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');

const CONFIG = {
  host: env.get('MARIA_HOST') || 'localhost',
  port: Number.parseInt(env.get('MARIA_PORT') || '3306', 10),
  database: env.get('MARIA_DB') || 'mysql',
  username: env.get('MARIA_USER') || 'root',
  password: env.get('MARIA_PASSWORD') || '',
};

async function isMariaAvailable(): Promise<boolean> {
  const probe = new MariaEngine('translator-probe', CONFIG);
  try {
    await probe.connect();
    const ok = await probe.ping();
    await probe.disconnect();
    return ok;
  } catch {
    try {
      await probe.disconnect();
    } catch {
      /* ignore */
    }
    return false;
  }
}

const mariaAvailable = await isMariaAvailable();
const tableName = `oql_translator_live_${Date.now()}`;

describe('drivers.MariaTranslator.live', () => {
  if (!mariaAvailable) {
    it({
      name: 'skipped — MariaDB unreachable',
      ignore: true,
      fn: () => {},
    });
    return;
  }

  let engine: MariaEngine;

  beforeAll(async () => {
    engine = new MariaEngine('translator-live', CONFIG);
    await engine.connect();
  });

  afterAll(async () => {
    try {
      await engine.dropTable({
        type: 'DROP_TABLE',
        table: tableName,
        ifExists: true,
      });
    } catch {
      /* ignore */
    }
    await engine.disconnect();
  });

  it('CREATE_TABLE produces an executable statement', async () => {
    const stmts = await engine.createTable({
      type: 'CREATE_TABLE',
      table: tableName,
      columns: {
        id: { type: 'INTEGER', nullable: false },
        name: { type: 'VARCHAR', length: 100, nullable: false },
        email: { type: 'VARCHAR', length: 255 },
        balance: { type: 'DECIMAL', precision: 10, scale: 2 },
      },
      primaryKey: ['id'],
      ifNotExists: true,
    });
    asserts.assertEquals(stmts.length, 1);
  });

  it('INSERT round-trips primitive + null + DEFAULT', async () => {
    const result = await engine.insert<
      { id: number; name: string; email: string | null; balance: string | null }
    >({
      type: 'INSERT',
      table: tableName,
      columns: ['id', 'name', 'email', 'balance'],
      data: [
        { id: 1, name: 'Alice', email: 'a@x.com', balance: 100.5 },
        // Row 2 omits `email` (DEFAULT) and explicitly nulls `balance`.
        { id: 2, name: 'Bob', balance: null },
      ],
    });
    // MariaDB's RETURNING (10.5+) is supported on INSERT — count > 0
    // means rows were affected. Some MariaDB versions don't return rows
    // for RETURNING through the binary protocol; assert affected count.
    asserts.assertEquals(result.count >= 2, true);
  });

  it('SELECT with WHERE retrieves the inserted rows', async () => {
    const result = await engine.select<
      { id: number; name: string; email: string | null }
    >({
      type: 'SELECT',
      table: tableName,
      columns: ['id', 'name', 'email', 'balance'],
      projection: { '@id': true, '@name': true, '@email': true },
      where: { '@id': { $in: [1, 2] } },
      orderBy: { '@id': 'ASC' },
    });
    asserts.assertEquals(result.count, 2);
    asserts.assertEquals(result.data[0]!.id, 1);
    asserts.assertEquals(result.data[0]!.name, 'Alice');
    asserts.assertEquals(result.data[0]!.email, 'a@x.com');
    asserts.assertEquals(result.data[1]!.id, 2);
    asserts.assertEquals(result.data[1]!.name, 'Bob');
    asserts.assertEquals(result.data[1]!.email, null);
  });

  it('COUNT returns the live row count', async () => {
    const result = await engine.count({
      type: 'COUNT',
      table: tableName,
      columns: ['id'],
      where: { '@id': { $gt: 0 } },
    });
    asserts.assertEquals(result.count, 1);
    // MariaDB returns COUNT() as a string-or-number depending on driver
    // settings; coerce.
    asserts.assertEquals(Number(result.data[0]!.Count), 2);
  });

  it('UPDATE with WHERE modifies rows', async () => {
    const result = await engine.update({
      type: 'UPDATE',
      table: tableName,
      columns: ['id', 'name', 'email', 'balance'],
      data: { email: 'new@x.com' },
      where: { '@id': 1 },
    });
    asserts.assertEquals(result.count >= 1, true);

    const after = await engine.select<{ email: string }>({
      type: 'SELECT',
      table: tableName,
      columns: ['id', 'email'],
      projection: { '@email': true },
      where: { '@id': 1 },
    });
    asserts.assertEquals(after.data[0]!.email, 'new@x.com');
  });

  it('UPSERT updates the matching conflict row', async () => {
    await engine.upsert({
      type: 'UPSERT',
      table: tableName,
      columns: ['id', 'name', 'email', 'balance'],
      data: { id: 1, name: 'Alice 2.0', email: 'alice2@x.com', balance: 999 },
      conflictKeys: ['@id'],
    });

    const after = await engine.select<{ name: string; email: string }>({
      type: 'SELECT',
      table: tableName,
      columns: ['id', 'name', 'email'],
      projection: { '@name': true, '@email': true },
      where: { '@id': 1 },
    });
    asserts.assertEquals(after.data[0]!.name, 'Alice 2.0');
    asserts.assertEquals(after.data[0]!.email, 'alice2@x.com');
  });

  it('DELETE with WHERE removes rows', async () => {
    const result = await engine.delete({
      type: 'DELETE',
      table: tableName,
      columns: ['id'],
      where: { '@id': 2 },
    });
    asserts.assertEquals(result.count >= 1, true);

    const after = await engine.count({
      type: 'COUNT',
      table: tableName,
      columns: ['id'],
    });
    asserts.assertEquals(Number(after.data[0]!.Count), 1);
  });

  it('ALTER_TABLE adds a column then drops it', async () => {
    await engine.alterTable({
      type: 'ALTER_TABLE',
      table: tableName,
      addColumns: { phone: { type: 'VARCHAR', length: 20 } },
    });

    const after = await engine.select<{ id: number; phone: string | null }>({
      type: 'SELECT',
      table: tableName,
      columns: ['id', 'phone'],
      projection: { '@id': true, '@phone': true },
      where: { '@id': 1 },
    });
    asserts.assertEquals(after.data[0]!.phone, null);

    await engine.alterTable({
      type: 'ALTER_TABLE',
      table: tableName,
      dropColumns: ['phone'],
    });
  });

  it('CREATE_SCHEMA + DROP_SCHEMA round-trip (CREATE/DROP DATABASE)', async () => {
    // MariaDB's "schema" is its database. CREATE_SCHEMA → CREATE DATABASE.
    // The test user must have CREATE/DROP DATABASE privileges; this test
    // is skipped silently if not.
    const schemaName = `oql_test_${Date.now()}`;
    try {
      await engine.createSchema({ type: 'CREATE_SCHEMA', schema: schemaName });
      await engine.dropSchema({ type: 'DROP_SCHEMA', schema: schemaName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('access denied') || msg.includes('Access denied')) {
        return;
      }
      throw err;
    }
  });

  it('DROP_TABLE removes the test table', async () => {
    await engine.dropTable({
      type: 'DROP_TABLE',
      table: tableName,
      ifExists: true,
    });
    // Verify it's gone — selecting from it should now error.
    await asserts.assertRejects(() =>
      engine.select({
        type: 'SELECT',
        table: tableName,
        columns: ['id'],
        projection: { '@id': true },
      })
    );
  });

  // ===========================================================================
  // Coverage suite — same breadth as the Postgres coverage suite, with
  // MariaDB-specific accommodations (no partial indexes, no FULL JOIN).
  // ===========================================================================

  describe('coverage', () => {
    const T = `users_${Date.now()}`;
    const OT = `orders_${Date.now()}`;
    const V = `active_${Date.now()}`;
    const IDX = `idx_${Date.now()}`;
    const ARCHIVE = `arch_${Date.now()}`;

    beforeAll(async () => {
      await engine.createTable({
        type: 'CREATE_TABLE',
        table: T,
        columns: {
          id: { type: 'INTEGER', nullable: false },
          name: { type: 'VARCHAR', length: 100, nullable: false },
          email: { type: 'VARCHAR', length: 255 },
          age: { type: 'INTEGER' },
          status: { type: 'VARCHAR', length: 20 },
        },
        primaryKey: ['id'],
      });
      await engine.createTable({
        type: 'CREATE_TABLE',
        table: OT,
        columns: {
          id: { type: 'INTEGER', nullable: false },
          userId: { type: 'INTEGER', nullable: false },
          amount: { type: 'DECIMAL', precision: 10, scale: 2, nullable: false },
        },
        primaryKey: ['id'],
      });
      await engine.insert({
        type: 'INSERT',
        table: T,
        columns: ['id', 'name', 'email', 'age', 'status'],
        data: [
          { id: 1, name: 'Alice', email: 'a@x.com', age: 30, status: 'active' },
          { id: 2, name: 'Bob', email: 'b@x.com', age: 25, status: 'active' },
          { id: 3, name: 'Carol', email: null, age: 40, status: 'banned' },
        ],
      });
      await engine.insert({
        type: 'INSERT',
        table: OT,
        columns: ['id', 'userId', 'amount'],
        data: [
          { id: 1, userId: 1, amount: 100 },
          { id: 2, userId: 1, amount: 50 },
          { id: 3, userId: 2, amount: 200 },
        ],
      });
    });

    afterAll(async () => {
      try {
        await engine.dropView({ type: 'DROP_VIEW', view: V, ifExists: true });
      } catch { /* ignore */ }
      try {
        await engine.dropIndex({ type: 'DROP_INDEX', index: IDX, table: T });
      } catch { /* ignore */ }
      try {
        await engine.dropTable({
          type: 'DROP_TABLE',
          table: ARCHIVE,
          ifExists: true,
        });
      } catch { /* ignore */ }
      try {
        await engine.dropTable({
          type: 'DROP_TABLE',
          table: OT,
          ifExists: true,
        });
      } catch { /* ignore */ }
      try {
        await engine.dropTable({
          type: 'DROP_TABLE',
          table: T,
          ifExists: true,
        });
      } catch { /* ignore */ }
    });

    it('filters: $like / $ilike / $between / $in / $null / $or', async () => {
      const like = await engine.select<{ name: string }>({
        type: 'SELECT',
        table: T,
        columns: ['id', 'name', 'email'],
        projection: { '@name': true },
        where: { '@email': { $like: '%@x.com' } },
      });
      asserts.assertEquals(like.count, 2);

      const between = await engine.select({
        type: 'SELECT',
        table: T,
        columns: ['id', 'age'],
        projection: { '@id': true },
        where: { '@age': { $between: [26, 39] } },
      });
      asserts.assertEquals(between.count, 1);

      const inOp = await engine.select<{ id: number }>({
        type: 'SELECT',
        table: T,
        columns: ['id', 'status'],
        projection: { '@id': true },
        where: { '@status': { $in: ['active', 'pending'] } },
        orderBy: { '@id': 'ASC' },
      });
      asserts.assertEquals(inOp.count, 2);

      const nullOp = await engine.select<{ id: number }>({
        type: 'SELECT',
        table: T,
        columns: ['id', 'email'],
        projection: { '@id': true },
        where: { '@email': { $null: true } },
      });
      asserts.assertEquals(nullOp.count, 1);

      const orOp = await engine.select<{ id: number }>({
        type: 'SELECT',
        table: T,
        columns: ['id', 'age', 'status'],
        projection: { '@id': true },
        where: {
          $or: [{ '@age': { $gte: 40 } }, { '@status': 'banned' }],
        },
      });
      asserts.assertEquals(orOp.count, 1);
    });

    it('aggregates: COUNT / AVG / MIN / MAX with GROUP BY', async () => {
      const q = {
        type: 'SELECT',
        table: T,
        columns: ['id', 'status', 'age'],
        aggregates: {
          cnt: { $$_aggregate: 'COUNT', column: '@id' },
          mn: { $$_aggregate: 'MIN', column: '@age' },
          mx: { $$_aggregate: 'MAX', column: '@age' },
          av: { $$_aggregate: 'AVG', column: '@age' },
        },
        projection: {
          '@status': true,
          '@cnt': true,
          '@mn': true,
          '@mx': true,
          '@av': true,
        },
        orderBy: { '@status': 'ASC' },
      } as unknown as Query<'SELECT'>;
      const r = await engine.select<
        { status: string; cnt: number; mn: number; mx: number; av: number }
      >(q);
      asserts.assertEquals(r.count, 2);
      const active = r.data.find((row) => row.status === 'active')!;
      asserts.assertEquals(Number(active.cnt), 2);
    });

    it('expressions: CONCAT / LOWER / LENGTH / MULTIPLY in projection', async () => {
      const q = {
        type: 'SELECT',
        table: T,
        columns: ['id', 'name', 'age'],
        expressions: {
          greeting: { $$_expression: 'CONCAT', args: ['Hi ', '@name'] },
          doubled: { $$_expression: 'MULTIPLY', args: ['@age', 2] },
          lc: { $$_expression: 'LOWER', args: '@name' },
          len: { $$_expression: 'LENGTH', args: '@name' },
        },
        projection: {
          '@greeting': 'greeting',
          '@doubled': 'doubled',
          '@lc': 'lc',
          '@len': 'len',
        },
        where: { '@id': 1 },
      } as unknown as Query<'SELECT'>;
      const r = await engine.select<
        { greeting: string; doubled: number; lc: string; len: number }
      >(q);
      asserts.assertEquals(r.data[0]!.greeting, 'Hi Alice');
      asserts.assertEquals(Number(r.data[0]!.doubled), 60);
      asserts.assertEquals(r.data[0]!.lc, 'alice');
      asserts.assertEquals(Number(r.data[0]!.len), 5);
    });

    it('CREATE_INDEX (unique) succeeds; DROP_INDEX cleans up', async () => {
      await engine.createIndex({
        type: 'CREATE_INDEX',
        table: T,
        index: IDX,
        columns: ['@email'],
        unique: true,
      });
      await engine.dropIndex({ type: 'DROP_INDEX', index: IDX, table: T });
    });

    it('CREATE_INDEX with WHERE throws (MariaDB has no partial indexes)', () => {
      asserts.assertThrows(
        () =>
          engine.createIndex({
            type: 'CREATE_INDEX',
            table: T,
            index: 'idx_bad',
            columns: ['@email'],
            where: { '@status': 'active' },
          }),
        DialectUnsupportedError,
      );
    });

    it('CREATE_VIEW inlines literals; DROP_VIEW cleans up', async () => {
      await engine.createView({
        type: 'CREATE_VIEW',
        view: V,
        query: {
          type: 'SELECT',
          table: T,
          columns: ['id', 'name', 'status'],
          projection: { '@id': true, '@name': true },
          where: { '@status': 'active' },
        },
      });
      const r = await engine.select<{ id: number; name: string }>({
        type: 'SELECT',
        table: V,
        columns: ['id', 'name'],
        projection: { '@id': true, '@name': true },
        orderBy: { '@id': 'ASC' },
      });
      asserts.assertEquals(r.count, 2);
    });

    it('INSERT_FROM_QUERY copies rows from one table into another', async () => {
      await engine.createTable({
        type: 'CREATE_TABLE',
        table: ARCHIVE,
        columns: {
          id: { type: 'INTEGER', nullable: false },
          name: { type: 'VARCHAR', length: 100, nullable: false },
        },
        primaryKey: ['id'],
      });
      await engine.insertQuery({
        type: 'INSERT_FROM_QUERY',
        table: ARCHIVE,
        columns: ['id', 'name'],
        query: {
          type: 'SELECT',
          table: T,
          columns: ['id', 'name', 'status'],
          projection: { '@id': true, '@name': true },
          where: { '@status': 'banned' },
        },
      });
      const r = await engine.select<{ id: number; name: string }>({
        type: 'SELECT',
        table: ARCHIVE,
        columns: ['id', 'name'],
        projection: { '@id': true, '@name': true },
      });
      asserts.assertEquals(r.count, 1);
      asserts.assertEquals(r.data[0]!.name, 'Carol');
    });
  });
});
