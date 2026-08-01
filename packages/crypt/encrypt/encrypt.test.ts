import * as asserts from '@std/asserts';
import { encryptAES, encryptRSA } from './mod.ts';
import { describe, it } from '@tundralibs/compat/test';

describe('crypt.encrypt', () => {
  it('encryptAES - Basic Encryption', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    // Check that the encrypted data is a non-empty string
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    // Check the format of the encrypted data
    const encryptedParts = encrypted.split(':');
    asserts.assertEquals(encryptedParts.length, 3);
    asserts.assert(
      /^[0-9a-f]+$/.test(encryptedParts[0]!), // NOSONAR
      'First part should be hex',
    );
    asserts.assert(
      /^[0-9a-f]+$/.test(encryptedParts[1]!), // NOSONAR
      'Second part should be hex',
    );
    asserts.assert(
      /^[0-9a-f]+$/.test(encryptedParts[2]!), // NOSONAR
      'Salt part should be hex',
    );
  });

  it('encryptAES - Empty Input', async () => {
    const data = '';
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    // Should still produce valid encrypted format
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    const encryptedParts = encrypted.split(':');
    asserts.assertEquals(encryptedParts.length, 3);
  });

  it('encryptAES - Binary Input', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    // Check that the encrypted data is a non-empty string
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    // Check the format
    const encryptedParts = encrypted.split(':');
    asserts.assertEquals(encryptedParts.length, 3);
  });

  it('encryptAES - Different Key Lengths', async () => {
    const data = 'test data';
    const secret128 = 'abcdefghijklmnop'; // 16 bytes (128 bits)
    const secret192 = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
    const secret256 = 'abcdefghijklmnopqrstuvwxyz123456'; // 32 bytes (256 bits)

    const encrypted128 = await encryptAES(data, secret128, {
      mode: 'GCM',
      keyLength: 128,
    });
    const encrypted192 = await encryptAES(data, secret192, {
      mode: 'GCM',
      keyLength: 192,
    });
    const encrypted256 = await encryptAES(data, secret256, {
      mode: 'GCM',
      keyLength: 256,
    });

    // All should produce valid encrypted data
    asserts.assertEquals(typeof encrypted128, 'string');
    asserts.assertEquals(typeof encrypted192, 'string');
    asserts.assertEquals(typeof encrypted256, 'string');

    // All should be different (different IVs make this virtually certain)
    asserts.assertNotEquals(encrypted128, encrypted192);
    asserts.assertNotEquals(encrypted192, encrypted256);
    asserts.assertNotEquals(encrypted128, encrypted256);
  });

  it('encryptAES - Different Algorithms', async () => {
    const data = 'test data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encryptedGCM = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });
    const encryptedCBC = await encryptAES(data, secret, {
      mode: 'CBC',
      keyLength: 256,
    });
    const encryptedCTR = await encryptAES(data, secret, {
      mode: 'CTR',
      keyLength: 256,
    });

    // All should produce valid encrypted data
    asserts.assertEquals(typeof encryptedGCM, 'string');
    asserts.assertEquals(typeof encryptedCBC, 'string');
    asserts.assertEquals(typeof encryptedCTR, 'string');

    // All should be different
    asserts.assertNotEquals(encryptedGCM, encryptedCBC);
    asserts.assertNotEquals(encryptedCBC, encryptedCTR);
    asserts.assertNotEquals(encryptedGCM, encryptedCTR);
  });

  it('encryptAES - Consistency', async () => {
    const data = 'test consistency';
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Multiple encryptions should produce different results (due to random IV)
    const encrypted1 = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });
    const encrypted2 = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    asserts.assertNotEquals(encrypted1, encrypted2);

    // But format should be consistent
    asserts.assertEquals(encrypted1.split(':').length, 3);
    asserts.assertEquals(encrypted2.split(':').length, 3);
  });

  it('encryptAES - Long Data', async () => {
    const data = 'a'.repeat(10000); // 10KB of data
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);
    asserts.assertEquals(encrypted.split(':').length, 3);
  });

  it('encryptAES - Unicode Data', async () => {
    const data = '🔐 Unicode test with émojis and spëcial chars 中文';
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);
    asserts.assertEquals(encrypted.split(':').length, 3);
  });

  it('encryptAES - Error Handling', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Invalid encryption mode
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing invalid mode
        await encryptAES(data, secret, { mode: 'INVALID-MODE' });
      },
      Error,
      'Invalid AES encryption mode',
    );

    // Invalid key length
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing invalid key length
        await encryptAES(data, secret, { keyLength: 999 });
      },
      Error,
      'Invalid AES key length',
    );
  });

  it('encryptAES - All Valid Modes', async () => {
    const data = 'test all modes';
    const secret128 = 'abcdefghijklmnop';
    const secret192 = 'abcdefghijklmnopqrstuvwx';
    const secret256 = 'abcdefghijklmnopqrstuvwxyz123456';

    const modes: Array<
      { mode: 'GCM' | 'CBC' | 'CTR'; keyLength: 128 | 192 | 256 }
    > = [
      { mode: 'GCM', keyLength: 128 },
      { mode: 'GCM', keyLength: 192 },
      { mode: 'GCM', keyLength: 256 },
      { mode: 'CBC', keyLength: 128 },
      { mode: 'CBC', keyLength: 192 },
      { mode: 'CBC', keyLength: 256 },
      { mode: 'CTR', keyLength: 128 },
      { mode: 'CTR', keyLength: 192 },
      { mode: 'CTR', keyLength: 256 },
    ];

    for (const options of modes) {
      const secret = options.keyLength === 128
        ? secret128
        : options.keyLength === 192 //NOSONAR
        ? secret192
        : secret256;

      const encrypted = await encryptAES(data, secret, options);
      asserts.assertEquals(typeof encrypted, 'string');
      asserts.assertEquals(encrypted.length > 0, true);
      // GCM is data:iv:salt (3 parts); CBC/CTR add an encrypt-then-MAC part.
      asserts.assertEquals(
        encrypted.split(':').length,
        options.mode === 'GCM' ? 3 : 4,
      );
    }
  });

  it('encryptAES - GCM uses a 12-byte nonce; CBC/CTR keep 16 bytes', async () => {
    const data = 'nonce length check';
    const secret = 'abcdefghijklmnopqrstuvwx';

    // GCM: standard 96-bit nonce → 24 hex chars in the envelope's IV segment.
    const gcmIv = (await encryptAES(data, secret, { mode: 'GCM' })).split(
      ':',
    )[1]!;
    asserts.assertEquals(gcmIv.length, 12 * 2);

    // CBC: one full AES block → 32 hex chars.
    const cbcIv = (await encryptAES(data, secret, { mode: 'CBC' })).split(
      ':',
    )[1]!;
    asserts.assertEquals(cbcIv.length, 16 * 2);

    // CTR: 16-byte counter block → 32 hex chars.
    const ctrCounter = (await encryptAES(data, secret, { mode: 'CTR' })).split(
      ':',
    )[1]!;
    asserts.assertEquals(ctrCounter.length, 16 * 2);
  });

  // RSA Encryption Tests
  it('encryptRSA - Basic RSA-OAEP Encryption', async () => {
    // Generate a test RSA key pair
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );

    // Export and format public key as PEM
    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;

    const data = 'Hello, RSA World!';
    const encrypted = await encryptRSA(
      data,
      publicKeyPEM,
    );

    // Check that the encrypted data is a base64 string
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    // Should be valid base64
    asserts.assertExists(atob(encrypted));
  });

  it('encryptRSA - Different Key Sizes', async () => {
    const data = 'Test data';

    // Test different key sizes
    for (const keySize of [2048, 3072, 4096] as const) {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: keySize,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt'],
      );

      const publicKeyRaw = await crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey,
      );
      const publicKeyBase64 = btoa(
        String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
      );
      const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
        publicKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PUBLIC KEY-----`;

      const encrypted = await encryptRSA(
        data,
        publicKeyPEM,
      );
      asserts.assertEquals(typeof encrypted, 'string');
      asserts.assertEquals(encrypted.length > 0, true);
    }
  });

  it('encryptRSA - Different Hash Algorithms', async () => {
    const data = 'Test data';

    // Test different hash algorithms
    for (const hash of ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512']) {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: hash === 'SHA-1' ? 'SHA-1' : hash,
        },
        true,
        ['encrypt', 'decrypt'],
      );

      const publicKeyRaw = await crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey,
      );
      const publicKeyBase64 = btoa(
        String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
      );
      const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
        publicKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PUBLIC KEY-----`;

      const encrypted = await encryptRSA(
        data,
        publicKeyPEM,
        // @ts-expect-error Testing different hash algorithms
        { hashAlgorithm: hash },
      );
      asserts.assertEquals(typeof encrypted, 'string');
      asserts.assertEquals(encrypted.length > 0, true);
    }
  });

  it('encryptRSA - Data Size Limits', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;

    // Test maximum allowed data size (should work)
    const maxSize = 256 - 2 * 32 - 2; // 2048-bit key with SHA-256: 256 - 2*32 - 2 = 190 bytes
    const maxData = 'a'.repeat(maxSize);
    const encrypted = await encryptRSA(
      maxData,
      publicKeyPEM,
    );
    asserts.assertEquals(typeof encrypted, 'string');

    // Test data that's too large (should fail)
    const oversizedData = 'a'.repeat(maxSize + 1);
    await asserts.assertRejects(
      async () => {
        await encryptRSA(oversizedData, publicKeyPEM);
      },
      Error,
      'Data too large for RSA key',
    );
  });

  it('encryptRSA - Error Handling', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;

    const data = 'test data';

    // Invalid hash algorithm
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error Testing invalid hash algorithm
        await encryptRSA(data, publicKeyPEM, { hashAlgorithm: 'MD5' });
      },
      Error,
      'Invalid hash algorithm',
    );

    // Invalid PEM key
    await asserts.assertRejects(
      async () => {
        await encryptRSA(data, 'invalid-pem-key');
      },
      Error,
      'Invalid PEM public key format',
    );
  });

  it('encryptRSA - Binary Data', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;

    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 127]);
    const encrypted = await encryptRSA(
      binaryData,
      publicKeyPEM,
    );

    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);
  });

  it('encryptRSA - Data Size Limits with Different Hash Algorithms', async () => {
    // Max data size is derived from the imported key's actual modulus (no
    // size option exists) — cover several modulus + hash combinations.
    const testCases: Array<{
      modulusLength: 2048 | 3072 | 4096;
      hash: 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';
      maxSize: number;
    }> = [
      { modulusLength: 2048, hash: 'SHA-1', maxSize: 214 }, // 256 - 2*20 - 2
      { modulusLength: 2048, hash: 'SHA-256', maxSize: 190 }, // 256 - 2*32 - 2
      { modulusLength: 2048, hash: 'SHA-384', maxSize: 158 }, // 256 - 2*48 - 2
      { modulusLength: 2048, hash: 'SHA-512', maxSize: 126 }, // 256 - 2*64 - 2
      { modulusLength: 4096, hash: 'SHA-256', maxSize: 446 }, // 512 - 2*32 - 2
    ];

    for (const testCase of testCases) {
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: testCase.modulusLength,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: testCase.hash,
        },
        true,
        ['encrypt', 'decrypt'],
      );

      const publicKeyRaw = await crypto.subtle.exportKey(
        'spki',
        keyPair.publicKey,
      );
      const publicKeyBase64 = btoa(
        String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
      );
      const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
        publicKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PUBLIC KEY-----`;

      // Test data at exact max size (should work)
      const maxData = 'a'.repeat(testCase.maxSize);
      const encrypted = await encryptRSA(
        maxData,
        publicKeyPEM,
        { hashAlgorithm: testCase.hash },
      );
      asserts.assertEquals(typeof encrypted, 'string');

      // Test data over max size (should fail)
      const oversizedData = 'a'.repeat(testCase.maxSize + 1);
      await asserts.assertRejects(
        async () => {
          await encryptRSA(
            oversizedData,
            publicKeyPEM,
            { hashAlgorithm: testCase.hash },
          );
        },
        Error,
        `Data too large for RSA key. Maximum size: ${testCase.maxSize} bytes`,
      );
    }
  });

  it('encryptRSA - Size limit follows the actual key, not an option', async () => {
    // Review regression: the guard used to be computed from a keySize OPTION
    // (default 2048), so a 4096-bit key encrypting >190 bytes with no options
    // was spuriously rejected. The limit must come from the imported key.
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 4096,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;

    // 200 bytes > the old hardcoded 2048-bit limit (190) but well within the
    // 4096-bit OAEP-SHA-256 capacity (446). No options passed on purpose.
    const data = 'x'.repeat(200);
    const encrypted = await encryptRSA(data, publicKeyPEM);
    asserts.assertEquals(typeof encrypted, 'string');

    // Round-trip through the matching private key proves the ciphertext is
    // real, not just that the guard was skipped.
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
    const { decryptRSA } = await import('./mod.ts');
    asserts.assertEquals(await decryptRSA(encrypted, privateKeyPEM), data);
  });

  it('encryptRSA - PEM Format Variations', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );

    const data = 'Test PEM format variations';

    // Standard 64-character line breaks
    const standardPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const enc1 = await encryptRSA(data, standardPEM);
    asserts.assertEquals(typeof enc1, 'string');

    // No line breaks (single line)
    const singleLinePEM =
      `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;
    const enc2 = await encryptRSA(data, singleLinePEM);
    asserts.assertEquals(typeof enc2, 'string');

    // Extra whitespace and indentation
    const spacedPEM = `-----BEGIN PUBLIC KEY-----
    ${publicKeyBase64.match(/.{1,64}/g)?.join('\n    ')}
    -----END PUBLIC KEY-----`;
    const enc3 = await encryptRSA(data, spacedPEM);
    asserts.assertEquals(typeof enc3, 'string');

    // Different line lengths
    const irregularPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,80}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const enc4 = await encryptRSA(data, irregularPEM);
    asserts.assertEquals(typeof enc4, 'string');

    // Mixed spacing
    const mixedPEM =
      `  -----BEGIN PUBLIC KEY-----  \n  ${publicKeyBase64}  \n  -----END PUBLIC KEY-----  `;
    const enc5 = await encryptRSA(data, mixedPEM);
    asserts.assertEquals(typeof enc5, 'string');
  });

  it('encryptRSA - Base64 Output Consistency', async () => {
    // This test addresses the issue where encrypted values might not decrypt
    // when copied as literals vs used as variables
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;

    const data = 'Test consistency';
    const encrypted1 = await encryptRSA(data, publicKeyPEM);

    // Verify that the encrypted output is valid base64
    asserts.assertEquals(/^[A-Za-z0-9+/]+=*$/.test(encrypted1), true);

    // Verify it contains typical base64 characters
    // These must be preserved when copying as literals
    const hasBase64Chars = encrypted1.includes('+') ||
      encrypted1.includes('/') ||
      encrypted1.includes('=');
    asserts.assertEquals(hasBase64Chars, true);

    // Verify no newlines or whitespace (would break literal strings)
    asserts.assertEquals(encrypted1.includes('\n'), false);
    asserts.assertEquals(encrypted1.includes('\r'), false);
    asserts.assertEquals(encrypted1.includes(' '), false);
    asserts.assertEquals(encrypted1.includes('\t'), false);

    // Test that the same input produces different outputs (due to random padding)
    const encrypted2 = await encryptRSA(data, publicKeyPEM);
    asserts.assertNotEquals(encrypted1, encrypted2);

    // But both should be valid base64 strings
    asserts.assertEquals(/^[A-Za-z0-9+/]+=*$/.test(encrypted2), true);
  });
});
