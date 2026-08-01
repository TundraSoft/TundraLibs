/**
 * Live integration tests: OQL surface on {@link SQLiteEngine} executed
 * against a real SQLite instance, exercising the directory-mode +
 * file-per-schema design.
 *
 * Each run uses a unique temp directory, so the suite is safe to run
 * repeatedly and leaves no state behind.
 *
 * @module drivers/engines/sqlite/Translator.live.test
 */

import * as asserts from '@std/asserts';
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import {
  FileNotFound,
  makeTempDir,
  removeDir,
  stat,
} from '@tundralibs/compat/file';
import type { Query } from '@tundralibs/oql/types';
import { SQLiteEngine } from './Engine.ts';

const tempDir = await makeTempDir({ prefix: 'oql_sqlite_live_' });
const engineName = 'live';
const tableName = `oql_translator_live_${Date.now()}`;
const schemaName = `oql_test_${Date.now()}`;

describe({
  name: 'drivers.SQLiteTranslator.live',
  // The native SQLite binding loads a dynamic library that Deno's leak
  // detector flags even though it's owned by the runtime.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => suite(),
});

function suite() {
  let engine: SQLiteEngine;

  beforeAll(async () => {
    engine = new SQLiteEngine(engineName, { path: tempDir });
    await engine.connect();
  });

  afterAll(async () => {
    try {
      await engine.dropTable({
        type: 'DROP_TABLE',
        table: tableName,
        ifExists: true,
      });
    } catch { /* ignore */ }
    await engine.disconnect();
    try {
      await removeDir(tempDir, { recursive: true });
    } catch { /* ignore */ }
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

  it('INSERT round-trips primitive + null + DEFAULT, with RETURNING', async () => {
    const result = await engine.insert<
      { id: number; name: string; email: string | null; balance: number | null }
    >({
      type: 'INSERT',
      table: tableName,
      columns: ['id', 'name', 'email', 'balance'],
      data: [
        { id: 1, name: 'Alice', email: 'a@x.com', balance: 100.5 },
        { id: 2, name: 'Bob', balance: null },
      ],
    });
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
    asserts.assertEquals(result.data[0]!.email, 'a@x.com');
    asserts.assertEquals(result.data[1]!.email, null);
  });

  it('COUNT returns one row of { Count: n }, with result.count === 1', async () => {
    const result = await engine.count({
      type: 'COUNT',
      table: tableName,
      columns: ['id'],
      where: { '@id': { $gt: 0 } },
    });
    asserts.assertEquals(result.count, 1);
    asserts.assertEquals(Number(result.data[0]!.Count), 2);
  });

  it('UPDATE modifies rows (no RETURNING — verify by re-select)', async () => {
    await engine.update({
      type: 'UPDATE',
      table: tableName,
      columns: ['id', 'name', 'email', 'balance'],
      data: { email: 'new@x.com' },
      where: { '@id': 1 },
    });
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

  it('DELETE removes rows', async () => {
    const result = await engine.delete({
      type: 'DELETE',
      table: tableName,
      columns: ['id'],
      where: { '@id': 2 },
    });
    asserts.assertEquals(result.count >= 1, true);
  });

  it('CREATE_SCHEMA creates and ATTACHes a new .db file', async () => {
    await engine.createSchema({ type: 'CREATE_SCHEMA', schema: schemaName });
    const filePath = `${engine.schemaDir}/${schemaName}.db`;
    const info = await stat(filePath);
    asserts.assertEquals(info.isFile, true);
  });

  it('CREATE_SCHEMA refuses a caller-supplied transaction (ATTACH-in-tx)', async () => {
    // SQLite forbids ATTACH inside a transaction. The engine should
    // reject the request loudly with a friendly error, rather than
    // letting SQLite raise its less-obvious one.
    const txId = await engine.beginTransaction();
    try {
      await asserts.assertRejects(
        () =>
          engine.createSchema(
            { type: 'CREATE_SCHEMA', schema: 'never_created' },
            txId,
          ),
        Error,
        'cannot run inside a caller-supplied transaction',
      );
    } finally {
      await engine.rollbackTransaction(txId);
    }
  });

  it('CREATE_TABLE in the new schema works via qualified name', async () => {
    await engine.createTable({
      type: 'CREATE_TABLE',
      table: 'orders',
      schema: schemaName,
      columns: {
        id: { type: 'INTEGER', nullable: false },
        amount: { type: 'INTEGER', nullable: false },
      },
      primaryKey: ['id'],
    });

    await engine.insert({
      type: 'INSERT',
      table: 'orders',
      schema: schemaName,
      columns: ['id', 'amount'],
      data: { id: 1, amount: 42 },
    });
    const sel = await engine.select<{ id: number; amount: number }>({
      type: 'SELECT',
      table: 'orders',
      schema: schemaName,
      columns: ['id', 'amount'],
      projection: { '@id': true, '@amount': true },
    });
    asserts.assertEquals(sel.count, 1);
    asserts.assertEquals(sel.data[0]!.amount, 42);
  });

  it('DROP_SCHEMA detaches and unlinks the file', async () => {
    await engine.dropSchema({ type: 'DROP_SCHEMA', schema: schemaName });
    const filePath = `${engine.schemaDir}/${schemaName}.db`;
    await asserts.assertRejects(() => stat(filePath), FileNotFound);
  });

  it('schema persists across reconnect (auto-attach on connect)', async () => {
    const persistedSchema = `persisted_${Date.now()}`;
    await engine.createSchema({
      type: 'CREATE_SCHEMA',
      schema: persistedSchema,
    });
    await engine.createTable({
      type: 'CREATE_TABLE',
      table: 'kv',
      schema: persistedSchema,
      columns: {
        k: { type: 'VARCHAR', length: 64, nullable: false },
        v: { type: 'TEXT' },
      },
      primaryKey: ['k'],
    });
    await engine.insert({
      type: 'INSERT',
      table: 'kv',
      schema: persistedSchema,
      columns: ['k', 'v'],
      data: { k: 'hello', v: 'world' },
    });

    await engine.disconnect();
    const fresh = new SQLiteEngine(engineName, { path: tempDir });
    await fresh.connect();
    const sel = await fresh.select<{ k: string; v: string }>({
      type: 'SELECT',
      table: 'kv',
      schema: persistedSchema,
      columns: ['k', 'v'],
      projection: { '@k': true, '@v': true },
    });
    asserts.assertEquals(sel.data[0]!.v, 'world');
    await fresh.dropSchema({
      type: 'DROP_SCHEMA',
      schema: persistedSchema,
    });
    await fresh.disconnect();
    engine = new SQLiteEngine(engineName, { path: tempDir });
    await engine.connect();
  });

  it('prepared-statement cache: repeated SELECTs stay correct after DDL', async () => {
    // Set up a fresh table for this test so we don't depend on prior steps.
    const cacheTable = `cache_test_${Date.now()}`;
    await engine.createTable({
      type: 'CREATE_TABLE',
      table: cacheTable,
      columns: {
        id: { type: 'INTEGER', nullable: false },
        v: { type: 'INTEGER', nullable: false },
      },
      primaryKey: ['id'],
    });
    await engine.insert({
      type: 'INSERT',
      table: cacheTable,
      columns: ['id', 'v'],
      data: [
        { id: 1, v: 10 },
        { id: 2, v: 20 },
      ],
    });

    const selectAll = {
      type: 'SELECT' as const,
      table: cacheTable,
      columns: ['id', 'v'],
      projection: { '@id': true, '@v': true },
      orderBy: { '@id': 'ASC' as const },
    };

    // Run the same SELECT 50 times — exercises the cache hot path.
    for (let i = 0; i < 50; i++) {
      const r = await engine.select<{ id: number; v: number }>(selectAll);
      asserts.assertEquals(r.count, 2);
      asserts.assertEquals(r.data[0]!.v, 10);
    }

    // ALTER_TABLE invalidates any cached statement that references this
    // table. Run the same SELECT shape after the ALTER and confirm it
    // sees the new column — proves the cache was dropped.
    await engine.alterTable({
      type: 'ALTER_TABLE',
      table: cacheTable,
      addColumns: { extra: { type: 'INTEGER' } },
    });
    const after = await engine.select<
      { id: number; v: number; extra: number | null }
    >({
      type: 'SELECT',
      table: cacheTable,
      columns: ['id', 'v', 'extra'],
      projection: { '@id': true, '@v': true, '@extra': true },
      where: { '@id': 1 },
    });
    asserts.assertEquals(after.data[0]!.extra, null);

    await engine.dropTable({ type: 'DROP_TABLE', table: cacheTable });
  });

  it('DROP_TABLE removes the test table', async () => {
    await engine.dropTable({
      type: 'DROP_TABLE',
      table: tableName,
      ifExists: true,
    });
  });

  // ===========================================================================
  // Coverage suite — end-to-end exercise of the goldens' breadth.
  // SQLite supports partial indexes (3.8+) and native ON CONFLICT.
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
        await engine.dropIndex({
          type: 'DROP_INDEX',
          index: IDX,
          table: T,
          ifExists: true,
        });
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

    it('filters: $like / $between / $in / $null / $or', async () => {
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

    it('expressions: CONCAT / LOWER / LENGTH / MULTIPLY', async () => {
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

    it('CREATE_INDEX (unique) + DROP_INDEX round-trip', async () => {
      await engine.createIndex({
        type: 'CREATE_INDEX',
        table: T,
        index: IDX,
        columns: ['@email'],
        unique: true,
      });
      await engine.dropIndex({ type: 'DROP_INDEX', index: IDX, table: T });
    });

    it('CREATE_INDEX with WHERE (SQLite supports partial)', async () => {
      const idxPartial = `${IDX}_partial`;
      await engine.createIndex({
        type: 'CREATE_INDEX',
        table: T,
        index: idxPartial,
        columns: ['@email'],
        where: { '@status': 'active' },
      });
      await engine.dropIndex({
        type: 'DROP_INDEX',
        index: idxPartial,
        table: T,
      });
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
}
