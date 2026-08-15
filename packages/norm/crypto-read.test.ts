/**
 * @fileoverview Read-path decrypt-failure policy (`onDecryptFailure`).
 * A live SQLite run: encrypt real rows, corrupt ONE cell's ciphertext
 * out-of-band, then read the page under each policy.
 * @module
 */

import { afterAll, beforeAll, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { Column, Entity, Norm, NormCryptoError, Schema } from './mod.ts';
import { Migrator } from './migrations/mod.ts';

const SECRET = 'crypto-read-test-secret';

const Vaults = Entity('vaults', {
  id: Column.integer(),
  secret: Column.varchar(255).encrypt().hash(),
  label: Column.varchar(64),
}, { pk: ['id'] });

let dbDir = '';
let migDir = '';

/** A Norm over the shared SQLite db with a given failure policy. */
function open(onDecryptFailure?: 'null' | 'throw') {
  const engine = new SQLiteEngine('crypto-read', { path: dbDir });
  const events: Array<
    { entity: string; column: string; pk: unknown; reason: string }
  > = [];
  const norm = new Norm({
    engine,
    secret: SECRET,
    ...(onDecryptFailure ? { onDecryptFailure } : {}),
    _ondecryptError: (entity, column, pk, reason) =>
      void events.push({ entity, column, pk, reason }),
  });
  const db = norm.use(Schema('App', { Vaults }));
  return { db, events };
}

describe('norm.crypto read-path failure policy', () => {
  beforeAll(async () => {
    dbDir = await makeTempDir({ prefix: 'norm-crypto-db-' });
    migDir = await makeTempDir({ prefix: 'norm-crypto-mig-' });
    const { db } = open();
    await new Migrator(db, { dir: migDir }).snapshot();
    await new Migrator(db, { dir: migDir }).apply();
    // Two encrypted rows.
    await db.repo('Vaults').insert([
      { id: 1, secret: 'alpha', label: 'a' },
      { id: 2, secret: 'beta', label: 'b' },
    ]);
    // Corrupt row 1's ciphertext out-of-band (not a valid envelope).
    await db.raw('UPDATE "vaults" SET "secret" = :v: WHERE "id" = :id:', {
      v: 'not-a-ciphertext',
      id: 1,
    });
  });
  afterAll(async () => {
    await removeDir(dbDir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it("default 'null' policy: one bad cell degrades to null + a decryptError event, the rest of the page survives", async () => {
    const { db, events } = open(); // default onDecryptFailure = 'null'
    const res = await db.repo('Vaults').find(undefined, {
      orderBy: { '@id': 'ASC' },
    });
    const rows = res.data;
    asserts.assertEquals(rows.length, 2);
    // Row 1: the corrupt cell is null, but its OTHER columns are intact.
    asserts.assertEquals(rows[0]!.secret, null);
    asserts.assertEquals(rows[0]!.id, 1);
    asserts.assertEquals(rows[0]!.label, 'a');
    // Row 2 is untouched — good data still flows.
    asserts.assertEquals(rows[1]!.secret, 'beta');
    // Exactly one loud, metadata-only decryptError, naming the row.
    asserts.assertEquals(events.length, 1);
    asserts.assertEquals(events[0]!.entity, 'Vaults');
    asserts.assertEquals(events[0]!.column, 'secret');
    asserts.assertEquals(events[0]!.pk, 1);
    asserts.assertEquals(events[0]!.reason, 'decrypt');
  });

  it("'throw' policy: a bad cell raises a typed NormCryptoError naming entity/column/pk", async () => {
    const { db } = open('throw');
    const err = await asserts.assertRejects(
      () => db.repo('Vaults').find(undefined, { orderBy: { '@id': 'ASC' } }),
      NormCryptoError,
    );
    const e = err as NormCryptoError;
    asserts.assertEquals(e.context.entity, 'Vaults');
    asserts.assertEquals(e.context.column, 'secret');
    asserts.assertEquals(e.context.pk, 1);
    asserts.assertEquals(e.context.reason, 'decrypt');
  });

  it('the intact row still reads on its own (hashed filter unaffected by the corruption)', async () => {
    const { db } = open();
    const res = await db.repo('Vaults').find({ '@secret': 'beta' });
    asserts.assertEquals(res.data.length, 1);
    asserts.assertEquals(res.data[0]!.secret, 'beta');
  });
});
