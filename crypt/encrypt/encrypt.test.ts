import * as asserts from '$asserts';
import { encryptAES, type EncryptionModes, encryptRSA } from './mod.ts';

Deno.test('crypt.encrypt', async (t) => {
  await t.step('encryptAES - Basic Encryption', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);

    // Check that the encrypted data is a non-empty string
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    // Check the format of the encrypted data
    const encryptedParts = encrypted.split(':');
    asserts.assertEquals(encryptedParts.length, 2);
    asserts.assert(
      /^[0-9a-f]+$/.test(encryptedParts[0]!), // NOSONAR
      'First part should be hex',
    );
    asserts.assert(
      /^[0-9a-f]+$/.test(encryptedParts[1]!), // NOSONAR
      'Second part should be hex',
    );
  });

  await t.step('encryptAES - Empty Input', async () => {
    const data = '';
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);

    // Should still produce valid encrypted format
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    const encryptedParts = encrypted.split(':');
    asserts.assertEquals(encryptedParts.length, 2);
  });

  await t.step('encryptAES - Binary Input', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);

    // Check that the encrypted data is a non-empty string
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    // Check the format
    const encryptedParts = encrypted.split(':');
    asserts.assertEquals(encryptedParts.length, 2);
  });

  await t.step('encryptAES - Different Key Lengths', async () => {
    const data = 'test data';
    const secret128 = 'abcdefghijklmnop'; // 16 bytes (128 bits)
    const secret192 = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
    const secret256 = 'abcdefghijklmnopqrstuvwxyz123456'; // 32 bytes (256 bits)

    const encrypted128 = await encryptAES('AES-GCM:128', secret128, data);
    const encrypted192 = await encryptAES('AES-GCM:192', secret192, data);
    const encrypted256 = await encryptAES('AES-GCM:256', secret256, data);

    // All should produce valid encrypted data
    asserts.assertEquals(typeof encrypted128, 'string');
    asserts.assertEquals(typeof encrypted192, 'string');
    asserts.assertEquals(typeof encrypted256, 'string');

    // All should be different (different IVs make this virtually certain)
    asserts.assertNotEquals(encrypted128, encrypted192);
    asserts.assertNotEquals(encrypted192, encrypted256);
    asserts.assertNotEquals(encrypted128, encrypted256);
  });

  await t.step('encryptAES - Different Algorithms', async () => {
    const data = 'test data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encryptedGCM = await encryptAES('AES-GCM:256', secret, data);
    const encryptedCBC = await encryptAES('AES-CBC:256', secret, data);
    const encryptedCTR = await encryptAES('AES-CTR:256', secret, data);

    // All should produce valid encrypted data
    asserts.assertEquals(typeof encryptedGCM, 'string');
    asserts.assertEquals(typeof encryptedCBC, 'string');
    asserts.assertEquals(typeof encryptedCTR, 'string');

    // All should be different
    asserts.assertNotEquals(encryptedGCM, encryptedCBC);
    asserts.assertNotEquals(encryptedCBC, encryptedCTR);
    asserts.assertNotEquals(encryptedGCM, encryptedCTR);
  });

  await t.step('encryptAES - Consistency', async () => {
    const data = 'test consistency';
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    // Multiple encryptions should produce different results (due to random IV)
    const encrypted1 = await encryptAES(mode, secret, data);
    const encrypted2 = await encryptAES(mode, secret, data);

    asserts.assertNotEquals(encrypted1, encrypted2);

    // But format should be consistent
    asserts.assertEquals(encrypted1.split(':').length, 2);
    asserts.assertEquals(encrypted2.split(':').length, 2);
  });

  await t.step('encryptAES - Long Data', async () => {
    const data = 'a'.repeat(10000); // 10KB of data
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);

    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);
    asserts.assertEquals(encrypted.split(':').length, 2);
  });

  await t.step('encryptAES - Unicode Data', async () => {
    const data = '🔐 Unicode test with émojis and spëcial chars 中文';
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);

    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);
    asserts.assertEquals(encrypted.split(':').length, 2);
  });

  await t.step('encryptAES - Error Handling', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Invalid encryption mode
    await asserts.assertRejects(
      async () => {
        await encryptAES('INVALID-MODE:256' as EncryptionModes, secret, data);
      },
      Error,
      'Invalid AES encryption mode. Must be AES-GCM, AES-CBC, or AES-CTR',
    );

    // Invalid key length
    await asserts.assertRejects(
      async () => {
        await encryptAES('AES-GCM:999' as EncryptionModes, secret, data);
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );

    // Missing key length
    await asserts.assertRejects(
      async () => {
        await encryptAES('AES-GCM' as EncryptionModes, secret, data);
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );
  });

  await t.step('encryptAES - All Valid Modes', async () => {
    const data = 'test all modes';
    const secret128 = 'abcdefghijklmnop';
    const secret192 = 'abcdefghijklmnopqrstuvwx';
    const secret256 = 'abcdefghijklmnopqrstuvwxyz123456';

    const modes: EncryptionModes[] = [
      'AES-GCM:128',
      'AES-GCM:192',
      'AES-GCM:256',
      'AES-CBC:128',
      'AES-CBC:192',
      'AES-CBC:256',
      'AES-CTR:128',
      'AES-CTR:192',
      'AES-CTR:256',
    ];

    for (const mode of modes) {
      const secret = mode.includes('128') ? secret128 : mode.includes('192') //NOSONAR
        ? secret192
        : secret256;

      const encrypted = await encryptAES(mode, secret, data);
      asserts.assertEquals(typeof encrypted, 'string');
      asserts.assertEquals(encrypted.length > 0, true);
      asserts.assertEquals(encrypted.split(':').length, 2);
    }
  });

  // RSA Encryption Tests
  await t.step('encryptRSA - Basic RSA-OAEP Encryption', async () => {
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
      'RSA-OAEP:2048:SHA-256',
      publicKeyPEM,
      data,
    );

    // Check that the encrypted data is a base64 string
    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);

    // Should be valid base64
    asserts.assertExists(atob(encrypted));
  });

  await t.step('encryptRSA - Different Key Sizes', async () => {
    const data = 'Test data';

    // Test different key sizes
    for (const keySize of [2048, 3072, 4096]) {
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
        `RSA-OAEP:${keySize}:SHA-256` as EncryptionModes,
        publicKeyPEM,
        data,
      );
      asserts.assertEquals(typeof encrypted, 'string');
      asserts.assertEquals(encrypted.length > 0, true);
    }
  });

  await t.step('encryptRSA - Different Hash Algorithms', async () => {
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
        `RSA-OAEP:2048:${hash}` as EncryptionModes,
        publicKeyPEM,
        data,
      );
      asserts.assertEquals(typeof encrypted, 'string');
      asserts.assertEquals(encrypted.length > 0, true);
    }
  });

  await t.step('encryptRSA - Data Size Limits', async () => {
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
      'RSA-OAEP:2048:SHA-256',
      publicKeyPEM,
      maxData,
    );
    asserts.assertEquals(typeof encrypted, 'string');

    // Test data that's too large (should fail)
    const oversizedData = 'a'.repeat(maxSize + 1);
    await asserts.assertRejects(
      async () => {
        await encryptRSA('RSA-OAEP:2048:SHA-256', publicKeyPEM, oversizedData);
      },
      Error,
      'Data too large for RSA key',
    );
  });

  await t.step('encryptRSA - Error Handling', async () => {
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

    // Invalid mode format
    await asserts.assertRejects(
      async () => {
        await encryptRSA('INVALID-MODE' as any, publicKeyPEM, data);
      },
      Error,
      'Invalid RSA encryption mode',
    );

    // Invalid key size
    await asserts.assertRejects(
      async () => {
        await encryptRSA('RSA-OAEP:1024:SHA-256' as any, publicKeyPEM, data);
      },
      Error,
      'Invalid RSA key length',
    );

    // Invalid hash algorithm
    await asserts.assertRejects(
      async () => {
        await encryptRSA('RSA-OAEP:2048:MD5' as any, publicKeyPEM, data);
      },
      Error,
      'Invalid hash algorithm',
    );

    // Invalid PEM key
    await asserts.assertRejects(
      async () => {
        await encryptRSA('RSA-OAEP:2048:SHA-256', 'invalid-pem-key', data);
      },
      Error,
      'Invalid PEM public key format',
    );
  });

  await t.step('encryptRSA - Binary Data', async () => {
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
      'RSA-OAEP:2048:SHA-256',
      publicKeyPEM,
      binaryData,
    );

    asserts.assertEquals(typeof encrypted, 'string');
    asserts.assertEquals(encrypted.length > 0, true);
  });
});
