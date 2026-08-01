import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import {
  derivePBKDF2Key,
  hkdf,
  pbkdf2,
  PBKDF2_ITERATIONS,
  pbkdf2Hash,
  pbkdf2Verify,
  SALT_BYTES,
} from './kdf.ts';

// Derived CryptoKeys are non-extractable, so equality is tested by encrypting
// a fixed plaintext + IV with both keys and comparing ciphertexts.
const sameCipherProbe = async (
  k1: CryptoKey,
  k2: CryptoKey,
): Promise<boolean> => {
  const iv = new Uint8Array(12); // fixed zero IV — fine for a one-shot equality probe
  const data = new TextEncoder().encode('probe');
  const c1 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k1, data);
  const c2 = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k2, data);
  const a = new Uint8Array(c1);
  const b = new Uint8Array(c2);
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

describe('crypt.encrypt.kdf', () => {
  it('exposes hardened PBKDF2 parameters', () => {
    // Pin OWASP-guided iteration floor and salt size so a future regression
    // (e.g. someone halving iterations for "speed") fails this test loudly.
    asserts.assert(
      PBKDF2_ITERATIONS >= 210_000,
      `PBKDF2_ITERATIONS (${PBKDF2_ITERATIONS}) below OWASP SHA-256 guidance`,
    );
    asserts.assert(
      SALT_BYTES >= 16,
      `SALT_BYTES (${SALT_BYTES}) below 128-bit floor`,
    );
  });

  it('is deterministic for same (secret, salt)', async () => {
    const secret = 'correct horse battery staple';
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    const k1 = await derivePBKDF2Key(secret, salt, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key(secret, salt, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), true);
  });

  it('different salts produce different keys for same secret', async () => {
    const secret = 'same-secret';
    const saltA = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const saltB = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    const k1 = await derivePBKDF2Key(secret, saltA, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key(secret, saltB, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), false);
  });

  it('different secrets produce different keys for same salt', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    const k1 = await derivePBKDF2Key('secret-A', salt, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key('secret-B', salt, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), false);
  });

  it('accepts every AES variant', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const algos: Array<'AES-GCM' | 'AES-CBC' | 'AES-CTR'> = [
      'AES-GCM',
      'AES-CBC',
      'AES-CTR',
    ];
    const lengths: Array<128 | 192 | 256> = [128, 192, 256];

    for (const algo of algos) {
      for (const len of lengths) {
        const key = await derivePBKDF2Key('s', salt, algo, len);
        asserts.assertEquals(key.algorithm.name, algo);
        // length sits on AesKeyAlgorithm subtype
        asserts.assertEquals(
          (key.algorithm as AesKeyAlgorithm).length,
          len,
        );
      }
    }
  });

  it('binds the key to its algorithm (cannot cross-use)', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const gcmKey = await derivePBKDF2Key('s', salt, 'AES-GCM', 256);

    // Using a GCM-bound key with AES-CBC must reject.
    await asserts.assertRejects(async () => {
      await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv: new Uint8Array(16) },
        gcmKey,
        new Uint8Array(16),
      );
    });
  });

  it('produces non-extractable keys', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const key = await derivePBKDF2Key('s', salt, 'AES-GCM', 256);

    asserts.assertEquals(key.extractable, false);
    await asserts.assertRejects(async () => {
      await crypto.subtle.exportKey('raw', key);
    });
  });

  it('handles empty and unicode secrets without throwing', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));

    // Empty secret is degenerate but Web Crypto accepts it — make sure
    // the helper doesn't pre-reject it (callers' responsibility to require
    // a non-trivial secret).
    const emptyKey = await derivePBKDF2Key('', salt, 'AES-GCM', 256);
    asserts.assertEquals(emptyKey.algorithm.name, 'AES-GCM');

    const unicode = 'pässwörd-🔐-中文';
    const uniKey = await derivePBKDF2Key(unicode, salt, 'AES-GCM', 256);
    asserts.assertEquals(uniKey.algorithm.name, 'AES-GCM');

    // Different secrets must still produce different keys.
    asserts.assertEquals(await sameCipherProbe(emptyKey, uniKey), false);
  });

  it('long secret does not collapse onto its truncation', async () => {
    // Old zero-pad scheme would have truncated to keyLength bytes, so
    // "AAAA...32x" and "AAAA...32x + suffix" yielded the same key. PBKDF2
    // must spread the whole secret through the digest.
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const base = 'A'.repeat(32);

    const k1 = await derivePBKDF2Key(base, salt, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key(base + '-tail', salt, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), false);
  });
});

describe('crypt.encrypt.kdf.pbkdf2 (password hashing)', () => {
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

  it('defaults to the OWASP iteration count', async () => {
    asserts.assertEquals(PBKDF2_ITERATIONS, 210_000);
    const stored = await pbkdf2Hash('pw'); // no iterations override
    asserts.assertEquals(stored.startsWith(`pbkdf2-sha256$${210_000}$`), true);
  });
});

describe('crypt.kdf.hkdf', () => {
  const hex = (h: string): Uint8Array =>
    new Uint8Array((h.match(/../g) ?? []).map((x) => parseInt(x, 16)));
  const toHex = (b: Uint8Array): string =>
    Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

  it('matches RFC 5869 Test Case 1 (SHA-256, salt + info, L=42)', async () => {
    const ikm = new Uint8Array(22).fill(0x0b);
    const salt = hex('000102030405060708090a0b0c');
    const info = hex('f0f1f2f3f4f5f6f7f8f9');
    const okm = await hkdf(ikm, { salt, info, length: 42, hash: 'SHA-256' });
    asserts.assertEquals(
      toHex(okm),
      '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865',
    );
  });

  it('is deterministic; different info yields independent keys', async () => {
    const secret = 'a-high-entropy-shared-secret-value-for-hkdf';
    const a1 = toHex(await hkdf(secret, { info: 'jwt' }));
    const a2 = toHex(await hkdf(secret, { info: 'jwt' }));
    const b = toHex(await hkdf(secret, { info: 'hmac' }));
    asserts.assertEquals(a1, a2); // deterministic
    asserts.assertNotEquals(a1, b); // domain separation
    asserts.assertEquals(a1.length, 64); // default 32 bytes → 64 hex
  });

  it('salt, length, and hash options change the output', async () => {
    const s = 'secret';
    asserts.assertNotEquals(
      toHex(await hkdf(s, { info: 'x', salt: 'salt-a' })),
      toHex(await hkdf(s, { info: 'x', salt: 'salt-b' })),
    );
    asserts.assertEquals((await hkdf(s, { info: 'x', length: 16 })).length, 16);
    asserts.assertNotEquals(
      toHex(await hkdf(s, { info: 'x', hash: 'SHA-256' })),
      toHex(await hkdf(s, { info: 'x', hash: 'SHA-512' })),
    );
  });

  it('rejects an out-of-range length', async () => {
    await asserts.assertRejects(() => hkdf('s', { length: 0 }), RangeError);
    await asserts.assertRejects(
      () => hkdf('s', { length: 255 * 32 + 1 }),
      RangeError,
    );
  });
});
