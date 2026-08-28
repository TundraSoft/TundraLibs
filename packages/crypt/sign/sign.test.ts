import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { signEC, signHMAC, signRSA } from './mod.ts';

describe('crypt.sign', () => {
  const secret = 'abcdefghijklmnopqrstuvwx';
  const data = 'my data';

  it('signHMAC - SHA-1', async () => {
    const signature = await signHMAC(data, secret, { hashAlgorithm: 'SHA-1' });
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 40); // SHA-1 produces 160 bits = 20 bytes = 40 hex chars
    // Verify against a known test vector
    asserts.assertEquals(
      signature,
      'cd02551761ed331daf90a78386a9613f19b55604',
    );
  });

  it('signHMAC - SHA-256', async () => {
    const signature = await signHMAC(data, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64); // SHA-256 produces 256 bits = 32 bytes = 64 hex chars
    // Verify against a known test vector
    asserts.assertEquals(
      signature,
      '5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5',
    );
  });

  it('signHMAC - SHA-384', async () => {
    const signature = await signHMAC(data, secret, {
      hashAlgorithm: 'SHA-384',
    });
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 96); // SHA-384 produces 384 bits = 48 bytes = 96 hex chars
    asserts.assert(
      /^[0-9a-f]{96}$/.test(signature),
      'Should be valid hex string',
    );
  });

  it('signHMAC - SHA-512', async () => {
    const signature = await signHMAC(data, secret, {
      hashAlgorithm: 'SHA-512',
    });
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 128); // SHA-512 produces 512 bits = 64 bytes = 128 hex chars
    asserts.assert(
      /^[0-9a-f]{128}$/.test(signature),
      'Should be valid hex string',
    );
  });

  it('signHMAC - Binary Data', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await signHMAC(binaryData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  it('signHMAC - Empty Data', async () => {
    const emptyData = '';
    const signature = await signHMAC(emptyData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  it('signHMAC - Long Data', async () => {
    const longData = 'a'.repeat(10000);
    const signature = await signHMAC(longData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  it('signHMAC - Unicode Data', async () => {
    const unicodeData = '🔐 Hello 世界 🌍';
    const signature = await signHMAC(unicodeData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  it('signHMAC - Different Secrets', async () => {
    const secret1 = 'secret1';
    const secret2 = 'secret2';

    const signature1 = await signHMAC(data, secret1);
    const signature2 = await signHMAC(data, secret2);

    asserts.assertNotEquals(signature1, signature2);
  });

  it('signHMAC - Consistency', async () => {
    // Same input should produce same output
    const signature1 = await signHMAC(data, secret);
    const signature2 = await signHMAC(data, secret);

    asserts.assertEquals(signature1, signature2);
  });

  it('signHMAC - All Algorithms', async () => {
    const algorithms: Array<'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'> = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    for (const algo of algorithms) {
      const signature = await signHMAC(data, secret, { hashAlgorithm: algo });
      asserts.assertEquals(typeof signature, 'string');
      asserts.assertEquals(signature.length > 0, true);
      asserts.assert(/^[0-9a-f]+$/.test(signature), 'Should be hex string');
    }
  });

  it('signHMAC - Error Handling', async () => {
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error invalid algorithm
        await signHMAC(data, secret, { hashAlgorithm: 'INVALID' });
      },
      Error,
      'Invalid hash algorithm',
    );
  });

  // RSA Signing Tests
  it('signRSA - Basic RSA-PSS Signing', async () => {
    // Generate a test RSA key pair for signing
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    // Export and format private key as PEM
    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const testData = 'Document to be signed';
    const signature = await signRSA(
      testData,
      privateKeyPEM,
    );

    // Check that the signature is a base64 string
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length > 0, true);

    // Should be valid base64
    asserts.assertExists(atob(signature));
  });

  it('signRSA - Different Key Sizes', async () => {
    const testData = 'Test signing with different key sizes';

    for (const keySize of [2048, 3072, 4096] as const) {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-PSS',
          modulusLength: keySize,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['sign', 'verify'],
      );

      const privateKeyRaw = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey,
      );
      const privateKeyBase64 = btoa(
        String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
      );
      const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
        privateKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PRIVATE KEY-----`;

      const signature = await signRSA(
        testData,
        privateKeyPEM,
      );
      asserts.assertEquals(typeof signature, 'string');
      asserts.assertEquals(signature.length > 0, true);
    }
  });

  it('signRSA - Different Hash Algorithms', async () => {
    const testData = 'Test signing with different hash algorithms';

    for (const hash of ['SHA-256', 'SHA-384', 'SHA-512']) {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-PSS',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: hash,
        },
        true,
        ['sign', 'verify'],
      );

      const privateKeyRaw = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey,
      );
      const privateKeyBase64 = btoa(
        String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
      );
      const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
        privateKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PRIVATE KEY-----`;

      const signature = await signRSA(
        testData,
        privateKeyPEM,
        // @ts-expect-error hash type
        { hashAlgorithm: hash },
      );
      asserts.assertEquals(typeof signature, 'string');
      asserts.assertEquals(signature.length > 0, true);
    }
  });

  it('signRSA - Binary Data', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 127]);
    const signature = await signRSA(
      binaryData,
      privateKeyPEM,
    );

    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length > 0, true);
  });

  it('signRSA - Error Handling', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const testData = 'test data';

    // Invalid hash algorithm
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error invalid hash algorithm
        await signRSA(testData, privateKeyPEM, { hashAlgorithm: 'MD5' });
      },
      Error,
      'Invalid hash algorithm',
    );

    // Invalid PEM key
    await asserts.assertRejects(
      async () => {
        await signRSA(testData, 'invalid-pem-key');
      },
      Error,
      'Invalid PEM private key format',
    );
  });
  it('signRSA - PEM Format Variations', async () => {
    // Test that different PEM formatting styles all work correctly
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );

    const data = 'Test data for PEM variations';

    // Standard 64-character line breaks
    const standardPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;
    const sig1 = await signRSA(data, standardPEM);
    asserts.assertEquals(typeof sig1, 'string');

    // No line breaks
    const singleLinePEM =
      `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`;
    const sig2 = await signRSA(data, singleLinePEM);
    asserts.assertEquals(typeof sig2, 'string');

    // Extra whitespace
    const spacedPEM = `-----BEGIN PRIVATE KEY-----
    ${privateKeyBase64.match(/.{1,64}/g)?.join('\n    ')}
    -----END PRIVATE KEY-----`;
    const sig3 = await signRSA(data, spacedPEM);
    asserts.assertEquals(typeof sig3, 'string');

    // Different line lengths
    const irregularPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,80}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;
    const sig4 = await signRSA(data, irregularPEM);
    asserts.assertEquals(typeof sig4, 'string');
  });

  it('signRSA - Signature Output Consistency', async () => {
    // Verify that signatures have consistent format (base64)
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );

    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const data = 'Test consistency';
    const signature = await signRSA(data, privateKeyPEM);

    // Verify base64 format
    asserts.assertEquals(/^[A-Za-z0-9+/]+=*$/.test(signature), true);

    // No whitespace
    asserts.assertEquals(signature.includes('\n'), false);
    asserts.assertEquals(signature.includes(' '), false);

    // Each signature should be different due to PSS randomness
    const signature2 = await signRSA(data, privateKeyPEM);
    asserts.assertNotEquals(signature, signature2);
  });

  it('signEC - emits fixed-width R‖S for every curve', async () => {
    const { decodeBase64 } = await import('@std/encoding');
    const { generateECKeyPair } = await import('../generators/key.ts');

    // RFC 7515 §3.4 fixes the width at twice the curve's field size, rounded
    // up to whole octets. P-521 is the one that catches people out: 2 × 66 =
    // 132 bytes, not the 128 a "P-512" would give.
    for (
      const [curve, bytes] of [
        ['P-256', 64],
        ['P-384', 96],
        ['P-521', 132],
      ] as const
    ) {
      const keys = await generateECKeyPair({
        algorithm: 'ECDSA',
        curve,
        format: 'PEM',
        extractable: true,
      });
      const signature = await signEC(
        'my data',
        keys.privateKeyExported as string,
      );
      const raw = decodeBase64(signature);
      // The exact width is the whole guarantee: a DER-encoded signature for
      // any of these curves is a different length, so this single assertion
      // rules out the wrong encoding as well as a truncated one.
      //
      // Deliberately NOT asserted here: that the first byte isn't the DER
      // SEQUENCE tag 0x30. R‖S begins with the high byte of `r`, which is
      // random, so such a check fails ~1 run in 256 per curve. The
      // *deterministic* proof that DER is rejected lives in verify.test.ts,
      // which re-encodes a real signature as DER and checks it does not
      // verify.
      asserts.assertEquals(
        raw.length,
        bytes,
        `${curve} must produce ${bytes} bytes of R‖S`,
      );
    }
  });

  it('signEC - output verifies under raw Web Crypto (JOSE interop)', async () => {
    // Cross-checked against the platform primitive rather than against this
    // package's own verifyEC, so a shared encoding mistake cannot hide: Web
    // Crypto's ECDSA accepts R‖S and nothing else.
    const { decodeBase64 } = await import('@std/encoding');
    const { generateECKeyPair } = await import('../generators/key.ts');
    const keys = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      extractable: true,
    });
    const data = 'interop matters';
    const signature = await signEC(data, keys.privateKey);

    asserts.assert(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.publicKey,
        decodeBase64(signature) as BufferSource,
        new TextEncoder().encode(data) as BufferSource,
      ),
      'signEC output must verify under raw Web Crypto',
    );
  });

  it('signEC - accepts PEM (PKCS#8 and SEC1), CryptoKey and JWK', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const keys = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'JWK',
      extractable: true,
    });
    const pem = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });

    // SEC1 (`openssl ecparam -genkey`), which Web Crypto cannot import
    // directly — it is rewrapped as PKCS#8 first.
    const sec1 = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIDogV1jG+c/EcX+YpB53qf6aD9TpKQLoqckCIW+93D6AoAoGCCqGSM49
