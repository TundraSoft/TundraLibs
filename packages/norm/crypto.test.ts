/**
 * @fileoverview The GCM fast path: one derived cell key per secret,
 * 2-part `data:iv` envelopes, and backward compatibility with the two
 * legacy generations (3-part per-message-salt, 4-part CBC/CTR + MAC).
 * @module
 */

import { describe, it } from '@tundralibs/compat/test';
import * as asserts from '@std/asserts';
import { encryptAES } from '@tundralibs/crypt/encrypt';
import { derivePBKDF2Key } from '@tundralibs/crypt/generators';
import {
  defaultDecrypt,
  defaultEncrypt,
  keyFingerprint,
  stampKeyId,
  verifyKeyId,
} from './crypto.ts';

const SECRET = 'norm-cell-key-test-secret';

describe('norm.crypto instance cell key', () => {
  it('GCM writes a 2-part data:iv envelope that round-trips', async () => {
    const env = await defaultEncrypt('plain-value', SECRET, 'AES-256-GCM');
    asserts.assertEquals(env.split(':').length, 2); // no per-message salt
    asserts.assertEquals(
      await defaultDecrypt(env, SECRET, 'AES-256-GCM'),
      'plain-value',
    );
  });

  it('two encryptions of the same plaintext still differ (fresh IV)', async () => {
    const a = await defaultEncrypt('same', SECRET, 'AES-256-GCM');
    const b = await defaultEncrypt('same', SECRET, 'AES-256-GCM');
    asserts.assertEquals(a === b, false);
    asserts.assertEquals(
      await defaultDecrypt(a, SECRET, 'AES-256-GCM'),
      'same',
    );
    asserts.assertEquals(
      await defaultDecrypt(b, SECRET, 'AES-256-GCM'),
      'same',
    );
  });

  it('legacy 3-part per-message-salt cells still decrypt', async () => {
    // Exactly what the old defaultEncrypt produced: string-secret GCM.
    const legacy = await encryptAES('old-cell', SECRET, {
      mode: 'GCM',
      keyLength: 256,
    });
    asserts.assertEquals(legacy.split(':').length, 3);
    asserts.assertEquals(
      await defaultDecrypt(legacy, SECRET, 'AES-256-GCM'),
      'old-cell',
    );
  });

  it('CBC stays on the per-cell string path (4-part, MACed)', async () => {
    const env = await defaultEncrypt('cbc-cell', SECRET, 'AES-256-CBC');
    asserts.assertEquals(env.split(':').length, 4);
    asserts.assertEquals(
      await defaultDecrypt(env, SECRET, 'AES-256-CBC'),
      'cbc-cell',
    );
  });

  it('the derived key is deterministic across independent derivations', async () => {
    // Re-derive the cell key from scratch the way another process would
    // (same domain-separated salt recipe) and decrypt this process's
    // envelope with it — proves restarts read what earlier runs wrote.
    const env = await defaultEncrypt('cross-process', SECRET, 'AES-256-GCM');
    const salt = new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(
          `norm-cell-key\u0000${SECRET}`,
        ) as BufferSource,
      ),
    ).slice(0, 16);
    const freshKey = await derivePBKDF2Key(SECRET, salt, 'AES-GCM', 256);
    const { decryptAES } = await import('@tundralibs/crypt/encrypt');
    asserts.assertEquals(await decryptAES(env, freshKey), 'cross-process');
  });

  it('a wrong secret fails on both envelope generations', async () => {
    const fast = await defaultEncrypt('x', SECRET, 'AES-256-GCM');
    const legacy = await encryptAES('x', SECRET, { mode: 'GCM' });
    await asserts.assertRejects(() =>
      defaultDecrypt(fast, 'wrong-secret', 'AES-256-GCM')
    );
    await asserts.assertRejects(() =>
      defaultDecrypt(legacy, 'wrong-secret', 'AES-256-GCM')
    );
  });

  it('composes with the key-id stamp: k1.<fp>.<data:iv> round-trips', async () => {
    const enc = stampKeyId(defaultEncrypt);
    const dec = verifyKeyId(defaultDecrypt);
    const stamped = await enc('stamped-cell', SECRET, 'AES-256-GCM');
    const fp = await keyFingerprint(SECRET);
    asserts.assertEquals(stamped.startsWith(`k1.${fp}.`), true);
    asserts.assertEquals(
      stamped.slice(`k1.${fp}.`.length).split(':').length,
      2,
    );
    asserts.assertEquals(
      await dec(stamped, SECRET, 'AES-256-GCM'),
      'stamped-cell',
    );
    // A stamped LEGACY body (3-part) decrypts through the same wrapper.
    const legacyStamped = `k1.${fp}.${await encryptAES('old', SECRET, {
      mode: 'GCM',
    })}`;
    asserts.assertEquals(
      await dec(legacyStamped, SECRET, 'AES-256-GCM'),
      'old',
    );
  });
});
