/**
 * @fileoverview Key derivation and peppered digests — a live SQLite run.
 * `keyDerivation: 'HKDF'` writes `k2` cells whose key is an HKDF key (the
 * derivation Cloudflare Workers can run), reads follow each cell's tag,
 * and a same-key `rotateKey()` moves `k1` cells to `k2`. `hashPepper`
 * keys the searchable digests; `legacyHashes` bridges the migration and
 * `rotateKey({ rehash: true })` completes it. Construction refuses the
 * unsafe combinations.
 * @module
 */

import { afterEach, beforeEach, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import { decryptAES } from '@tundralibs/crypt/encrypt';
import { deriveHKDFKey } from '@tundralibs/crypt/generators';
import { digest } from '@tundralibs/crypt/digest';
import { signHMAC } from '@tundralibs/crypt/sign';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import {
  Column,
  Entity,
  Norm,
  type NormConfig,
  NormCryptoError,
  NormDefinitionError,
  rotateKey,
  Schema,
} from './mod.ts';
import '@tundralibs/norm/engines/sqlite';
import { registerEngine, resolveEngineFactory } from './engines/mod.ts';
import { Migrator } from './migrations/mod.ts';

const SECRET = 'hkdf-secret-0123456789abcdef0123456789';
const PEPPER = 'pepper-0123456789abcdef0123456789abcd';

const Vaults = Entity('vaults', {
  id: Column.integer(),
  secret: Column.varchar(255).encrypt().hash(),
}, { pk: ['id'] });

const Tokens = Entity('tokens', {
  id: Column.integer(),
  token: Column.hash('SHA-256', { keyed: true }),
}, { pk: ['id'] });

let dir = '';
let migDir = '';
let sharedEngine: SQLiteEngine;

/** A Norm over the shared db (see rotate.test.ts for why the engine is pinned). */
function pinned(extra: Partial<NormConfig>): Norm {
  const stock = resolveEngineFactory('sqlite');
  registerEngine('sqlite', () => sharedEngine as never);
  try {
    return new Norm({
      database: { dialect: 'sqlite', path: dir },
      secret: SECRET,
      ...extra,
    });
  } finally {
    registerEngine('sqlite', stock as never);
  }
}

const vaults = (extra: Partial<NormConfig> = {}) =>
  pinned(extra).use(Schema('App', { Vaults }));
const withTokens = (extra: Partial<NormConfig> = {}) =>
  pinned(extra).use(Schema('App', { Vaults, Tokens }));

/** The stored value of one column, read past norm's decrypt/rewrite. */
async function stored(table: string, col: string, id: number) {
  const res = await vaults().raw<Record<string, string>>(
    `SELECT "${col}" AS v FROM "${table}" WHERE "id" = :id:`,
    { id },
  );
  return res.data[0]!.v!;
}

async function migrate(db: object) {
  await new Migrator(db, { dir: migDir }).snapshot();
  await new Migrator(db, { dir: migDir }).apply();
}

describe('norm key derivation — HKDF cells (k2)', () => {
  beforeEach(async () => {
    dir = await makeTempDir({ prefix: 'norm-keys-db-' });
    migDir = await makeTempDir({ prefix: 'norm-keys-mig-' });
    sharedEngine = new SQLiteEngine('keys', { path: dir });
    await sharedEngine.connect();
    await migrate(vaults());
  });
  afterEach(async () => {
    await sharedEngine.disconnect();
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('writes a k2 cell whose key IS the HKDF key — no PBKDF2 on the path; a PBKDF2 instance still reads it by its tag', async () => {
    await vaults({ keyDerivation: 'HKDF' }).repo('Vaults').insert({
      id: 1,
      secret: 'alpha',
    });
    const cell = await stored('vaults', 'secret', 1);
    asserts.assert(cell.startsWith('k2.'), cell.slice(0, 12));
    const body = cell.slice(cell.indexOf('.', 3) + 1);
    const hkdf = await deriveHKDFKey(SECRET, {
      info: 'norm-cell-key',
      keyLength: 256,
    });
    asserts.assertEquals(await decryptAES(body, hkdf), 'alpha');
    const hkdfRead = await vaults({ keyDerivation: 'HKDF' }).repo('Vaults')
      .find({ '@id': 1 });
    asserts.assertEquals(hkdfRead.data[0]!.secret, 'alpha');
    const pbkdf2Read = await vaults().repo('Vaults').find({ '@id': 1 });
    asserts.assertEquals(pbkdf2Read.data[0]!.secret, 'alpha');
  });

  it('a same-key rotateKey on an HKDF instance moves k1 cells to k2, once', async () => {
    await vaults().repo('Vaults').insert([
      { id: 1, secret: 'alpha' },
      { id: 2, secret: 'beta' },
    ]);
    asserts.assert((await stored('vaults', 'secret', 1)).startsWith('k1.'));
    const hkdf = vaults({ keyDerivation: 'HKDF' });
    const first = await rotateKey(hkdf, { oldKey: SECRET, newKey: SECRET });
    asserts.assertEquals(first.rotatedCells, 2);
    asserts.assert((await stored('vaults', 'secret', 2)).startsWith('k2.'));
    const again = await rotateKey(hkdf, { oldKey: SECRET, newKey: SECRET });
    asserts.assertEquals([again.rotatedCells, again.skippedCells], [0, 2]);
    const read = await hkdf.repo('Vaults').find({ '@secret': 'beta' });
    asserts.assertEquals(read.data.map((r) => r.id), [2]);
  });

  it('refuses HKDF with a non-GCM cipher, a short secret, or a BYO cipher', () => {
    const refused = (extra: Partial<NormConfig>, fragment: string) => {
      const error = asserts.assertThrows(
        () => vaults(extra),
        NormDefinitionError,
      );
      asserts.assertStringIncludes(error.message, fragment);
    };
    refused(
      { keyDerivation: 'HKDF', algorithm: 'AES-256-CBC' },
      'requires an AES-GCM algorithm',
    );
    refused(
      { keyDerivation: 'HKDF', secret: 'too-short-secret' },
      'at least 32 characters',
    );
    refused(
      {
        keyDerivation: 'HKDF',
        crypto: {
          encrypt: (p: string) => Promise.resolve(p),
          decrypt: (c: string) => Promise.resolve(c),
        },
      },
      'derives its own key',
    );
  });
});

describe('norm peppered digests — hashPepper, legacyHashes, rehash', () => {
  beforeEach(async () => {
    dir = await makeTempDir({ prefix: 'norm-pepper-db-' });
    migDir = await makeTempDir({ prefix: 'norm-pepper-mig-' });
    sharedEngine = new SQLiteEngine('pepper', { path: dir });
    await sharedEngine.connect();
    await migrate(withTokens({ hashPepper: PEPPER }));
  });
  afterEach(async () => {
    await sharedEngine.disconnect();
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('a sibling is HMAC-SHA-256 under the pepper; equality filters and db.hash() follow it', async () => {
    const db = vaults({ hashPepper: PEPPER });
    await db.repo('Vaults').insert({ id: 1, secret: 'alpha' });
    const sibling = await stored('vaults', 'secret_hash', 1);
    asserts.assertEquals(sibling, await signHMAC('alpha', PEPPER));
    asserts.assertNotEquals(
      sibling,
      await digest('alpha', { algorithm: 'SHA-256' }),
    );
    asserts.assertEquals(await db.hash('alpha'), sibling);
    const hit = await db.repo('Vaults').find({ '@secret': 'alpha' });
    asserts.assertEquals(hit.data.map((r) => r.id), [1]);
  });

  it('legacyHashes matches pre-pepper rows (either form for IN/eq, both excluded for $ne); rehash migrates them', async () => {
    await vaults({ hashPepper: PEPPER }).repo('Vaults').insert({
      id: 1,
      secret: 'alpha',
    });
    await vaults().repo('Vaults').insert({ id: 2, secret: 'beta' }); // unkeyed sibling
    const peppered = vaults({ hashPepper: PEPPER });
    const bridged = vaults({ hashPepper: PEPPER, legacyHashes: true });
    const ids = async (db: typeof peppered, where: Record<string, unknown>) =>
      (await db.repo('Vaults').find(where as never)).data.map((r) => r.id)
        .sort();

    asserts.assertEquals(await ids(peppered, { '@secret': 'beta' }), []);
    asserts.assertEquals(await ids(bridged, { '@secret': 'beta' }), [2]);
    asserts.assertEquals(
      await ids(bridged, { '@secret': { $in: ['alpha', 'beta'] } }),
      [1, 2],
    );
    // $ne must exclude BOTH forms — without the bridge the old row leaks.
    asserts.assertEquals(
      await ids(peppered, { '@secret': { $ne: 'beta' } }),
      [1, 2],
    );
    asserts.assertEquals(
      await ids(bridged, { '@secret': { $ne: 'beta' } }),
      [1],
    );

    const report = await rotateKey(peppered, {
      oldKey: SECRET,
      newKey: SECRET,
      rehash: true,
    });
    asserts.assertEquals(report.rehashedCells, 2);
    asserts.assertEquals(report.rotatedCells, 0);
    asserts.assertEquals(await ids(peppered, { '@secret': 'beta' }), [2]);
  });

  it('a keyed digest column stores HMAC-algo; it needs the pepper, and keyed PBKDF2 is refused', async () => {
    const db = withTokens({ hashPepper: PEPPER });
    await db.repo('Tokens').insert({ id: 1, token: 't0k3n' });
    const value = await stored('tokens', 'token', 1);
    asserts.assertEquals(value, await signHMAC('t0k3n', PEPPER));
    asserts.assertEquals(
      await db.hash('t0k3n', 'SHA-256', { keyed: true }),
      value,
    );
    const hit = await db.repo('Tokens').find({ '@token': 't0k3n' });
    asserts.assertEquals(hit.data.map((r) => r.id), [1]);

    const unpeppered = asserts.assertThrows(
      () => withTokens(),
      NormDefinitionError,
    );
    asserts.assertStringIncludes(unpeppered.message, "no 'hashPepper'");
    await asserts.assertRejects(
      () => vaults().hash('x', 'SHA-256', { keyed: true }),
      NormCryptoError,
      "no 'hashPepper'",
    );
    asserts.assertThrows(
      () =>
        pinned({ hashPepper: PEPPER }).use(Schema('App', {
          Bad: Entity('bad', {
            id: Column.integer(),
            p: Column.hash('PBKDF2', { keyed: true }),
          }, { pk: ['id'] }),
        })),
      NormDefinitionError,
      'keyed applies to SHA-256/384/512',
    );
    asserts.assertThrows(
      () => vaults({ hashPepper: 'short' }),
      NormDefinitionError,
      'hashPepper must be at least 32 characters',
    );
  });
});
