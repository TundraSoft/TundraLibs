/**
 * Relation reads against REAL databases — SQLite, Postgres, MariaDB and
 * MongoDB: a relation returns each base row once, and `count()` and
 * `total` agree with the rows, on every engine. Engines that are
 * unreachable are skipped, not failed, unless `LIVE_DB_REQUIRED=true`.
 *
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { envArgs } from '@tundralibs/utils';
import { MongoEngine } from '@tundralibs/drivers/mongo';
import '@tundralibs/norm/engines/sqlite';
import { Column, type DatabaseConfig, Entity, Norm, Schema } from '../mod.ts';
import { requireLive } from './requireLive.ts';

const env = envArgs('./packages/norm/');

// Seats reach Orgs two ways: `Org` on tenant and code, which two orgs
// share, and `Owner` on the org id. Neither side declares tenant and
// code unique, so `Org` and its reverse `Seat` can match several rows.
const Orgs = Entity('rl_orgs', {
  id: Column.integer(),
  tenant: Column.integer(),
  code: Column.varchar(20).nullable(),
  cap: Column.integer(),
}, { pk: ['id'] });
const Seats = Entity('rl_seats', {
  id: Column.integer(),
  tenant: Column.integer(),
  orgcode: Column.varchar(20).nullable(),
  orgid: Column.integer().nullable(),
  total: Column.integer(),
}, {
  pk: ['id'],
  fk: {
    Org: {
      model: 'Orgs',
      on: { tenant: 'tenant', orgcode: 'code' },
      reverseAs: 'Seat',
      reverseCardinality: 'hasOne',
    },
    Owner: { model: 'Orgs', on: { orgid: 'id' }, reverseAs: 'Seats' },
  },
});
// One profile per org in fact, a hasOne no unique key declares.
const Profiles = Entity('rl_profiles', {
  id: Column.integer(),
  orgid: Column.integer(),
  score: Column.integer(),
}, {
  pk: ['id'],
  fk: {
    Org: {
      model: 'Orgs',
      on: { orgid: 'id' },
      reverseAs: 'Profile',
      reverseCardinality: 'hasOne',
    },
  },
});
// A view over the seats has no primary key. Its key to Orgs is NULL-safe,
// so org 5's NULL code matches seat 13, whose projected code is NULL too.
const SeatView = Entity('rl_seat_view', {
  orgcode: Column.varchar(20).nullable(),
  total: Column.integer(),
  id: Column.integer(),
}, {
  type: 'VIEW',
  query: {
    type: 'SELECT',
    table: 'rl_seats',
    columns: ['id', 'orgcode', 'total'],
    projection: { '@orgcode': true, '@total': true, '@id': true },
  },
  fk: {
    One: {
      model: 'Orgs',
      on: { orgcode: 'code' },
      reverseAs: 'SeatRow',
      reverseCardinality: 'hasOne',
      nullSafe: true,
    },
    All: {
      model: 'Orgs',
      on: { orgcode: 'code' },
      reverseAs: 'SeatRows',
      nullSafe: true,
    },
  },
});
const open = (norm: Norm) =>
  norm.use(Schema('RL', { Orgs, Seats, Profiles, SeatView }));
type Db = ReturnType<typeof open>;
const TABLES = {
  rl_orgs:
    'id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, code VARCHAR(20), cap INTEGER NOT NULL',
  rl_seats:
    'id INTEGER PRIMARY KEY, tenant INTEGER NOT NULL, orgcode VARCHAR(20), orgid INTEGER, total INTEGER NOT NULL',
  rl_profiles:
    'id INTEGER PRIMARY KEY, orgid INTEGER NOT NULL, score INTEGER NOT NULL',
};

const dbName = () =>
  env.get('DB_SCHEMA') ? `${env.get('DB_SCHEMA')}_norm` : undefined;
const MONGO = {
  host: env.get('MONGO_HOST') || 'localhost',
  port: Number.parseInt(env.get('MONGO_PORT') || '27017', 10),
  database: env.get('MONGO_DB') || 'mongo',
  username: env.get('MONGO_USERNAME') || env.get('MONGO_USER') || undefined,
  password: env.get('MONGO_PASSWORD') || undefined,
};

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
  { name: 'mongo', dbConfig: { dialect: 'mongo', ...MONGO } },
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
  describe(`norm relations — live ${fx.name}`, () => {
    const { norm, reason } = OPENED[i]!;
    let db: Db | undefined;
    const drop = async (): Promise<void> => {
      if (fx.name === 'mongo') {
        const clean = new MongoEngine('rl-live-mongo-clean', MONGO);
        try {
          await clean.connect();
          // deno-lint-ignore no-explicit-any
          await (clean as any).dropView({
            type: 'DROP_VIEW',
            view: 'rl_seat_view',
            ifExists: true,
          });
          for (const t of Object.keys(TABLES)) {
            await clean.dropTable({
              type: 'DROP_TABLE',
              table: t,
              ifExists: true,
            });
          }
        } finally {
          await clean.disconnect().catch(() => {});
        }
        return;
      }
      await db!.raw('DROP VIEW IF EXISTS rl_seat_view');
      for (const t of Object.keys(TABLES).reverse()) {
        await db!.raw(`DROP TABLE IF EXISTS ${t}`);
      }
    };

    beforeAll(async () => {
      if (norm === undefined) return;
      const opened = open(norm);
      db = opened;
      await drop();
      if (fx.name !== 'mongo') {
        for (const [t, ddl] of Object.entries(TABLES)) {
          await opened.raw(`CREATE TABLE ${t} (${ddl})`);
        }
        await opened.raw(
          'CREATE VIEW rl_seat_view AS SELECT orgcode, total, id FROM rl_seats',
        );
      } else {
        const views = new MongoEngine('rl-live-mongo-views', MONGO);
        try {
          await views.connect();
          // deno-lint-ignore no-explicit-any
          await (views as any).createView({
            type: 'CREATE_VIEW',
            view: 'rl_seat_view',
            query: (SeatView as unknown as { query: unknown }).query,
            ifNotExists: true,
          });
        } finally {
          await views.disconnect().catch(() => {});
        }
      }
      await opened.repo('Orgs').insert([
        { id: 1, tenant: 7, code: 'a', cap: 5 },
        { id: 2, tenant: 7, code: 'a', cap: 7 },
        { id: 3, tenant: 7, code: 'b', cap: 9 },
        { id: 4, tenant: 8, code: 'c', cap: 1 },
        { id: 5, tenant: 9, code: null, cap: 3 },
      ]);
      await opened.repo('Seats').insert([
        { id: 10, tenant: 7, orgcode: 'a', orgid: 1, total: 6 },
        { id: 11, tenant: 7, orgcode: 'a', orgid: 2, total: 10 },
        { id: 12, tenant: 7, orgcode: 'b', orgid: 2, total: 8 },
        { id: 13, tenant: 7, orgcode: null, orgid: null, total: 1 },
      ]);
      await opened.repo('Profiles').insert([
        { id: 20, orgid: 1, score: 9 },
        { id: 21, orgid: 2, score: 3 },
      ]);
    });

    afterAll(async () => {
      if (db !== undefined) await drop().catch(() => {});
      await norm?.disconnect().catch(() => {});
    });

    const live = (
      title: string,
      fn: (db: Db) => Promise<void>,
    ) =>
      it(title, async () => {
        if (db === undefined) {
          requireLive(reason);
          console.warn(`  (skipped) ${reason}`);
          return;
        }
        await fn(db);
      });

    live(
      'a relation projection keeps rows apart whose projected columns are equal',
      async (db) => {
        const orgs = await db.repo('Orgs').find(undefined, {
          project: { '@tenant': true, '@Seats': { '@id': true } },
          orderBy: { '@id': 'ASC' },
          total: true,
        });
        asserts.assertEquals(
          orgs.data.map((r) => [r.tenant, r.Seats.map((s) => s.id).sort()]),
          [[7, [10]], [7, [11, 12]], [7, []], [8, []], [9, []]],
        );
        asserts.assertEquals(Object.keys(orgs.data[0]!).sort(), [
          'Seats',
          'tenant',
        ]);
        asserts.assertEquals(orgs.total, 5);
      },
    );

    // Seats 10 and 11 each match orgs 1 and 2; orgs 1, 2 and 3 each
    // match one or two seats.
    const ids = (r: { data: Array<{ id: number }> }) => r.data.map((x) => x.id);
    const counted = async (
      repo: 'Orgs' | 'Seats' | 'Profiles',
      filter: Record<string, unknown>,
      options: Record<string, unknown> = {},
    ) => {
      // deno-lint-ignore no-explicit-any
      const r = db!.repo(repo) as any;
      const all = await r.find(filter, {
        orderBy: { '@id': 'ASC' },
        ...options,
      });
      const page = await r.find(filter, {
        orderBy: { '@id': 'ASC' },
        limit: 1,
        offset: 1,
        total: true,
        ...options,
      });
      return {
        ids: ids(all),
        count: (await r.count(filter)).count,
        page: ids(page),
        total: page.total,
      };
    };

    live(
      'a filter through a to-one relation whose key is not unique returns and counts each row once',
      async () => {
        asserts.assertEquals(
          await counted('Seats', { '@Org.@cap': { $lt: 8 } }),
          { ids: [10, 11], count: 2, page: [11], total: 2 },
        );
        asserts.assertEquals(
          await counted('Orgs', { '@Seat.@total': { $gt: 5 } }),
          { ids: [1, 2, 3], count: 3, page: [2], total: 3 },
        );
      },
    );

    live(
      'a filter value from such a relation returns and counts each row once',
      async () => {
        if (fx.name === 'mongo') {
          // The joined rows are an array there, which no value compares with.
          await asserts.assertRejects(
            () => db!.repo('Orgs').find({ '@id': { $lt: '@Seat.@id' } }),
            Error,
            'as a filter value',
          );
          return;
        }
        asserts.assertEquals(
          await counted('Orgs', { '@id': { $lt: '@Seat.@id' } }),
          { ids: [1, 2, 3], count: 3, page: [2], total: 3 },
        );
        asserts.assertEquals(
          await counted('Seats', { '@total': { $gt: '@Org.@cap' } }),
          { ids: [10, 11], count: 2, page: [11], total: 2 },
        );
        asserts.assertEquals(
          await counted('Orgs', { '@cap': { $lt: '@Profile.@score' } }),
          { ids: [1], count: 1, page: [], total: 1 },
        );
        const rows = await db!.repo('Seats').find(
          { '@total': { $gt: '@Org.@cap' } },
          { orderBy: { '@id': 'ASC' }, limit: 1 },
        );
        asserts.assertEquals(rows.data, [
          { id: 10, tenant: 7, orgcode: 'a', orgid: 1, total: 6 },
        ]);
      },
    );

    // Where NULL sorts differs by engine, so these orderings skip the
    // seat and the org that have no related row.
    live(
      'ordering through such a relation sorts each row once, by its smallest or largest related value',
      async () => {
        const seats = db!.repo('Seats');
        const matched = { '@orgcode': { $null: false } } as const;
        const asc = await seats.find(matched, {
          orderBy: { '@Org.@cap': 'ASC', '@id': 'DESC' },
          limit: 2,
          total: true,
        });
        asserts.assertEquals(ids(asc), [11, 10]);
        asserts.assertEquals(asc.total, 3);
        const desc = await seats.find(matched, {
          orderBy: { '@Org.@cap': 'DESC', '@id': 'ASC' },
        });
        asserts.assertEquals(ids(desc), [12, 10, 11]);
        const orgs = await db!.repo('Orgs').find({ '@tenant': 7 }, {
          orderBy: { '@Seat.@total': 'DESC', '@id': 'DESC' },
        });
        asserts.assertEquals(ids(orgs), [2, 1, 3]);
        // A key that matches one row sorts by that row.
        const owned = await seats.find({ '@orgid': { $null: false } }, {
          orderBy: { '@Owner.@cap': 'DESC', '@id': 'ASC' },
        });
        asserts.assertEquals(ids(owned), [11, 12, 10]);
      },
    );

    live(
      'a relation to a view keeps an all-NULL match',
      async () => {
        const orgs = db!.repo('Orgs');
        const some = { '@id': { $in: [1, 3, 5] } };
        // Org 1 matches two seats, and which one a to-one carries is the
        // engine's own order, so only the single matches are compared.
        const one = await orgs.find({ '@id': { $in: [3, 5] } }, {
          project: { '@id': true, '@SeatRow': { '@total': true } },
          orderBy: { '@id': 'ASC' },
        });
        asserts.assertEquals(
          one.data.map((r) => [r.id, r.SeatRow]),
          [[3, { total: 8 }], [5, { total: 1 }]],
        );
        const all = await orgs.find(some, {
          project: { '@id': true, '@SeatRows': { '@orgcode': true } },
          orderBy: { '@id': 'ASC' },
        });
        asserts.assertEquals(
          all.data.map((r) => [r.id, r.SeatRows]),
          [
            [1, [{ orgcode: 'a' }, { orgcode: 'a' }]],
            [3, [{ orgcode: 'b' }]],
            [5, [{ orgcode: null }]],
          ],
        );
        const code = await orgs.find({ '@id': 5 }, {
          project: { '@id': true, '@SeatRow': { '@orgcode': true } },
        });
        asserts.assertEquals(code.data[0]!.SeatRow, { orgcode: null });
      },
    );
  });
}
