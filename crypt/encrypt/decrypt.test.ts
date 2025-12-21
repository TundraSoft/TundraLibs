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

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });
    const decrypted = await decryptAES(encrypted, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - returnBinary parameter', async () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });
    const decrypted = await decryptAES(encrypted, secret, {
      mode: 'GCM',
      keyLength: 256,
      returnBinary: true,
    });

    asserts.assertEquals(decrypted instanceof Uint8Array, true);
    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - String Return by Default', async () => {
    const data = 'test string data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret, {
      mode: 'GCM',
      keyLength: 256,
    });
    const decrypted = await decryptAES(encrypted, secret, {
      mode: 'GCM',
      keyLength: 256,
    });

    asserts.assertEquals(typeof decrypted, 'string');
    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - Empty Input', async () => {
    const data = '';
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret);
    const decrypted = await decryptAES(encrypted, secret);

    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - Different Key Lengths', async () => {
    const data = 'test data';
    const secret = 'abcdefghijklmnopqrstuvwxyz';
    const keyLengths: Array<128 | 192 | 256> = [128, 192, 256];

    for (const keyLength of keyLengths) {
      const encrypted = await encryptAES(data, secret, {
        mode: 'GCM',
        keyLength,
      });
      const decrypted = await decryptAES(encrypted, secret, {
        mode: 'GCM',
        keyLength,
      });
      asserts.assertEquals(decrypted, data);
    }
  });

  await t.step('decryptAES - Different Algorithms', async () => {
    const data = 'test data';
    const secret = 'abcdefghijklmnopqrstuvwxyz';
    const modes: Array<'GCM' | 'CBC' | 'CTR'> = ['GCM', 'CBC', 'CTR'];

    for (const mode of modes) {
      const encrypted = await encryptAES(data, secret, {
        mode,
        keyLength: 256,
      });
      const decrypted = await decryptAES(encrypted, secret, {
        mode,
        keyLength: 256,
      });
      asserts.assertEquals(decrypted, data);
    }
  });

  await t.step('decryptAES - Error Handling', async () => {
    const data = 'my data';
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Test invalid data format
    await asserts.assertRejects(
      async () => {
        await decryptAES('invalidformat', secret);
      },
      Error,
      'Invalid encrypted data format. Expected "data:iv"',
    );

    // Test missing IV with valid hex format
    await asserts.assertRejects(
      async () => {
        await decryptAES('abcdef:', secret);
      },
      Error,
      'Initialization vector (IV) or counter is undefined',
    );

    // Test invalid mode
    await asserts.assertRejects(
      async () => {
        const encrypted = await encryptAES('test', secret);
        await decryptAES(encrypted, secret, { mode: 'INVALID' as any });
      },
      Error,
      'Invalid AES encryption mode. Must be GCM, CBC, or CTR',
    );

    // Test invalid key length
    await asserts.assertRejects(
      async () => {
        const encrypted = await encryptAES('test', secret);
        await decryptAES(encrypted, secret, { keyLength: 999 as any });
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );

    await asserts.assertRejects(
      async () => {
        const encrypted = await encryptAES('test', secret);
        await decryptAES(encrypted, secret, { keyLength: 0 as any });
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );
  });

  await t.step('decryptAES - Invalid Encrypted Data', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Test with corrupted encrypted data
    await asserts.assertRejects(
      async () => {
        await decryptAES('invalidhex:anotherhex', secret);
      },
      Error,
    );
  });

  await t.step('decryptAES - Wrong Secret', async () => {
    const data = 'secret message';
    const secret1 = 'correctsecret123456789012345';
    const secret2 = 'wrongsecret123456789012345';

    const encrypted = await encryptAES(data, secret1);

    // Should fail with wrong secret
    await asserts.assertRejects(
      async () => {
        await decryptAES(encrypted, secret2);
      },
      Error,
    );
  });

  await t.step('decryptAES - All Valid Modes', async () => {
    const data = 'test data';
    const secret = 'testsecretwith32characterslong!';
    const configs: Array<
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

    for (const config of configs) {
      const encrypted = await encryptAES(data, secret, config);
      const decrypted = await decryptAES(encrypted, secret, config);
      asserts.assertEquals(decrypted, data);
    }
  });

  await t.step('decryptAES - Long Data', async () => {
    const data = 'a'.repeat(10000);
    const secret = 'testsecretwith32characterslong!';

    const encrypted = await encryptAES(data, secret);
    const decrypted = await decryptAES(encrypted, secret);
    asserts.assertEquals(decrypted, data);
  });

  await t.step('decryptAES - Unicode Data', async () => {
    const data = '🔐 Hello 世界 🌍';
    const secret = 'testsecretwith32characterslong!';

    const encrypted = await encryptAES(data, secret);
    const decrypted = await decryptAES(encrypted, secret);
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
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
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
      data,
      publicKeyPEM,
    );
    const decrypted = await decryptRSA(
      encrypted,
      privateKeyPEM,
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
        String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
      );
      const privateKeyBase64 = btoa(
        String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
      );

      const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
        publicKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PUBLIC KEY-----`;
      const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
        privateKeyBase64.match(/.{1,64}/g)?.join('\n')
      }\n-----END PRIVATE KEY-----`;

      const encrypted = await encryptRSA(
        data,
        publicKeyPEM,
        { keySize: keySize as 2048 | 3072 | 4096 },
      );
      const decrypted = await decryptRSA(
        encrypted,
        privateKeyPEM,
        { keySize: keySize as 2048 | 3072 | 4096 },
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
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );

    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const binaryData = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 127]);

    const encrypted = await encryptRSA(
      binaryData,
      publicKeyPEM,
    );
    const decrypted = await decryptRSA(
      encrypted,
      privateKeyPEM,
      { returnBinary: true },
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
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );
    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    // Invalid key size
    await asserts.assertRejects(
      async () => {
        await decryptRSA('base64data', privateKeyPEM, { keySize: 1024 as any });
      },
      Error,
      'Invalid RSA key size',
    );

    // Invalid encrypted data
    await asserts.assertRejects(
      async () => {
        await decryptRSA(
          'invalid-base64!@#',
          privateKeyPEM,
        );
      },
      Error,
      'Invalid base64 encrypted data',
    );

    // Invalid PEM key
    await asserts.assertRejects(
      async () => {
        await decryptRSA(
          'dmFsaWRiYXNlNjQ=',
          'invalid-pem',
        );
      },
      Error,
      'Invalid PEM private key format',
    );
  });
});
