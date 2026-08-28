/**
 * @fileoverview Read-path decrypt-failure policy (`onDecryptFailure`).
 * A live SQLite run: encrypt real rows, corrupt ONE cell's ciphertext
 * out-of-band, then read the page under each policy.
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import '@tundralibs/norm/engines/sqlite';
import { Column, Entity, Norm, NormCryptoError, Schema } from './mod.ts';
import { Migrator } from './migrations/mod.ts';

const SECRET = 'crypto-read-test-secret';

const Vaults = Entity('vaults', {
  id: Column.integer(),
  secret: Column.varchar(255).encrypt().hash(),
  label: Column.varchar(64),
}, { pk: ['id'] });

type DecryptEvent = {
  entity: string;
  column: string;
  pk: unknown;
  reason: string;
};

/**
 * A self-contained corrupted database under a given failure policy: an
 * in-memory Norm with the schema migrated, two encrypted rows inserted,
 * and row 1's ciphertext corrupted out-of-band. Each test builds its own
 * — the policy is a per-Norm setting, so a shared handle can't serve both.
 */
async function makeCorruptDb(onDecryptFailure?: 'null' | 'throw') {
  const migDir = await makeTempDir({ prefix: 'norm-crypto-mig-' });
  const events: DecryptEvent[] = [];
  const norm = new Norm({
    database: { dialect: 'sqlite', path: ':memory:' },
    secret: SECRET,
    ...(onDecryptFailure ? { onDecryptFailure } : {}),
    _ondecryptError: (entity, column, pk, reason) =>
      void events.push({ entity, column, pk, reason }),
  });
  const db = norm.use(Schema('App', { Vaults }));
  await norm.connect();
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
  const cleanup = async () => {
    await norm.disconnect();
    await removeDir(migDir, { recursive: true });
  };
  return { db, events, cleanup };
}

describe('norm.crypto read-path failure policy', () => {
  it("default 'null' policy: one bad cell degrades to null + a decryptError event, the rest of the page survives", async () => {
    const { db, events, cleanup } = await makeCorruptDb(); // default 'null'
    try {
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
    } finally {
      await cleanup();
    }
  });

  it("'throw' policy: a bad cell raises a typed NormCryptoError naming entity/column/pk", async () => {
    const { db, cleanup } = await makeCorruptDb('throw');
    try {
      const err = await asserts.assertRejects(
        () => db.repo('Vaults').find(undefined, { orderBy: { '@id': 'ASC' } }),
        NormCryptoError,
      );
      const e = err as NormCryptoError;
      asserts.assertEquals(e.context.entity, 'Vaults');
      asserts.assertEquals(e.context.column, 'secret');
      asserts.assertEquals(e.context.pk, 1);
      asserts.assertEquals(e.context.reason, 'decrypt');
    } finally {
      await cleanup();
    }
  });

  it('the intact row still reads on its own (hashed filter unaffected by the corruption)', async () => {
    const { db, cleanup } = await makeCorruptDb();
    try {
      const res = await db.repo('Vaults').find({ '@secret': 'beta' });
      asserts.assertEquals(res.data.length, 1);
      asserts.assertEquals(res.data[0]!.secret, 'beta');
    } finally {
      await cleanup();
    }
  });
});

describe('norm.crypto envelope generations (live)', () => {
  it('writes the fast key-based envelope; legacy cells still read', async () => {
    const migDir = await makeTempDir({ prefix: 'norm-crypto-env-' });
    const norm = new Norm({
      database: { dialect: 'sqlite', path: ':memory:' },
      secret: SECRET,
    });
    const db = norm.use(Schema('App', { Vaults }));
    try {
      await norm.connect();
      await new Migrator(db, { dir: migDir }).snapshot();
      await new Migrator(db, { dir: migDir }).apply();
      await db.repo('Vaults').insert([{ id: 1, secret: 'alpha', label: 'a' }]);

      // New writes: k1.<fp>. stamp over a 2-part data:iv body — no salt,
      // because the cell key is derived once per process, not per cell.
      const raw = await db.raw<{ secret: string }>(
        'SELECT "secret" FROM "vaults" WHERE "id" = 1',
      );
      const stored = raw.data[0]!.secret;
      asserts.assertEquals(stored.startsWith('k1.'), true);
      const body = stored.split('.').slice(2).join('.');
      asserts.assertEquals(body.split(':').length, 2);

      // Plant a LEGACY cell: stamped k1 envelope over the old 3-part
      // per-message-salt body — what pre-fast-path versions wrote.
      const { encryptAES } = await import('@tundralibs/crypt/encrypt');
      const { keyFingerprint } = await import('./crypto.ts');
      const legacyBody = await encryptAES('bravo', SECRET, {
        mode: 'GCM',
        keyLength: 256,
      });
      asserts.assertEquals(legacyBody.split(':').length, 3);
      const fp = await keyFingerprint(SECRET);
      await db.raw(
        'INSERT INTO "vaults" ("id", "secret", "secret_hash", "label") ' +
          'VALUES (:id:, :v:, :h:, :l:)',
        { id: 2, v: `k1.${fp}.${legacyBody}`, h: 'x', l: 'b' },
      );

      // Both generations decrypt through one read path.
      const res = await db.repo('Vaults').find(undefined, {
        orderBy: { '@id': 'ASC' },
      });
      asserts.assertEquals(res.data[0]!.secret, 'alpha');
      asserts.assertEquals(res.data[1]!.secret, 'bravo');
    } finally {
      await norm.disconnect();
      await removeDir(migDir, { recursive: true });
    }
  });
});
