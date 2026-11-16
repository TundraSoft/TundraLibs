/**
 * A view's date and time conditions against REAL databases — SQLite,
 * Postgres, MariaDB and MongoDB: built from a snapshot as its file
 * holds it, a view returns the rows `find` returns for the same
 * filter, on every engine. Engines that are unreachable are skipped,
 * not failed, unless `LIVE_DB_REQUIRED=true`.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { envArgs } from '@tundralibs/utils';
import '@tundralibs/norm/engines/sqlite';
import { Column, type DatabaseConfig, Entity, Norm, Schema } from '../mod.ts';
import {
  buildSnapshot,
  diffSnapshots,
  isRebuild,
  type MigrationSnapshot,
} from '../migrations/mod.ts';
import { runtimeOf } from '../Norm.ts';
import type { DdlQuery } from '../executor.ts';
import { requireLive } from './requireLive.ts';

const env = envArgs('./packages/norm/');

const COLUMNS = ['d', 't', 'dt', 'ts', 'tz'] as const;
const Slots = Entity('vdl_slots', {
  id: Column.integer(),
  d: Column.date(),
  t: Column.time(),
  dt: Column.datetime(),
  ts: Column.timestamp(),
  tz: Column.timestamptz(),
}, { pk: ['id'] });
const Owners = Entity('vdl_owners', {
  id: Column.integer(),
  since: Column.date(),
}, { pk: ['id'] });

// Slot 1, 2 and 3: each a day and four hours after the one before, so
// one `Date` picks the same slot by its day, its clock and its instant.
const FIRST = new Date('2026-03-14T08:00:00Z');
const MID = new Date('2026-03-15T12:00:00Z');
const LAST = new Date('2026-03-16T16:00:00Z');
const day = (at: Date) => new Date(at.toISOString().slice(0, 10));

/** A condition on any one column, and the slots it keeps. */
const CONDITIONS: Array<[name: string, condition: unknown, ids: number[]]> = [
  ['a bare Date', MID, [2]],
  ['array shorthand', [MID, LAST], [2, 3]],
  ['$eq', { $eq: MID }, [2]],
  ['$ne', { $ne: MID }, [1, 3]],
  ['$gt', { $gt: MID }, [3]],
  ['$gte', { $gte: MID }, [2, 3]],
  ['$lt', { $lt: MID }, [1]],
  ['$lte', { $lte: MID }, [1, 2]],
  ['$in', { $in: [MID, LAST] }, [2, 3]],
  ['$nin', { $nin: [MID] }, [1, 3]],
  ['$between', { $between: [FIRST, MID] }, [1, 2]],
];

type Case = { key: string; where: Record<string, unknown>; ids: number[] };
const CASES: Case[] = [
  ...COLUMNS.flatMap((col) =>
    CONDITIONS.map(([, condition, ids], i): Case => ({
      key: `V_${col}_${i}`,
      where: { [`@${col}`]: condition },
      ids,
    }))
  ),
  // Owner 1 and 2 began on slot 1's and slot 2's day.
  { key: 'V_join', where: { '@O.@since': { $gte: MID } }, ids: [2] },
  {
    key: 'V_exists',
    where: {
      $exists: {
        table: 'vdl_owners',
        on: { '@id': '@id' },
        where: { '@since': MID },
      },
    },
    ids: [2],
  },
];
const view = (c: Case) =>
  Entity(c.key.toLowerCase().replace('v_', 'vdl_v_'), {
    id: Column.integer(),
  }, {
    type: 'VIEW',
    query: {
      type: 'SELECT',
      table: 'vdl_slots',
      columns: ['id', ...COLUMNS],
      ...(c.key === 'V_join'
        ? {
          joins: {
            O: {
              table: 'vdl_owners',
              columns: ['id', 'since'],
              on: { '@id': '@O.@id' },
            },
          },
        }
        : {}),
      projection: { '@id': true },
      where: c.where,
    } as never,
  });
const VIEWS = Object.fromEntries(CASES.map((c) => [c.key, view(c)]));
// The handle is typed by its two tables: a view is read under a
// table's key, having `id` as they do.
const open = (norm: Norm) =>
  norm.use(Schema('VDL', { Slots, Owners, ...VIEWS }));
type Db = ReturnType<typeof open>;

const dbName = () =>
  env.get('DB_SCHEMA') ? `${env.get('DB_SCHEMA')}_norm` : undefined;

