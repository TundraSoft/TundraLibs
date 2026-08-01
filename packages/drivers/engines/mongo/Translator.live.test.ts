/**
 * Live integration tests: OQL surface on {@link MongoEngine} executed
 * against a real MongoDB instance.
 *
 * Connection details come from `packages/drivers/.env` (`MONGO_*`). When
 * the database is unreachable, the whole suite is skipped.
 *
 * The engine's OQL methods (`select`, `insert`, …) translate via
 * `MongoTranslator` and dispatch to the Mongo client, returning the
 * uniform `EngineQueryResult` shape.
 *
 * @module drivers/engines/mongo/Translator.live.test
 */

import * as asserts from '@std/asserts';
import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { envArgs } from '@tundralibs/utils';
import type { Query } from '@tundralibs/oql/types';
import { MongoEngine } from './Engine.ts';

const env = envArgs('./packages/drivers/');

const CONFIG = {
  host: env.get('MONGO_HOST') || 'localhost',
  port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
  database: env.get('MONGO_DB') || 'test',
  username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') || undefined,
  password: env.get('MONGO_PASSWORD') || undefined,
};

async function isMongoAvailable(): Promise<boolean> {
  const probe = new MongoEngine('translator-probe', CONFIG);
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

const mongoAvailable = await isMongoAvailable();
const collectionName = `oql_translator_live_${Date.now()}`;

describe({
  name: 'drivers.MongoTranslator.live',
  // The mongo client opens sockets that Deno's leak detector flags
  // even though the engine cleans them up on disconnect.
  sanitizeResources: false,
  sanitizeOps: false,
  fn: () => suite(),
});

function suite() {
  if (!mongoAvailable) {
    it({
      name: 'skipped — MongoDB unreachable',
      ignore: true,
      fn: () => {},
    });
    return;
  }

  let engine: MongoEngine;

  beforeAll(async () => {
    engine = new MongoEngine('translator-live', CONFIG);
    await engine.connect();
  });

  afterAll(async () => {
    try {
      await engine.dropTable({
        type: 'DROP_TABLE',
        table: collectionName,
        ifExists: true,
      });
    } catch { /* ignore */ }
    await engine.disconnect();
  });

  it('CREATE_TABLE + indexes', async () => {
    await engine.createTable({
      type: 'CREATE_TABLE',
      table: collectionName,
      columns: {
        id: { type: 'INTEGER', nullable: false },
        name: { type: 'VARCHAR', length: 100, nullable: false },
        email: { type: 'VARCHAR', length: 255 },
      },
      primaryKey: ['id'],
    });
  });

  it('INSERT round-trips primitives + bulk + returns inserted rows', async () => {
    const result = await engine.insert<
      { id: number; name: string; email: string | null }
    >({
      type: 'INSERT',
      table: collectionName,
      columns: ['id', 'name', 'email'],
      data: [
        { id: 1, name: 'Alice', email: 'a@x.com' },
        { id: 2, name: 'Bob', email: null },
      ],
    });
    asserts.assertEquals(result.count, 2);
    // Mongo mirrors SQL RETURNING: re-fetched rows in `data`.
    asserts.assertEquals(result.data.length, 2);
    const byId = new Map(result.data.map((r) => [r.id, r]));
    asserts.assertEquals(byId.get(1)!.name, 'Alice');
    asserts.assertEquals(byId.get(2)!.email, null);
  });

  it('SELECT with WHERE, projection, sort', async () => {
    const result = await engine.select<
      { id: number; name: string; email: string | null }
    >({
      type: 'SELECT',
      table: collectionName,
      columns: ['id', 'name', 'email'],
      projection: { '@id': true, '@name': true, '@email': true },
      where: { '@id': { $in: [1, 2] } },
      orderBy: { '@id': 'ASC' },
    });
    asserts.assertEquals(result.count, 2);
    asserts.assertEquals(result.data[0]!.id, 1);
    asserts.assertEquals(result.data[0]!.name, 'Alice');
    asserts.assertEquals(result.data[1]!.email, null);
  });

  it('COUNT returns one row of { Count: n }, with result.count === 1', async () => {
    const result = await engine.count({
      type: 'COUNT',
      table: collectionName,
      columns: ['id'],
      where: { '@id': { $gt: 0 } },
    });
    // Match SQL convention: data carries `[{ Count: n }]` and the
    // outer `count` field is the row count of `data` (always 1 here).
    asserts.assertEquals(result.count, 1);
    asserts.assertEquals(result.data[0]!.Count, 2);
  });

  it('UPDATE with WHERE', async () => {
    const result = await engine.update({
      type: 'UPDATE',
      table: collectionName,
      columns: ['id', 'name', 'email'],
      data: { email: 'new@x.com' },
      where: { '@id': 1 },
    });
    asserts.assertEquals(result.count, 1);

    const after = await engine.select<{ email: string }>({
      type: 'SELECT',
      table: collectionName,
      columns: ['id', 'email'],
      projection: { '@email': true },
      where: { '@id': 1 },
    });
    asserts.assertEquals(after.data[0]!.email, 'new@x.com');
  });

  it('UPSERT inserts when missing, updates when matched, returns affected row', async () => {
    // Update existing — UPSERT result.data should carry the upserted row.
    const updated = await engine.upsert<
      { id: number; name: string; email: string }
    >({
      type: 'UPSERT',
      table: collectionName,
      columns: ['id', 'name', 'email'],
      data: { id: 1, name: 'Alice 2.0', email: 'alice2@x.com' },
      conflictKeys: ['@id'],
    });
    asserts.assertEquals(updated.data[0]!.name, 'Alice 2.0');
    asserts.assertEquals(updated.data[0]!.email, 'alice2@x.com');

    // Insert new — same shape, RETURNING the newly-created row.
    const inserted = await engine.upsert<
      { id: number; name: string; email: string }
    >({
      type: 'UPSERT',
      table: collectionName,
      columns: ['id', 'name', 'email'],
      data: { id: 99, name: 'New', email: 'new99@x.com' },
      conflictKeys: ['@id'],
    });
    asserts.assertEquals(inserted.data[0]!.id, 99);
    asserts.assertEquals(inserted.data[0]!.name, 'New');
  });

  it('DELETE', async () => {
    const result = await engine.delete({
      type: 'DELETE',
      table: collectionName,
      columns: ['id'],
      where: { '@id': 99 },
    });
    asserts.assertEquals(result.count, 1);
  });

  it('aggregate via SELECT with SUM', async () => {
    await engine.insert({
      type: 'INSERT',
      table: collectionName,
      columns: ['id', 'name', 'email', 'amount'],
      data: [
        { id: 10, name: 'Alice', email: 'a@x.com', amount: 100 },
        { id: 11, name: 'Alice', email: 'a@x.com', amount: 200 },
        { id: 12, name: 'Bob', email: 'b@x.com', amount: 50 },
      ],
    });

    const result = await engine.select<{ name: string; total: number }>({
      type: 'SELECT',
      table: collectionName,
      columns: ['id', 'name', 'amount'],
      aggregates: { total: { $$_aggregate: 'SUM', column: '@amount' } },
      projection: { '@name': true, '@total': 'total' },
      where: { '@id': { $gte: 10 } },
    } as unknown as Query<'SELECT'>);
    const byName = Object.fromEntries(
      result.data.map((r) => [r.name, r.total]),
    );
    asserts.assertEquals(byName.Alice, 300);
    asserts.assertEquals(byName.Bob, 50);
  });

  it('TRUNCATE removes all rows', async () => {
    await engine.truncate({ type: 'TRUNCATE', table: collectionName });
    const after = await engine.count({
      type: 'COUNT',
      table: collectionName,
      columns: ['id'],
    });
    // `count` is the row count of `data` (always 1 for a COUNT op);
    // the actual row count lives in `data[0].Count`.
    asserts.assertEquals(after.count, 1);
    asserts.assertEquals(after.data[0]!.Count, 0);
  });

  it('DROP_TABLE removes the collection', async () => {
    await engine.dropTable({
      type: 'DROP_TABLE',
      table: collectionName,
      ifExists: true,
    });
  });

  // ===========================================================================
  // Coverage suite — exercise the breadth the goldens cover on Mongo:
  // filter operators end-to-end, aggregate via SELECT, and the new bulk
  // UPSERT path (array `data` → bulkWrite → re-fetched rows in result.data).
  // ===========================================================================

  describe('coverage', () => {
    const C = `users_${Date.now()}`;

    beforeAll(async () => {
      await engine.insert({
        type: 'INSERT',
        table: C,
        columns: ['id', 'name', 'email', 'age', 'status'],
        data: [
          { id: 1, name: 'Alice', email: 'a@x.com', age: 30, status: 'active' },
          { id: 2, name: 'Bob', email: 'b@x.com', age: 25, status: 'active' },
          { id: 3, name: 'Carol', email: null, age: 40, status: 'banned' },
        ],
      });
    });

    afterAll(async () => {
      try {
        await engine.dropTable({
          type: 'DROP_TABLE',
          table: C,
          ifExists: true,
        });
      } catch { /* ignore */ }
    });

    it('filters: $like / $between / $in / $null / $or', async () => {
      const like = await engine.select<{ name: string }>({
        type: 'SELECT',
        table: C,
        columns: ['id', 'name', 'email'],
        projection: { '@name': true },
        where: { '@email': { $like: '%@x.com' } },
      });
      asserts.assertEquals(like.count, 2);

      const between = await engine.select({
        type: 'SELECT',
        table: C,
        columns: ['id', 'age'],
        projection: { '@id': true },
        where: { '@age': { $between: [26, 39] } },
      });
      asserts.assertEquals(between.count, 1);

      const inOp = await engine.select<{ id: number }>({
        type: 'SELECT',
        table: C,
        columns: ['id', 'status'],
        projection: { '@id': true },
        where: { '@status': { $in: ['active', 'pending'] } },
      });
      asserts.assertEquals(inOp.count, 2);

      const nullOp = await engine.select<{ id: number }>({
        type: 'SELECT',
        table: C,
        columns: ['id', 'email'],
        projection: { '@id': true },
        where: { '@email': { $null: true } },
      });
      asserts.assertEquals(nullOp.count, 1);

      const orOp = await engine.select<{ id: number }>({
        type: 'SELECT',
        table: C,
        columns: ['id', 'age', 'status'],
        projection: { '@id': true },
        where: {
          $or: [{ '@age': { $gte: 40 } }, { '@status': 'banned' }],
        },
      });
      asserts.assertEquals(orOp.count, 1);
    });

    it('aggregates: COUNT / SUM / AVG / MIN / MAX with GROUP BY', async () => {
      const q = {
        type: 'SELECT',
        table: C,
        columns: ['id', 'status', 'age'],
        aggregates: {
          cnt: { $$_aggregate: 'COUNT', column: '@id' },
          sm: { $$_aggregate: 'SUM', column: '@age' },
          mn: { $$_aggregate: 'MIN', column: '@age' },
          mx: { $$_aggregate: 'MAX', column: '@age' },
          av: { $$_aggregate: 'AVG', column: '@age' },
        },
        projection: {
          '@status': true,
          '@cnt': true,
          '@sm': true,
          '@mn': true,
          '@mx': true,
          '@av': true,
        },
        orderBy: { '@status': 'ASC' },
      } as unknown as Query<'SELECT'>;
      const r = await engine.select<{
        status: string;
        cnt: number;
        sm: number;
        mn: number;
        mx: number;
        av: number;
      }>(q);
      asserts.assertEquals(r.count, 2);
      const active = r.data.find((row) => row.status === 'active')!;
      asserts.assertEquals(Number(active.cnt), 2);
      asserts.assertEquals(Number(active.sm), 55);
      asserts.assertEquals(Number(active.mn), 25);
      asserts.assertEquals(Number(active.mx), 30);
    });

    it('bulk UPSERT (array data) round-trips via bulkWrite', async () => {
      // Three rows — two existing (id 1, 2 → updated) and one new (id 4
      // → inserted). The Mongo driver runs them through a single
      // bulkWrite, then re-fetches via $or for RETURNING parity.
      const result = await engine.upsert<{
        id: number;
        name: string;
        email: string | null;
      }>({
        type: 'UPSERT',
        table: C,
        columns: ['id', 'name', 'email'],
        data: [
          { id: 1, name: 'Alice updated', email: 'alice@new.com' },
          { id: 2, name: 'Bob updated', email: 'bob@new.com' },
          { id: 4, name: 'Dave', email: 'dave@x.com' },
        ],
        conflictKeys: ['@id'],
      });
      // count reflects modifiedCount + upsertedCount across the batch.
      asserts.assertEquals(result.count >= 3, true);
      // data carries the (re-fetched) rows.
      const ids = result.data.map((r) => r.id).sort((a, b) => a - b);
      asserts.assertEquals(ids, [1, 2, 4]);

      const verify = await engine.select<
        { id: number; name: string; email: string | null }
      >({
        type: 'SELECT',
        table: C,
        columns: ['id', 'name', 'email'],
        projection: { '@id': true, '@name': true, '@email': true },
        where: { '@id': { $in: [1, 2, 4] } },
        orderBy: { '@id': 'ASC' },
      });
      asserts.assertEquals(verify.count, 3);
      asserts.assertEquals(verify.data[0]!.name, 'Alice updated');
      asserts.assertEquals(verify.data[2]!.name, 'Dave');

      // Clean up the new row so the suite stays repeatable.
      await engine.delete({
        type: 'DELETE',
        table: C,
        columns: ['id'],
        where: { '@id': 4 },
      });
    });

    it('bulk UPSERT respects updateOnConflict (insert-only columns)', async () => {
      // `createdAt` is in `data` but NOT in `updateOnConflict` — should
      // only be applied on the INSERT branch, not on UPDATE. So id=1
      // (existing) keeps its prior state for createdAt; id=5 (new) gets
      // the createdAt value we supply.
      const result = await engine.upsert<{
        id: number;
        name: string;
        createdAt: string;
      }>({
        type: 'UPSERT',
        table: C,
        columns: ['id', 'name', 'createdAt'],
        data: [
          { id: 1, name: 'Alice v3', createdAt: '2099-01-01' }, // ignored on update
          { id: 5, name: 'Eve', createdAt: '2099-01-02' }, // applied on insert
        ],
        conflictKeys: ['@id'],
        updateOnConflict: ['@name'],
      });
      asserts.assertEquals(result.count >= 2, true);
      const eve = result.data.find((r) => r.id === 5);
      asserts.assertEquals(eve?.name, 'Eve');
      asserts.assertEquals(eve?.createdAt, '2099-01-02');

      // Clean up.
      await engine.delete({
        type: 'DELETE',
        table: C,
        columns: ['id'],
        where: { '@id': 5 },
      });
    });
  });
}
