/**
 * @fileoverview Key rotation (`rotateKey`) — a live SQLite run.
 * Encrypt real rows under key A, rotate to key B in place, and prove:
 * B reads them, A no longer can, the searchable hash still filters,
 * a second run is a no-op, a dry run writes nothing, a wrong old key is
 * a visible no-op (not corruption), and legacy un-stamped cells upgrade.
 * @module
 */

import { afterEach, beforeEach, describe, it } from '@tundralibs/compat/test';
import { makeTempDir, removeDir } from '@tundralibs/compat/file';
import * as asserts from '@std/asserts';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import {
  Column,
  Entity,
  Norm,
  NormCryptoError,
  rotateKey,
  Schema,
} from './mod.ts';
import { Migrator } from './migrations/mod.ts';
import { DEFAULT_ENCRYPT_ALGORITHM, defaultEncrypt } from './crypto.ts';

const KEY_A = 'rotate-old-key-aaaaaaaa';
const KEY_B = 'rotate-new-key-bbbbbbbb';

const Vaults = Entity('vaults', {
  id: Column.integer(),
  secret: Column.varchar(255).encrypt().hash(),
  label: Column.varchar(64),
}, { pk: ['id'] });

let dir = '';
let migDir = '';

/** A Norm over the shared db under a given key (default 'null' policy —
 * a cell that won't decrypt reads as null rather than throwing). */
function norm(secret: string) {
  const engine = new SQLiteEngine('rotate', { path: dir });
  return new Norm({ engine, secret }).use(Schema('App', { Vaults }));
}

