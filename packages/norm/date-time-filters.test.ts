/**
 * @fileoverview Filter values on `date()`, `time()` and timestamp
 * columns over live SQLite, which compares the text norm stored: a
 * value matches only once the filter converts it the way a write does.
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import '@tundralibs/norm/engines/sqlite';
import { Column, Entity, Norm, Schema } from './mod.ts';
import { Migrator } from './migrations/mod.ts';

const Slots = Entity('slots', {
  id: Column.int(),
  day: Column.date().nullable(),
  due: Column.date().nullable(),
  at: Column.time().nullable(),
  ts: Column.timestamp().nullable(),
  tstz: Column.timestamptz().nullable(),
}, { pk: ['id'] });

const Bookings = Entity('bookings', {
  id: Column.int(),
  slotId: Column.int(),
  // Text under the name of a date column on `slots`.
  day: Column.varchar(30).nullable(),
}, {
  pk: ['id'],
  fk: { Slot: { model: 'Slots', on: { slotId: 'id' }, reverseAs: 'Bookings' } },
});

const Fees = Entity('fees', {
  id: Column.int(),
  name: Column.varchar(30),
}, { pk: ['id'], temporal: { key: ['name'] } });

const D = (iso: string) => new Date(iso);

/** One row a day, 13 to 15 January 2020, each `day` written mid-day. */
const ROWS = [
  {
    id: 1,
    day: D('2020-01-13T22:00:00Z'),
    due: D('2020-01-13T00:00:00Z'),
    at: '09:00',
    ts: D('2020-01-13T10:00:00Z'),
    tstz: D('2020-01-13T10:00:00Z'),
  },
  {
    id: 2,
    day: D('2020-01-14T15:00:00Z'),
    due: D('2020-01-20T00:00:00Z'),
    at: '10:30',
    ts: D('2020-01-14T10:00:00Z'),
    tstz: D('2020-01-14T10:00:00Z'),
  },
  {
    id: 3,
    day: D('2020-01-15T01:00:00Z'),
    due: D('2020-01-20T00:00:00Z'),
    at: '23:45:00.5',
    ts: D('2020-01-15T10:00:00Z'),
    tstz: D('2020-01-15T10:00:00Z'),
  },
];

/** A filter as a JSON payload carries it: the static filter type takes
 * a `Date` for a date column, never a string. */
type Filter = Record<string, unknown>;
type Case = [name: string, filter: Filter, ids: number[]];

const AFTERNOON = D('2020-01-14T15:00:00Z');

const DATE_CASES: Case[] = [
  ['a Date at any time of day', { '@day': AFTERNOON }, [2]],
  ['a date string', { '@day': '2020-01-14' }, [2]],
  ['a date-time string', { '@day': '2020-01-14T23:59:59+00:00' }, [2]],
  ['array shorthand', { '@day': [D('2020-01-13T05:00:00Z'), '2020-01-15'] }, [
    1,
    3,
  ]],
  ['$eq', { '@day': { $eq: AFTERNOON } }, [2]],
  ['$ne', { '@day': { $ne: '2020-01-14' } }, [1, 3]],
  ['$in', { '@day': { $in: ['2020-01-13', AFTERNOON] } }, [1, 2]],
  ['$nin', { '@day': { $nin: ['2020-01-13', AFTERNOON] } }, [3]],
  ['$gt is after that day', { '@day': { $gt: '2020-01-13' } }, [2, 3]],
  ['$gte includes that day', { '@day': { $gte: AFTERNOON } }, [2, 3]],
  ['$lt is before that day', { '@day': { $lt: AFTERNOON } }, [1]],
  ['$lte includes that day', { '@day': { $lte: '2020-01-14' } }, [1, 2]],
  ['$between', {
    '@day': { $between: [D('2020-01-13T18:00:00Z'), '2020-01-14'] },
  }, [1, 2]],
];

const TIME_CASES: Case[] = [
  ['a short time string', { '@at': '10:30' }, [2]],
  ['a Date, by its UTC clock', { '@at': D('2026-06-01T10:30:00Z') }, [2]],
  ['array shorthand', { '@at': ['09:00', '23:45:00.500'] }, [1, 3]],
  ['$eq', { '@at': { $eq: '09:00' } }, [1]],
  ['$ne', { '@at': { $ne: '10:30' } }, [1, 3]],
  ['$in', { '@at': { $in: ['09:00', D('2026-06-01T10:30:00Z')] } }, [1, 2]],
  ['$nin', { '@at': { $nin: ['09:00', '10:30'] } }, [3]],
  ['$gt', { '@at': { $gt: '09:00' } }, [2, 3]],
  ['$lte', { '@at': { $lte: '10:30' } }, [1, 2]],
  ['$between', { '@at': { $between: ['09:00', '10:30'] } }, [1, 2]],
];

