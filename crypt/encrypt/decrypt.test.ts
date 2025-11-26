import * as asserts from '$asserts';
import {
  decryptAES,
  decryptRSA,
  encryptAES,
  type EncryptionModes,
  encryptRSA,
} from './mod.ts';

Deno.test('crypt.decrypt', async (t) => {
  await t.step('decryptAES - Basic Decryption', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx'; // 24 bytes (192 bits)
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);
    const decrypted = await decryptAES(mode, secret, encrypted);

    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - returnBinary parameter', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);
    const decrypted = await decryptAES(mode, secret, encrypted, true);

    asserts.assertEquals(decrypted instanceof Uint8Array, true);
    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - String Return by Default', async () => {
    const data = 'test string data';
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);
    const decrypted = await decryptAES(mode, secret, encrypted, false);

    asserts.assertEquals(typeof decrypted, 'string');
    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - Empty Input', async () => {
    const data = '';
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);
    const decrypted = await decryptAES(mode, secret, encrypted);

    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - Different Key Lengths', async () => {
    const data = 'test data';
    const secret = 'abcdefghijklmnopqrstuvwxyz';
    const modes: EncryptionModes[] = [
      'AES-GCM:128',
      'AES-GCM:192',
      'AES-GCM:256',
    ];

    for (const mode of modes) {
      const encrypted = await encryptAES(mode, secret, data);
      const decrypted = await decryptAES(mode, secret, encrypted);
      asserts.assertEquals(decrypted, data);
    }
  });

  await t.step('decryptAES - Different Algorithms', async () => {
    const data = 'test data';
    const secret = 'abcdefghijklmnopqrstuvwxyz';
    const modes: EncryptionModes[] = [
      'AES-GCM:256',
      'AES-CBC:256',
      'AES-CTR:256',
    ];

    for (const mode of modes) {
      const encrypted = await encryptAES(mode, secret, data);
      const decrypted = await decryptAES(mode, secret, encrypted);
      asserts.assertEquals(decrypted, data);
    }
  });

  await t.step('decryptAES - Error Handling', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Test invalid data format
    await asserts.assertRejects(
      async () => {
        await decryptAES('AES-GCM:256', secret, 'invalidformat');
      },
      Error,
      'Invalid encrypted data format. Expected "data:iv"',
    );

    // Test missing IV with valid hex format
    await asserts.assertRejects(
      async () => {
        await decryptAES('AES-GCM:256', secret, 'abcdef:');
      },
      Error,
      'Initialization vector (IV) or counter is undefined',
    );

    // Test invalid mode
    await asserts.assertRejects(
      async () => {
        await decryptAES('INVALID-MODE:256' as EncryptionModes, secret, data);
      },
      Error,
      'Invalid AES encryption mode. Must be AES-GCM, AES-CBC, or AES-CTR',
    );

    // Test invalid key length
    await asserts.assertRejects(
      async () => {
        await decryptAES('AES-GCM:999' as EncryptionModes, secret, data);
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );

    await asserts.assertRejects(
      async () => {
        await decryptAES('AES-GCM' as EncryptionModes, secret, data);
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );
  });

  await t.step('decryptAES - Invalid Encrypted Data', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';
    const mode: EncryptionModes = 'AES-GCM:256';

    // Test with corrupted encrypted data
    await asserts.assertRejects(
      async () => {
        await decryptAES(mode, secret, 'invalidhex:anotherhex');
      },
      Error,
    );
  });

  await t.step('decryptAES - Wrong Secret', async () => {
    const data = 'secret message';
    const secret1 = 'correctsecret123456789012345';
    const secret2 = 'wrongsecret123456789012345';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret1, data);

    // Should fail with wrong secret
    await asserts.assertRejects(
      async () => {
        await decryptAES(mode, secret2, encrypted);
      },
      Error,
    );
  });

  await t.step('decryptAES - All Valid Modes', async () => {
    const data = 'test data';
    const secret = 'testsecretwith32characterslong!';
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
      const encrypted = await encryptAES(mode, secret, data);
      const decrypted = await decryptAES(mode, secret, encrypted);
      asserts.assertEquals(decrypted, data);
    }
  });

  await t.step('decryptAES - Long Data', async () => {
    const data = 'a'.repeat(10000);
    const secret = 'testsecretwith32characterslong!';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);
    const decrypted = await decryptAES(mode, secret, encrypted);
    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - Unicode Data', async () => {
    const data = '🔐 Hello 世界 🌍';
    const secret = 'testsecretwith32characterslong!';
    const mode: EncryptionModes = 'AES-GCM:256';

    const encrypted = await encryptAES(mode, secret, data);
    const decrypted = await decryptAES(mode, secret, encrypted);
    asserts.assertEquals(decrypted, data);
  });

  // RSA Decryption Tests
  await t.step('decryptRSA - Basic RSA-OAEP Decryption', async () => {
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

    // Export and format keys as PEM
    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );

    const publicKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(publicKeyRaw)),
    );
    const privateKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(privateKeyRaw)),
    );

    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const data = 'Hello, RSA World!';

    // Test encryption followed by decryption
    const encrypted = await encryptRSA(
      'RSA-OAEP:2048:SHA-256',
      publicKeyPEM,
      data,
    );
    const decrypted = await decryptRSA(
      'RSA-OAEP:2048:SHA-256',
      privateKeyPEM,
      encrypted,
    );

    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptRSA - Round-trip with Different Key Sizes', async () => {
    const data = 'Test data for different key sizes';

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
      const privateKeyRaw = await crypto.subtle.exportKey(
        'pkcs8',
        keyPair.privateKey,
      );

      const publicKeyBase64 = btoa(
        String.fromCharCode(...new Uint8Array(publicKeyRaw)),
      );
      const privateKeyBase64 = btoa(
        String.fromCharCode(...new Uint8Array(privateKeyRaw)),
      );

      const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
        publicKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PUBLIC KEY-----`;
      const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
        privateKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PRIVATE KEY-----`;

      const encrypted = await encryptRSA(
        `RSA-OAEP:${keySize}:SHA-256` as EncryptionModes,
        publicKeyPEM,
        data,
      );
      const decrypted = await decryptRSA(
        `RSA-OAEP:${keySize}:SHA-256` as EncryptionModes,
        privateKeyPEM,
        encrypted,
      );

      asserts.assertEquals(decrypted, data);
    }
  });

  await t.step('decryptRSA - Binary Data Round-trip', async () => {
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
    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );

    const publicKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(publicKeyRaw)),
    );
    const privateKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(privateKeyRaw)),
    );

    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 127]);

    const encrypted = await encryptRSA(
      'RSA-OAEP:2048:SHA-256',
      publicKeyPEM,
      binaryData,
    );
    const decrypted = await decryptRSA(
      'RSA-OAEP:2048:SHA-256',
      privateKeyPEM,
      encrypted,
      true,
    );

    asserts.assertEquals(decrypted instanceof Uint8Array, true);
    asserts.assertEquals(decrypted, binaryData);
  });

  await t.step('decryptRSA - Error Handling', async () => {
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

    const privateKeyRaw = await crypto.subtle.exportKey(
      'pkcs8',
      keyPair.privateKey,
    );
    const privateKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(privateKeyRaw)),
    );
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    // Invalid mode format
    await asserts.assertRejects(
      async () => {
        await decryptRSA('INVALID-MODE' as any, privateKeyPEM, 'base64data');
      },
      Error,
      'Invalid RSA mode format',
    );

    // Invalid encrypted data
    await asserts.assertRejects(
      async () => {
        await decryptRSA(
          'RSA-OAEP:2048:SHA-256',
          privateKeyPEM,
          'invalid-base64!@#',
        );
      },
      Error,
      'Invalid base64 encrypted data',
    );

    // Invalid PEM key
    await asserts.assertRejects(
      async () => {
        await decryptRSA(
          'RSA-OAEP:2048:SHA-256',
          'invalid-pem',
          'dmFsaWRiYXNlNjQ=',
        );
      },
      Error,
      'Invalid PEM private key format',
    );
  });
});
