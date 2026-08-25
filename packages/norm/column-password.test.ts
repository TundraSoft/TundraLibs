/**
 * @fileoverview `Column.password('PBKDF2')` — salted, verify-based password
 * storage — vs the deterministic `Column.password('SHA-256')` digest, over
 * live SQLite.
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import '@tundralibs/norm/engines/sqlite';
import { Column, Entity, Norm, pbkdf2Verify, Schema } from './mod.ts';
import { Migrator } from './migrations/mod.ts';

const Users = Entity('users', {
  id: Column.int(),
  // Deterministic digest — filter by plaintext works.
  pin: Column.password('SHA-256'),
  // Salted KDF — non-filterable, verify against the stored hash.
  secret: Column.password('PBKDF2'),
}, { pk: ['id'] });

let dir = '';
let migDir = '';
let norm: Norm;
// One Norm owns the file; each `open()` is another handle onto the same
// engine, so beforeAll's migration + seed row are visible to every test.
function open() {
  return norm.use(Schema('App', { Users }));
}

describe('norm.Column.password — PBKDF2 (salted) vs SHA-256 (deterministic)', () => {
  beforeAll(async () => {
    dir = await makeTempDir({ prefix: 'norm-pw-db-' });
    migDir = await makeTempDir({ prefix: 'norm-pw-mig-' });
    norm = new Norm({ database: { dialect: 'sqlite', path: dir } });
    await norm.connect();
    const db = open();
    await new Migrator(db, { dir: migDir }).snapshot();
    await new Migrator(db, { dir: migDir }).apply();
    await db.repo('Users').insert({ id: 1, pin: '1234', secret: 'hunter2' });
  });
  afterAll(async () => {
    await norm.disconnect();
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('PBKDF2 stores a salted self-describing hash, never the plaintext', async () => {
    const res = await open().repo('Users').find({ '@id': 1 });
    const secret = res.data[0]!.secret as string;
    asserts.assertEquals(secret.startsWith('pbkdf2-sha256$'), true);
    asserts.assertEquals(secret.includes('hunter2'), false);
  });

  it('verifies a candidate against the stored PBKDF2 hash', async () => {
    const row = (await open().repo('Users').find({ '@id': 1 })).data[0]!;
    asserts.assertEquals(
      await pbkdf2Verify('hunter2', row.secret as string),
      true,
    );
    asserts.assertEquals(
      await pbkdf2Verify('wrong', row.secret as string),
      false,
    );
  });

  it('a PBKDF2 column is NOT filterable by plaintext (verify, not look up)', async () => {
    await asserts.assertRejects(
      () => open().repo('Users').find({ '@secret': 'hunter2' }),
      Error,
    );
  });

  it('a deterministic SHA-256 password IS filterable by plaintext', async () => {
    const hit = await open().repo('Users').find({ '@pin': '1234' });
    asserts.assertEquals(hit.data.length, 1);
    asserts.assertEquals(hit.data[0]!.id, 1);
    // stored as a fixed 64-hex digest, not the plaintext
    asserts.assertEquals((hit.data[0]!.pin as string).length, 64);
  });

  it("a digest column's default() is declared plaintext, then digested on write", async () => {
    // `DigestColumnBuilder.default()` takes PLAINTEXT; the digesting
    // happens on the way to the database, exactly like a supplied value.
    const Accounts = Entity('accounts', {
      id: Column.int(),
      pin: Column.password('SHA-256').default('changeme'),
    }, { pk: ['id'] });

    const d = await makeTempDir({ prefix: 'norm-pw-def-db-' });
    const m = await makeTempDir({ prefix: 'norm-pw-def-mig-' });
    const accNorm = new Norm({ database: { dialect: 'sqlite', path: d } });
    try {
      await accNorm.connect();
      const openAcc = () => accNorm.use(Schema('App', { Accounts }));
      await new Migrator(openAcc(), { dir: m }).snapshot();
      await new Migrator(openAcc(), { dir: m }).apply();

      // `pin` omitted → the default fires.
      await openAcc().repo('Accounts').insert({ id: 1 });
      const row = (await openAcc().repo('Accounts').find({ '@id': 1 }))
        .data[0]!;
      const stored = row.pin as string;

      // The plaintext default never reaches the column…
      asserts.assertNotStrictEquals(stored, 'changeme');
      asserts.assertEquals(stored.length, 64);
      // …it is stored as the SHA-256 digest OF that plaintext.
      asserts.assertEquals(
        stored,
        '057ba03d6c44104863dc7361fe4578965d1887360f90a0895882e58a6248fc86',
      );
      // …and the defaulted row is still found by the plaintext filter.
      const hit = await openAcc().repo('Accounts').find({
        '@pin': 'changeme',
      });
      asserts.assertEquals(hit.data.length, 1);
      asserts.assertEquals(hit.data[0]!.id, 1);
    } finally {
      await accNorm.disconnect();
      await removeDir(d, { recursive: true });
      await removeDir(m, { recursive: true });
    }
  });
});
