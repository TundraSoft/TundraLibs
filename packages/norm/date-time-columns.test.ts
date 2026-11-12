/**
 * @fileoverview `date()` and `time()` over live SQLite, which stores
 * what norm writes: a `date()` value is the UTC day, a `time()` value
 * an `HH:MM:SS` string — plain and encrypted, and for rows written by
 * earlier versions.
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import '@tundralibs/norm/engines/sqlite';
import { Guardian } from '@tundralibs/guardian';
import { Column, Entity, Norm, NormValidationError, Schema } from './mod.ts';
import { Migrator } from './migrations/mod.ts';

const Slots = Entity('slots', {
  id: Column.int(),
  day: Column.date().nullable(),
  at: Column.time().nullable(),
  sealedDay: Column.date().encrypt().nullable(),
  sealedAt: Column.time().encrypt().nullable(),
  opens: Column.time()
    .guard(Guardian.string().refine((s) => s >= '06:00', 'opens after 06:00'))
    .nullable(),
}, { pk: ['id'] });

let dir = '';
let migDir = '';
let norm: Norm;
const open = () => norm.use(Schema('App', { Slots }));

describe('norm — date() and time() columns (live SQLite)', () => {
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'norm-datetime-db-' });
    migDir = await makeTempDir({ prefix: 'norm-datetime-mig-' });
    norm = new Norm({
      database: { dialect: 'sqlite', path: dir },
      secret: 'date-time-secret',
    });
    await norm.connect();
    await new Migrator(open(), { dir: migDir }).snapshot();
    await new Migrator(open(), { dir: migDir }).apply();
  });
  afterAll(async () => {
    await norm.disconnect();
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('date(): stores the UTC day, so the day matches whatever instant was written', async () => {
    const db = open();
    await db.repo('Slots').insert({
      id: 1,
      day: new Date('2026-01-15T23:30:00Z'),
      sealedDay: new Date('2026-01-15T23:30:00Z'),
    });
    const raw = await db.raw<{ day: string }>(
      'SELECT day FROM slots WHERE id = :id:',
      { id: 1 },
    );
    asserts.assertEquals(raw.data[0]!.day, '2026-01-15T00:00:00.000Z');
    const found = await db.repo('Slots').find({
      '@day': new Date('2026-01-15T00:00:00Z'),
    });
    asserts.assertEquals(found.data.map((r) => r.id), [1]);
    asserts.assertEquals(
      found.data[0]!.sealedDay?.toISOString(),
      '2026-01-15T00:00:00.000Z',
    );
  });

  it('time(): reads back the HH:MM:SS string of a string or a Date', async () => {
    const db = open();
    await db.repo('Slots').insert({
      id: 2,
      at: '10:30',
      sealedAt: '08:15:00.5',
    });
    await db.repo('Slots').insert({
      id: 3,
      at: new Date('2026-01-15T23:45:00Z') as unknown as string,
    });
    const rows = (await db.repo('Slots').find({ '@id': { $in: [2, 3] } }, {
      orderBy: { '@id': 'ASC' },
    })).data;
    asserts.assertEquals(rows.map((r) => r.at), ['10:30:00', '23:45:00']);
    asserts.assertEquals(rows[0]!.sealedAt, '08:15:00.5');
    const found = await db.repo('Slots').find({ '@at': '10:30:00' });
    asserts.assertEquals(found.data.map((r) => r.id), [2]);
  });

  it('time(): rejects a value that is not a time of day, then runs the column guard', async () => {
    const db = open();
    for (const at of ['24:00', '9:30', 'noon']) {
      await asserts.assertRejects(
        () => db.repo('Slots').insert({ id: 4, at }),
        NormValidationError,
        'must be a time of day',
      );
    }
    await asserts.assertRejects(
      () => db.repo('Slots').insert({ id: 4, opens: '05:00' }),
      NormValidationError,
      'opens after 06:00',
    );
    await db.repo('Slots').insert({ id: 4, opens: '06:30' });
    const row = (await db.repo('Slots').find({ '@id': 4 })).data[0]!;
    asserts.assertEquals(row.opens, '06:30:00');
  });

  it('rows written by earlier versions read back as a day and a time of day', async () => {
    const db = open();
    await db.raw(
      'INSERT INTO slots (id, day, at) VALUES (:id:, :day:, :at:)',
      {
        id: 5,
        day: '2026-01-15T23:30:00.000Z',
        at: '2026-01-15T10:30:00.000Z',
      },
    );
    const row = (await db.repo('Slots').find({ '@id': 5 })).data[0]!;
    asserts.assertEquals(row.day?.toISOString(), '2026-01-15T00:00:00.000Z');
    asserts.assertEquals(row.at, '10:30:00');
  });
});