const FIXTURES: Array<{ name: string; dbConfig: DatabaseConfig }> = [
  { name: 'sqlite', dbConfig: { dialect: 'sqlite', path: ':memory:' } },
  {
    name: 'postgres',
    dbConfig: {
      dialect: 'postgres',
      host: env.get('POSTGRES_HOST') || 'localhost',
      port: Number.parseInt(env.get('POSTGRES_PORT') || '5432', 10),
      database: dbName() || env.get('POSTGRES_DB') || 'postgres',
      username: env.get('POSTGRES_USERNAME') || env.get('POSTGRES_USER') ||
        'postgres',
      password: env.get('POSTGRES_PASSWORD') || undefined,
    },
  },
  {
    name: 'maria',
    dbConfig: {
      dialect: 'maria',
      host: env.get('MARIA_HOST') || 'localhost',
      port: Number.parseInt(env.get('MARIA_PORT') || '3306', 10),
      database: dbName() || env.get('MARIA_DB') || 'mysql',
      username: env.get('MARIA_USERNAME') || env.get('MARIA_USER') || 'root',
      password: env.get('MARIA_PASSWORD') || undefined,
    },
  },
  {
    name: 'mongo',
    dbConfig: {
      dialect: 'mongo',
      host: env.get('MONGO_HOST') || 'localhost',
      port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
      database: env.get('MONGO_DB') || 'mongo',
      username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') ||
        undefined,
      password: env.get('MONGO_PASSWORD') || undefined,
    },
  },
];

/** Each fixture's connected Norm, or why it could not connect. Opened
 * while the file loads, as in `temporal-live.test.ts`. */
const OPENED = await Promise.all(FIXTURES.map(async (fx) => {
  let norm: Norm | undefined;
  try {
    norm = new Norm({ database: fx.dbConfig });
    await norm.connect();
    return { norm, reason: '' };
  } catch (e) {
    await norm?.disconnect().catch(() => {});
    return {
      norm: undefined,
      reason: `${fx.name} unavailable: ${(e as Error).message}`,
    };
  }
}));

for (const [i, fx] of FIXTURES.entries()) {
  describe(`norm view dates — live ${fx.name}`, () => {
    const { norm, reason } = OPENED[i]!;
    let db: Db | undefined;
    const ddl = (q: DdlQuery) => runtimeOf(db!).executor.ddl(q);
    const drop = async (): Promise<void> => {
      for (const v of Object.values(VIEWS)) {
        await ddl({ type: 'DROP_VIEW', view: v.name, ifExists: true });
      }
      for (const table of ['vdl_slots', 'vdl_owners']) {
        await ddl({ type: 'DROP_TABLE', table, ifExists: true });
      }
    };

    beforeAll(async () => {
      if (norm === undefined) return;
      db = open(norm);
      await drop();
      // What a migration directory holds for this schema: the snapshot
      // as JSON, where a `Date` is text.
      const file = JSON.parse(
        JSON.stringify(buildSnapshot(runtimeOf(db).registry, '')),
      ) as MigrationSnapshot;
      const plan = diffSnapshots(null, file, {
        dialect: fx.name as 'sqlite' | 'postgres' | 'maria' | 'mongo',
      });
      for (const action of plan.actions) {
        if (!isRebuild(action)) await ddl(action);
      }
      await db.repo('Slots').insert([FIRST, MID, LAST].map((at, n) => ({
        id: n + 1,
        d: day(at),
        t: at.toISOString().slice(11, 19),
        dt: at,
        ts: at,
        tz: at,
      })));
      await db.repo('Owners').insert([
        { id: 1, since: day(FIRST) },
        { id: 2, since: day(MID) },
      ]);
    });

    afterAll(async () => {
      if (db !== undefined) await drop().catch(() => {});
      await norm?.disconnect().catch(() => {});
    });

    const live = (title: string, fn: (db: Db) => Promise<void>) =>
      it(title, async () => {
        if (db === undefined) {
          requireLive(reason);
          console.warn(`  (skipped) ${reason}`);
          return;
        }
        await fn(db);
      });
    const ids = (r: { data: Array<{ id: number }> }) =>
      r.data.map((x) => Number(x.id)).sort();
    const viewed = async (db: Db, key: string) =>
      ids(await db.repo(key as 'Slots').find({}));

    for (const [n, [name]] of CONDITIONS.entries()) {
      live(`${name}: the view returns the rows find returns`, async (db) => {
        for (const col of COLUMNS) {
          const c = CASES.find((x) => x.key === `V_${col}_${n}`)!;
          asserts.assertEquals(
            await viewed(db, c.key),
            c.ids,
            `view on ${col}`,
          );
          const found = await db.repo('Slots').find(c.where as never);
          asserts.assertEquals(ids(found), c.ids, `find on ${col}`);
        }
      });
    }

    live(
      'a joined table and an $exists table convert by their own columns',
      async (db) => {
        asserts.assertEquals(await viewed(db, 'V_join'), [2]);
        asserts.assertEquals(await viewed(db, 'V_exists'), [2]);
      },
    );
  });
}