AwEHoUQDQgAE3EwCtZAAytyIxtIpxbUTW1/KTNceXfXaITN6c0ZabGlOoh0FdFpn
ds7wUkca5iyvROqi80JD5gikerIbHaPpDQ==
-----END EC PRIVATE KEY-----`;

    for (
      const key of [
        pem.privateKeyExported as string,
        sec1,
        keys.privateKey,
        keys.privateKeyExported as JsonWebKey,
      ]
    ) {
      const signature = await signEC('data', key);
      asserts.assertEquals(typeof signature, 'string');
      asserts.assert(signature.length > 0);
    }
  });

  it('signEC - SECURITY: refuses non-EC keys and the wrong curve', async () => {
    const { generateECKeyPair, generateRSAKeyPair } = await import(
      '../generators/key.ts'
    );
    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const p384 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-384',
      format: 'PEM',
      extractable: true,
    });

    await asserts.assertRejects(
      () => signEC('data', rsa.privateKeyExported as string),
      Error,
      'ECDSA needs an EC key',
    );
    await asserts.assertRejects(
      () => signEC('data', 'a-raw-hmac-secret'),
      Error,
      'ECDSA needs an EC key',
    );
    // Pinning P-256 against a P-384 key must fail rather than quietly sign on
    // whichever curve the key happens to use.
    await asserts.assertRejects(
      () =>
        signEC('data', p384.privateKeyExported as string, { curve: 'P-256' }),
      Error,
      "EC key is on curve 'P-384' but this operation needs 'P-256'",
    );
  });

  it("signEC - defaults the hash to the curve's RFC 7518 pairing", async () => {
    const { decodeBase64 } = await import('@std/encoding');
    const { generateECKeyPair } = await import('../generators/key.ts');
    const keys = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-384',
      extractable: true,
    });
    const data = 'pairing check';
    const signature = await signEC(data, keys.privateKey);

    // P-384 pairs with SHA-384; verifying under that hash must succeed and
    // under SHA-256 must not.
    asserts.assert(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-384' },
        keys.publicKey,
        decodeBase64(signature) as BufferSource,
        new TextEncoder().encode(data) as BufferSource,
      ),
    );
    asserts.assertEquals(
      await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        keys.publicKey,
        decodeBase64(signature) as BufferSource,
        new TextEncoder().encode(data) as BufferSource,
      ),
      false,
    );
  });
});