const INSTANT_CASES: Case[] = [
  ['a string ending in Z', { '@ts': '2020-01-14T10:00:00Z' }, [2]],
  ['a string with no offset, as UTC', { '@ts': '2020-01-14 10:00:00' }, [2]],
  ['a string with an offset', { '@ts': '2020-01-14T15:30:00+05:30' }, [2]],
  ['array shorthand', {
    '@ts': ['2020-01-13T10:00:00Z', '2020-01-15T10:00:00'],
  }, [1, 3]],
  ['$ne', { '@ts': { $ne: '2020-01-14T10:00:00Z' } }, [1, 3]],
  ['$in', { '@tstz': { $in: ['2020-01-13T10:00:00Z'] } }, [1]],
  ['$nin', { '@tstz': { $nin: ['2020-01-13T10:00:00Z'] } }, [2, 3]],
  ['$gt', { '@ts': { $gt: '2020-01-14T10:00:00' } }, [3]],
  ['$lte', { '@tstz': { $lte: '2020-01-14T12:00:00+05:30' } }, [1]],
  ['$between', {
    '@tstz': { $between: ['2020-01-13T10:00:00Z', '2020-01-14T10:00:00Z'] },
  }, [1, 2]],
  ['timestamptz equality', { '@tstz': '2020-01-14T15:30:00+05:30' }, [2]],
];

let dir = '';
let migDir = '';
let norm: Norm;
const open = () => norm.use(Schema('App', { Slots, Bookings, Fees }));

describe('norm — date and time filter values (live SQLite)', () => {
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'norm-datefilter-db-' });
    migDir = await makeTempDir({ prefix: 'norm-datefilter-mig-' });
    norm = new Norm({ database: { dialect: 'sqlite', path: dir } });
    await norm.connect();
    await new Migrator(open(), { dir: migDir }).snapshot();
    await new Migrator(open(), { dir: migDir }).apply();
    const db = open();
    for (const row of ROWS) await db.repo('Slots').insert(row);
    await db.repo('Bookings').insert({
      id: 10,
      slotId: 2,
      day: '2020-01-14',
    });
    await db.repo('Bookings').insert({ id: 11, slotId: 3 });
  });
  afterAll(async () => {
    await norm.disconnect();
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  const ids = async (filter: Filter) =>
    (await open().repo('Slots').find(filter, { orderBy: { '@id': 'ASC' } }))
      .data.map((r) => r.id);

  for (
    const [kind, cases] of [
      ['date()', DATE_CASES],
      ['time()', TIME_CASES],
      ['timestamp() and timestamptz()', INSTANT_CASES],
    ] as const
  ) {
    describe(kind, () => {
      for (const [name, filter, expected] of cases) {
        it(name, async () => {
          asserts.assertEquals(await ids(filter), expected);
        });
      }
    });
  }

  it('reaches a relation column the same way', async () => {
    const filter: Filter = { '@Slot.@day': '2020-01-14T09:00:00Z' };
    const found = await open().repo('Bookings').find(filter);
    asserts.assertEquals(found.data.map((r) => r.id), [10]);
  });

  it('leaves a hand-written $exists to its own table', async () => {
    const filter: Filter = {
      $exists: {
        table: 'bookings',
        on: { '@slotId': '@id' },
        where: { '@day': '2020-01-14' },
      },
    };
    asserts.assertEquals(await ids(filter), [2]);
  });

  it('reads an @AsOf string as an instant', async () => {
    const fees = open().repo('Fees');
    const from = (await fees.insert({ id: 1, name: 'Gold' })).data[0]!
      .EffectiveFrom as Date;
    // One millisecond into the version, written as New York wall time.
    const asOf = new Date(from.getTime() + 1 - 5 * 3_600_000).toISOString()
      .replace('Z', '-05:00');
    const filter: Filter = { '@name': 'Gold', '@AsOf': asOf };
    asserts.assertEquals((await fees.find(filter)).data.map((r) => r.id), [1]);
  });

  it("leaves the caller's filter as it was given", async () => {
    const filter = {
      '@day': { $in: ['2020-01-14'], $lt: AFTERNOON },
      '@at': ['10:30'],
      '@ts': { $between: ['2020-01-14T10:00:00', '2020-01-14T10:00:00'] },
    };
    const before = structuredClone(filter);
    await ids(filter);
    asserts.assertEquals(filter, before);
    asserts.assertStrictEquals(filter['@day'].$lt, AFTERNOON);
  });

  it('passes null, column references, expressions and other text through', async () => {
    asserts.assertEquals(await ids({ '@day': null }), []);
    asserts.assertEquals(await ids({ '@day': { $null: false } }), [1, 2, 3]);
    asserts.assertEquals(await ids({ '@due': '@day' }), [1]);
    asserts.assertEquals(await ids({ '@due': { $gt: '@day' } }), [2, 3]);
    asserts.assertEquals(
      await ids({ '@ts': { $lt: { $$_expression: 'NOW' } } }),
      [1, 2, 3],
    );
    asserts.assertEquals(await ids({ '@day': 'tomorrow' }), []);
    asserts.assertEquals(await ids({ '@at': 'noon' }), []);
  });

  it('count, update and delete filter the same way', async () => {
    const slots = open().repo('Slots');
    asserts.assertEquals((await slots.count({ '@day': AFTERNOON })).count, 1);
    const early: Filter = { '@at': { $lte: '10:30' } };
    await slots.update({ due: D('2020-02-01T00:00:00Z') }, early);
    asserts.assertEquals(await ids({ '@due': '2020-02-01' }), [1, 2]);
    const first: Filter = { '@ts': '2020-01-13 10:00:00' };
    await slots.delete(first);
    asserts.assertEquals(await ids({}), [2, 3]);
  });
});
