import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { derivePBKDF2Key, hkdf, PBKDF2_ITERATIONS } from './derive.ts';

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

describe('crypt.generators.derive.derivePBKDF2Key', () => {
  it('pins the AES-derivation iteration count', () => {
    // The AES envelope does not record the count, so it cannot safely rise —
    // pin the floor so a future regression (e.g. someone halving it for
    // "speed") fails this test loudly.
    asserts.assert(
      PBKDF2_ITERATIONS >= 210_000,
      `PBKDF2_ITERATIONS (${PBKDF2_ITERATIONS}) below the AES-derivation floor`,
    );
    asserts.assertEquals(PBKDF2_ITERATIONS, 210_000);
  });

  it('is deterministic for same (secret, salt)', async () => {
    const secret = 'correct horse battery staple';
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const k1 = await derivePBKDF2Key(secret, salt, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key(secret, salt, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), true);
  });

  it('different salts produce different keys for same secret', async () => {
    const secret = 'same-secret';
    const saltA = crypto.getRandomValues(new Uint8Array(16));
    const saltB = crypto.getRandomValues(new Uint8Array(16));

    const k1 = await derivePBKDF2Key(secret, saltA, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key(secret, saltB, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), false);
  });

  it('different secrets produce different keys for same salt', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));

    const k1 = await derivePBKDF2Key('secret-A', salt, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key('secret-B', salt, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), false);
  });

  it('accepts every AES variant', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));
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
    const salt = crypto.getRandomValues(new Uint8Array(16));
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
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await derivePBKDF2Key('s', salt, 'AES-GCM', 256);

    asserts.assertEquals(key.extractable, false);
    await asserts.assertRejects(async () => {
      await crypto.subtle.exportKey('raw', key);
    });
  });

  it('handles empty and unicode secrets without throwing', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(16));

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
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const base = 'A'.repeat(32);

    const k1 = await derivePBKDF2Key(base, salt, 'AES-GCM', 256);
    const k2 = await derivePBKDF2Key(base + '-tail', salt, 'AES-GCM', 256);

    asserts.assertEquals(await sameCipherProbe(k1, k2), false);
  });
});

describe('crypt.generators.derive.hkdf', () => {
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