describe('norm.rotateKey — in-place key rotation', () => {
  beforeEach(async () => {
    dir = await makeTempDir({ prefix: 'norm-rotate-db-' });
    migDir = await makeTempDir({ prefix: 'norm-rotate-mig-' });
    const db = norm(KEY_A);
    await new Migrator(db, { dir: migDir }).snapshot();
    await new Migrator(db, { dir: migDir }).apply();
    await db.repo('Vaults').insert([
      { id: 1, secret: 'alpha', label: 'a' },
      { id: 2, secret: 'beta', label: 'b' },
      { id: 3, secret: 'gamma', label: 'c' },
    ]);
  });
  afterEach(async () => {
    await removeDir(dir, { recursive: true });
    await removeDir(migDir, { recursive: true });
  });

  it('rotates every encrypted cell A→B: B reads, A can no longer', async () => {
    const report = await rotateKey(norm(KEY_A), {
      oldKey: KEY_A,
      newKey: KEY_B,
    });
    asserts.assertEquals(report.dryRun, false);
    asserts.assertEquals(report.rotatedCells, 3);
    asserts.assertEquals(report.skippedCells, 0);
    asserts.assertEquals(report.unknownCells, 0);
    asserts.assertEquals(report.entities.length, 1);
    asserts.assertEquals(report.entities[0]!.rotatedRows, 3);

    // The new key recovers every value.
    const asB = await norm(KEY_B).repo('Vaults').find(undefined, {
      orderBy: { '@id': 'ASC' },
    });
    asserts.assertEquals(asB.data.map((r) => r.secret), [
      'alpha',
      'beta',
      'gamma',
    ]);

    // The old key can no longer decrypt — every secret degrades to null,
    // but the non-encrypted columns are untouched.
    const asA = await norm(KEY_A).repo('Vaults').find(undefined, {
      orderBy: { '@id': 'ASC' },
    });
    asserts.assertEquals(
      asA.data.map((r) => r.secret) as Array<string | null>,
      [null, null, null],
    );
    asserts.assertEquals(asA.data.map((r) => r.label), ['a', 'b', 'c']);
  });

  it('is idempotent: a second A→B run rotates nothing', async () => {
    await rotateKey(norm(KEY_A), { oldKey: KEY_A, newKey: KEY_B });
    const again = await rotateKey(norm(KEY_A), {
      oldKey: KEY_A,
      newKey: KEY_B,
    });
    asserts.assertEquals(again.rotatedCells, 0);
    asserts.assertEquals(again.skippedCells, 3); // all already under B
    asserts.assertEquals(again.unknownCells, 0);
    // Data still intact under B.
    const asB = await norm(KEY_B).repo('Vaults').find({ '@id': 2 });
    asserts.assertEquals(asB.data[0]!.secret, 'beta');
  });

  it('searchable hash survives rotation (plaintext-derived, untouched)', async () => {
    await rotateKey(norm(KEY_A), { oldKey: KEY_A, newKey: KEY_B });
    // The sibling digest never moved, so the hashed-equality filter still
    // finds the row — under the NEW key, with no reindex.
    const hit = await norm(KEY_B).repo('Vaults').find({ '@secret': 'beta' });
    asserts.assertEquals(hit.data.length, 1);
    asserts.assertEquals(hit.data[0]!.id, 2);
    asserts.assertEquals(hit.data[0]!.secret, 'beta');
  });

  it('dryRun previews the job and writes nothing', async () => {
    const preview = await rotateKey(norm(KEY_A), {
      oldKey: KEY_A,
      newKey: KEY_B,
      dryRun: true,
    });
    asserts.assertEquals(preview.dryRun, true);
    asserts.assertEquals(preview.rotatedCells, 3);
    asserts.assertEquals(preview.entities[0]!.rotatedRows, 3);
    // Nothing was actually rewritten — the OLD key still reads everything.
    const asA = await norm(KEY_A).repo('Vaults').find(undefined, {
      orderBy: { '@id': 'ASC' },
    });
    asserts.assertEquals(asA.data.map((r) => r.secret), [
      'alpha',
      'beta',
      'gamma',
    ]);
  });

  it('a wrong oldKey is a visible no-op, never corruption', async () => {
    const report = await rotateKey(norm(KEY_A), {
      oldKey: 'not-the-real-old-key',
      newKey: KEY_B,
    });
    // Cells are stamped under A, not the wrong key → all "unknown",
    // none rotated. The tally makes the mistake obvious.
    asserts.assertEquals(report.rotatedCells, 0);
    asserts.assertEquals(report.unknownCells, 3);
    // Data is untouched — the REAL old key still reads it.
    const asA = await norm(KEY_A).repo('Vaults').find({ '@id': 1 });
    asserts.assertEquals(asA.data[0]!.secret, 'alpha');
  });

  it('validates its keys', async () => {
    await asserts.assertRejects(
      () => rotateKey(norm(KEY_A), { oldKey: KEY_A, newKey: KEY_A }),
      Error,
      'identical',
    );
    await asserts.assertRejects(
      () => rotateKey(norm(KEY_A), { oldKey: '', newKey: KEY_B }),
      Error,
      'required',
    );
  });

  it('validates chunkSize: a non-positive / non-integer value fails loudly', async () => {
    // A zero / negative / fractional chunkSize would otherwise silently
    // no-op (LIMIT 0 rotates nothing yet reports success) or loop
    // pathologically — reject it up front like the keys above.
    for (
      const bad of [0, -1, -100, 2.5, Number.NaN, Number.POSITIVE_INFINITY]
    ) {
      await asserts.assertRejects(
        () =>
          rotateKey(norm(KEY_A), {
            oldKey: KEY_A,
            newKey: KEY_B,
            chunkSize: bad,
          }),
        Error,
        'chunkSize must be a positive integer',
      );
    }
  });

  it('upgrades a legacy (un-stamped) cell as it rotates', async () => {
    // Forge a pre-rotation ciphertext: encrypted under KEY_A with NO
    // key-id envelope, exactly what data written before rotation support
    // looks like. Overwrite row 1's ciphertext with it out-of-band.
    const legacy = await defaultEncrypt(
      'legacyval',
      KEY_A,
      DEFAULT_ENCRYPT_ALGORITHM,
    );
    asserts.assertEquals(legacy.startsWith('k1.'), false); // truly un-stamped
    await norm(KEY_A).raw(
      'UPDATE "vaults" SET "secret" = :v: WHERE "id" = :id:',
      {
        v: legacy,
        id: 1,
      },
    );
    // The old key reads legacy directly (no envelope to verify).
    const pre = await norm(KEY_A).repo('Vaults').find({ '@id': 1 });
    asserts.assertEquals(pre.data[0]!.secret, 'legacyval');

    const report = await rotateKey(norm(KEY_A), {
      oldKey: KEY_A,
      newKey: KEY_B,
    });
    asserts.assertEquals(report.rotatedCells, 3); // legacy row rotates too

    // Now stamped under B and readable there; the old key cannot.
    const asB = await norm(KEY_B).repo('Vaults').find({ '@id': 1 });
    asserts.assertEquals(asB.data[0]!.secret, 'legacyval');
    const asA = await norm(KEY_A).repo('Vaults').find({ '@id': 1 });
    asserts.assertEquals(asA.data[0]!.secret as string | null, null);
  });
});
