/**
 * @fileoverview End-to-end round-trip for the extended column types
 * (tinyint/smallint/int/numeric/clob/binary/varbinary/bit/xml/password)
 * over live SQLite: Migrator builds the DDL, then insert → read back.
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { Column, Entity, Norm, Schema } from './mod.ts';
import { Migrator } from './migrations/mod.ts';

const Widgets = Entity('widgets', {
  id: Column.int(),
  qty: Column.tinyint(),
  rank: Column.smallint(),
  amount: Column.numeric(12, 2),
  doc: Column.clob(),
  markup: Column.xml(),
  flags: Column.bit(),
  payload: Column.binary(4),
  vpayload: Column.varbinary(8),
  secret: Column.password(),
}, { pk: ['id'] });

let dir = '';
let migDir = '';

function open() {
  const engine = new SQLiteEngine('coltypes', { path: dir });
  return new Norm({ engine, secret: 'coltypes-secret' })
    .use(Schema('App', { Widgets }));
}

describe('norm.column-types — extended SQL types round-trip (live SQLite)', () => {
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'norm-coltypes-db-' });
    migDir = await makeTempDir({ prefix: 'norm-coltypes-mig-' });
    const db = open();
    await new Migrator(db, { dir: migDir }).snapshot();
    await new Migrator(db, { dir: migDir }).apply();
  });
  afterAll(async () => {
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('inserts and reads back every extended type', async () => {
    const db = open();
    await db.repo('Widgets').insert({
      id: 1,
      qty: 7,
      rank: 300,
      amount: 199.95,
      doc: 'a long character large object',
      markup: '<note>hi</note>',
      flags: 5,
      payload: new Uint8Array([1, 2, 3, 4]),
      vpayload: new Uint8Array([9, 8, 7]),
      secret: 'hunter2', // digested on write
    });

    const res = await db.repo('Widgets').find({ '@id': 1 });
    const row = res.data[0]!;
    asserts.assertEquals(row.qty, 7); // tinyint → number
    asserts.assertEquals(row.rank, 300); // smallint → number
    asserts.assertEquals(row.amount, 199.95); // numeric → number
    asserts.assertEquals(row.doc, 'a long character large object'); // clob
    asserts.assertEquals(row.markup, '<note>hi</note>'); // xml
    asserts.assertEquals(row.flags, 5); // bit → number
    asserts.assertEquals([...row.payload], [1, 2, 3, 4]); // binary
    asserts.assertEquals([...row.vpayload], [9, 8, 7]); // varbinary
    // password is a one-way digest — the stored/read value is the hex
    // SHA-256, not the plaintext, but it filters by plaintext.
    asserts.assertEquals((row.secret as string).length, 64);
    const byPlain = await db.repo('Widgets').find({ '@secret': 'hunter2' });
    asserts.assertEquals(byPlain.data.length, 1);
  });

  it('validators dispatch on the new numeric/string kinds', async () => {
    // smallint validates as an integer; clob as a string.
    const Guarded = Entity('guarded', {
      id: Column.int(),
      count: Column.smallint().min(0).max(10),
      label: Column.clob().minLength(3),
    }, { pk: ['id'] });
    const gdir = await makeTempDir({ prefix: 'norm-coltypes-g-' });
    const engine = new SQLiteEngine('coltypes-g', { path: gdir });
    const db = new Norm({ engine }).use(Schema('G', { Guarded }));
    const gmig = await makeTempDir({ prefix: 'norm-coltypes-gm-' });
    await new Migrator(db, { dir: gmig }).snapshot();
    await new Migrator(db, { dir: gmig }).apply();

    await asserts.assertRejects(
      () => db.repo('Guarded').insert({ id: 1, count: 99, label: 'ok' }),
    ); // 99 > max 10
    await asserts.assertRejects(
      () => db.repo('Guarded').insert({ id: 2, count: 5, label: 'no' }),
    ); // 'no' < minLength 3
    await db.repo('Guarded').insert({ id: 3, count: 5, label: 'yes' });
    const r = await db.repo('Guarded').find({ '@id': 3 });
    asserts.assertEquals(r.data[0]!.count, 5);
    await removeDir(gdir, { recursive: true });
    await removeDir(gmig, { recursive: true });
  });
});
