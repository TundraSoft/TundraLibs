import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  pbkdf2,
  PBKDF2_PASSWORD_ITERATIONS,
  pbkdf2Hash,
  pbkdf2Verify,
  SALT_BYTES,
} from './pbkdf2.ts';

describe('crypt.digest.pbkdf2 (password hashing)', () => {
  it('exposes hardened PBKDF2 parameters', () => {
    // Pin the floors so a future regression (e.g. someone halving iterations
    // for "speed") fails this test loudly. Password STORAGE is digest-aware
    // and tracks current OWASP guidance: SHA-256 = 600k, SHA-384/512 = 210k.
    asserts.assert(
      PBKDF2_PASSWORD_ITERATIONS['SHA-256'] >= 600_000,
      `SHA-256 password iterations (${
        PBKDF2_PASSWORD_ITERATIONS['SHA-256']
      }) below OWASP guidance (600k)`,
    );
    asserts.assert(PBKDF2_PASSWORD_ITERATIONS['SHA-384'] >= 210_000);
    asserts.assert(PBKDF2_PASSWORD_ITERATIONS['SHA-512'] >= 210_000);
    asserts.assert(
      SALT_BYTES >= 16,
      `SALT_BYTES (${SALT_BYTES}) below 128-bit floor`,
    );
  });

  it('derives deterministic bytes usable as AES key material', async () => {
    const salt = new Uint8Array(16).fill(7);
    const a = await pbkdf2('secret', salt, 1000, 256);
    const b = await pbkdf2('secret', salt, 1000, 256);
    asserts.assertEquals(a.length, 32); // 256 bits — an AES-256 key
    asserts.assertEquals([...a], [...b]); // deterministic
    const c = await pbkdf2('other', salt, 1000, 256);
    asserts.assertEquals([...a].join() === [...c].join(), false);
  });

  it('hash → verify round-trips (default SHA-256)', async () => {
    const stored = await pbkdf2Hash('hunter2', { iterations: 1000 });
    asserts.assertEquals(stored.startsWith('pbkdf2-sha256$1000$'), true);
    asserts.assertEquals(await pbkdf2Verify('hunter2', stored), true);
    asserts.assertEquals(await pbkdf2Verify('Hunter2', stored), false);
  });

  it('is salted — two hashes of the same password differ', async () => {
    const a = await pbkdf2Hash('same', { iterations: 500 });
    const b = await pbkdf2Hash('same', { iterations: 500 });
    asserts.assertEquals(a === b, false); // random per-hash salt
    asserts.assertEquals(await pbkdf2Verify('same', a), true);
    asserts.assertEquals(await pbkdf2Verify('same', b), true);
  });

  it('SHA-384 / SHA-512 variants verify', async () => {
    const s384 = await pbkdf2Hash('pw', { iterations: 500, hash: 'SHA-384' });
    asserts.assertEquals(s384.startsWith('pbkdf2-sha384$'), true);
    asserts.assertEquals(await pbkdf2Verify('pw', s384), true);
    const s512 = await pbkdf2Hash('pw', { iterations: 500, hash: 'SHA-512' });
    asserts.assertEquals(await pbkdf2Verify('pw', s512), true);
  });

  it('verify returns false (never throws) on malformed input', async () => {
    asserts.assertEquals(await pbkdf2Verify('x', 'not-a-hash'), false);
    asserts.assertEquals(await pbkdf2Verify('x', 'pbkdf2-md5$1$aa$bb'), false);
    asserts.assertEquals(await pbkdf2Verify('x', ''), false);
    // Odd-length hex passes the regex but is not decodable — decodeHex throws
    // RangeError, which must be swallowed into `false`, not propagate.
    asserts.assertEquals(
      await pbkdf2Verify('x', 'pbkdf2-sha256$1000$abc$abcd'),
      false,
    );
    asserts.assertEquals(
      await pbkdf2Verify('x', 'pbkdf2-sha256$1000$abcd$abc'),
      false,
    );
  });

  it('defaults to the digest-aware iteration count (SHA-256 → 600k)', async () => {
    // No opts → the count is chosen from the (default SHA-256) digest and
    // recorded in the string.
    const s256 = await pbkdf2Hash('pw');
    asserts.assertEquals(s256.startsWith('pbkdf2-sha256$600000$'), true);
    asserts.assertEquals(await pbkdf2Verify('pw', s256), true);
    const s512 = await pbkdf2Hash('pw', { hash: 'SHA-512' });
    asserts.assertEquals(s512.startsWith('pbkdf2-sha512$210000$'), true);
  });

  it('verifies a hash written under an older, lower count (raising is safe)', async () => {
    // The count is read from the stored string, not the current default, so a
    // hash minted at 210k still verifies after the default rose to 600k.
    const legacy = await pbkdf2Hash('pw', { iterations: 210_000 });
    asserts.assertEquals(legacy.startsWith('pbkdf2-sha256$210000$'), true);
    asserts.assertEquals(await pbkdf2Verify('pw', legacy), true);
  });

  it('verify returns false on a zero iteration count (no OperationError leak)', async () => {
    // The regex accepts `\d+`, so "0" parses; Web Crypto then rejects
    // `iterations: 0` with a DOMException. That must be swallowed into `false`
    // to honour the documented never-throws contract, not propagate out.
    asserts.assertEquals(
      await pbkdf2Verify('x', 'pbkdf2-sha256$0$abcd$abcd'),
      false,
    );
    // A genuine hash still round-trips correctly alongside the guard.
    const stored = await pbkdf2Hash('hunter2', { iterations: 1000 });
    asserts.assertEquals(await pbkdf2Verify('hunter2', stored), true);
    asserts.assertEquals(await pbkdf2Verify('wrong', stored), false);
  });

  it('pins the OWASP SHA-256 password count', () => {
    // Password storage defaults to the OWASP SHA-256 count (600k), asserted
    // end-to-end in the digest-aware default test above.
    asserts.assertEquals(PBKDF2_PASSWORD_ITERATIONS['SHA-256'], 600_000);
  });
});
