import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { encodeHex } from '@std/encoding';
import { decryptAES, decryptRSA, encryptAES, encryptRSA } from './mod.ts';
import { SALT_BYTES } from '../digest/mod.ts';
import { derivePBKDF2Key } from '../generators/mod.ts';

describe('crypt.decrypt', () => {
  it('decryptAES - Basic Decryption', async () => {
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

  it('decryptAES - returnBinary parameter', async () => {
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

  it('decryptAES - String Return by Default', async () => {
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

  it('decryptAES - Empty Input', async () => {
    const data = '';
    const secret = 'abcdefghijklmnopqrstuvwx';

    const encrypted = await encryptAES(data, secret);
    const decrypted = await decryptAES(encrypted, secret);

    asserts.assertEquals(decrypted, data);
  });

  it('decryptAES - Different Key Lengths', async () => {
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

  it('decryptAES - Different Algorithms', async () => {
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

  it('decryptAES - Error Handling', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Test invalid data format
    await asserts.assertRejects(
      async () => {
        await decryptAES('invalidformat', secret);
      },
      Error,
      'Invalid encrypted data format. Expected "data:iv:salt"',
    );

    // Test missing IV with valid envelope shape (3 parts, empty middle)
    await asserts.assertRejects(
      async () => {
        await decryptAES('abcdef::aa', secret);
      },
      Error,
      'Initialization vector (IV) or counter is undefined',
    );

    // Test missing salt with valid envelope shape (3 parts, empty tail)
    await asserts.assertRejects(
      async () => {
        await decryptAES('abcdef:aa:', secret);
      },
      Error,
      'Salt is missing from encrypted envelope',
    );

    // Test invalid mode
    await asserts.assertRejects(
      async () => {
        const encrypted = await encryptAES('test', secret);
        // @ts-expect-error Testing invalid mode
        await decryptAES(encrypted, secret, { mode: 'INVALID' });
      },
      Error,
      'Invalid AES encryption mode. Must be GCM, CBC, or CTR',
    );

    // Test invalid key length
    await asserts.assertRejects(
      async () => {
        const encrypted = await encryptAES('test', secret);
        // @ts-expect-error Testing invalid key length
        await decryptAES(encrypted, secret, { keyLength: 999 });
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );

    await asserts.assertRejects(
      async () => {
        const encrypted = await encryptAES('test', secret);
        // @ts-expect-error Testing invalid key length
        await decryptAES(encrypted, secret, { keyLength: 0 });
      },
      Error,
      'Invalid AES key length. Must be 128, 192, or 256',
    );
  });

  it('decryptAES - Invalid Encrypted Data', async () => {
    const secret = 'abcdefghijklmnopqrstuvwx';

    // Test with corrupted encrypted data
    await asserts.assertRejects(
      async () => {
        await decryptAES('invalidhex:anotherhex:somesalt', secret);
      },
      Error,
    );
  });

  it('decryptAES - Wrong Secret', async () => {
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

  it('decryptAES - All Valid Modes', async () => {
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

  it('decryptAES - Long Data', async () => {
    const data = 'a'.repeat(10000);
    const secret = 'testsecretwith32characterslong!';

    const encrypted = await encryptAES(data, secret);
    const decrypted = await decryptAES(encrypted, secret);
    asserts.assertEquals(decrypted, data);
  });

  it('decryptAES - Unicode Data', async () => {
    const data = '🔐 Hello 世界 🌍';
    const secret = 'testsecretwith32characterslong!';

    const encrypted = await encryptAES(data, secret);
    const decrypted = await decryptAES(encrypted, secret);
    asserts.assertEquals(decrypted, data);
  });

  it('decryptAES - CBC/CTR carry an encrypt-then-MAC part', async () => {
    const data = 'tamper target';
    const secret = 'testsecretwith32characterslong!';

    // GCM (AEAD) envelope is data:iv:salt; CBC/CTR add a 4th MAC part.
    const gcm = await encryptAES(data, secret, { mode: 'GCM' });
    asserts.assertEquals(gcm.split(':').length, 3);
    for (const mode of ['CBC', 'CTR'] as const) {
      const env = await encryptAES(data, secret, { mode });
      asserts.assertEquals(env.split(':').length, 4);
    }
  });

  it('decryptAES - rejects tampered CBC/CTR ciphertext', async () => {
    const data = 'do not modify me';
    const secret = 'testsecretwith32characterslong!';

    for (const mode of ['CBC', 'CTR'] as const) {
      const parts = (await encryptAES(data, secret, { mode })).split(':');
      // Flip one hex nibble of the ciphertext — the MAC must reject it.
      const flipped = (parts[0]![0] === 'a' ? 'b' : 'a') + parts[0]!.slice(1);
      parts[0] = flipped;
      await asserts.assertRejects(
        () => decryptAES(parts.join(':'), secret, { mode }),
        Error,
        'Authentication failed',
      );
    }
  });

  it('decryptAES - rejects CBC/CTR with a stripped MAC', async () => {
    const data = 'needs its mac';
    const secret = 'testsecretwith32characterslong!';

    for (const mode of ['CBC', 'CTR'] as const) {
      const env = await encryptAES(data, secret, { mode });
      const withoutMac = env.split(':').slice(0, 3).join(':');
      await asserts.assertRejects(
        () => decryptAES(withoutMac, secret, { mode }),
        Error,
        'data:iv:salt:mac',
      );
    }
  });

  it('decryptAES - CBC/CTR wrong secret fails authentication', async () => {
    const data = 'secret message';
    const secret = 'correctsecret123456789012345';
    const wrong = 'wrongsecret1234567890123456789';

    for (const mode of ['CBC', 'CTR'] as const) {
      const env = await encryptAES(data, secret, { mode });
      await asserts.assertRejects(
        () => decryptAES(env, wrong, { mode }),
        Error,
        'Authentication failed',
      );
    }
  });

  it('decryptAES - legacy GCM envelope with a 16-byte IV still decrypts', async () => {
    // Before the switch to the standard 12-byte GCM nonce, encryptAES emitted
    // 16-byte GCM IVs. Data encrypted back then (e.g. norm's at-rest columns)
    // must keep decrypting: decryptAES reads the IV length from the envelope.
    // Reconstruct such a legacy envelope from the low-level primitives.
    const data = 'stored before the nonce change';
    const secret = 'testsecretwith32characterslong!';

    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const legacyIv = crypto.getRandomValues(new Uint8Array(16));
    const key = await derivePBKDF2Key(secret, salt, 'AES-GCM', 256);
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: legacyIv },
      key,
      new TextEncoder().encode(data) as BufferSource,
    );
    const legacyEnvelope = `${encodeHex(ciphertext)}:${encodeHex(legacyIv)}:${
      encodeHex(salt)
    }`;

    asserts.assertEquals(await decryptAES(legacyEnvelope, secret), data);
  });

  it('decryptAES - current GCM envelope (12-byte nonce) round-trips', async () => {
    const data = 'written after the nonce change';
    const secret = 'testsecretwith32characterslong!';

    const envelope = await encryptAES(data, secret, { mode: 'GCM' });
    // New envelopes carry the standard 96-bit nonce…
    asserts.assertEquals(envelope.split(':')[1]!.length, 12 * 2);
    // …and decrypt with the same code path that accepts legacy ones.
    asserts.assertEquals(await decryptAES(envelope, secret), data);
  });

  // RSA Decryption Tests
  it('decryptRSA - Basic RSA-OAEP Decryption', async () => {
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

  it('decryptRSA - Round-trip with Different Key Sizes', async () => {
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
      );
      const decrypted = await decryptRSA(
        encrypted,
        privateKeyPEM,
      );

      asserts.assertEquals(decrypted, data);
    }
  });

  it('decryptRSA - Binary Data Round-trip', async () => {
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

  it('decryptRSA - Error Handling', async () => {
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

  it('decryptRSA - Hash Algorithm Must Match Encryption', async () => {
    // Generate keys with SHA-256
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

    const data = 'Test hash algorithm matching';

    // Encrypt with SHA-256
    const encrypted = await encryptRSA(
      data,
      publicKeyPEM,
      { hashAlgorithm: 'SHA-256' },
    );

    // Try to decrypt with SHA-512 (should fail)
    await asserts.assertRejects(
      async () => {
        await decryptRSA(
          encrypted,
          privateKeyPEM,
          { hashAlgorithm: 'SHA-512' },
        );
      },
      Error,
    );

    // Try to decrypt with SHA-384 (should fail)
    await asserts.assertRejects(
      async () => {
        await decryptRSA(
          encrypted,
          privateKeyPEM,
          { hashAlgorithm: 'SHA-384' },
        );
      },
      Error,
    );

    // Decrypt with correct algorithm (should work)
    const decrypted = await decryptRSA(
      encrypted,
      privateKeyPEM,
      { hashAlgorithm: 'SHA-256' },
    );
    asserts.assertEquals(decrypted, data);
  });

  it('decryptRSA - PEM Format Variations', async () => {
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

    const data = 'Test PEM format variations';
    const encrypted = await encryptRSA(data, publicKeyPEM);

    // Standard 64-character line breaks
    const standardPrivatePEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;
    const dec1 = await decryptRSA(encrypted, standardPrivatePEM);
    asserts.assertEquals(dec1, data);

    // No line breaks (single line)
    const singleLinePrivatePEM =
      `-----BEGIN PRIVATE KEY-----\n${privateKeyBase64}\n-----END PRIVATE KEY-----`;
    const dec2 = await decryptRSA(encrypted, singleLinePrivatePEM);
    asserts.assertEquals(dec2, data);

    // Extra whitespace
    const spacedPrivatePEM = `-----BEGIN PRIVATE KEY-----
    ${privateKeyBase64.match(/.{1,64}/g)?.join('\n    ')}
    -----END PRIVATE KEY-----`;
    const dec3 = await decryptRSA(encrypted, spacedPrivatePEM);
    asserts.assertEquals(dec3, data);

    // Different line lengths
    const irregularPrivatePEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,80}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;
    const dec4 = await decryptRSA(encrypted, irregularPrivatePEM);
    asserts.assertEquals(dec4, data);

    // Mixed spacing and alternative header
    const mixedPrivatePEM =
      `  -----BEGIN PRIVATE KEY-----  \n  ${privateKeyBase64}  \n  -----END PRIVATE KEY-----  `;
    const dec5 = await decryptRSA(encrypted, mixedPrivatePEM);
    asserts.assertEquals(dec5, data);
  });

  it('decryptRSA - Large Data with Different Hash Algorithms', async () => {
    const testCases: Array<{
      modulusLength: 2048 | 4096;
      hash: 'SHA-256' | 'SHA-512';
      maxSize: number;
    }> = [
      { modulusLength: 2048, hash: 'SHA-256', maxSize: 190 },
      { modulusLength: 4096, hash: 'SHA-512', maxSize: 382 }, // 512 - 2*64 - 2
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

      // Test with max allowed data size
      const maxData = 'x'.repeat(testCase.maxSize);
      const encrypted = await encryptRSA(
        maxData,
        publicKeyPEM,
        { hashAlgorithm: testCase.hash },
      );
      const decrypted = await decryptRSA(
        encrypted,
        privateKeyPEM,
        { hashAlgorithm: testCase.hash },
      );
      asserts.assertEquals(decrypted, maxData);
    }
  });

  it('decryptRSA - Malformed Base64 Handling', async () => {
    // This test addresses issues when encrypted values are incorrectly
    // copied or pasted (e.g., invalid characters, corruption, truncation)
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

    const data = 'Test data';
    const validEncrypted = await encryptRSA(data, publicKeyPEM);

    // Note: atob() is forgiving and strips whitespace (newlines, spaces, tabs)
    // This means encrypted values can safely have whitespace added during copy-paste

    // Test 1: Whitespace is stripped by atob, so these still work correctly
    const withNewline = validEncrypted.slice(0, 50) + '\n' +
      validEncrypted.slice(50);
    const decrypted1 = await decryptRSA(withNewline, privateKeyPEM);
    asserts.assertEquals(decrypted1, data);

    const withSpaces = ' ' + validEncrypted + ' ';
    const decrypted2 = await decryptRSA(withSpaces, privateKeyPEM);
    asserts.assertEquals(decrypted2, data);

    const withTabs = '\t' + validEncrypted + '\t';
    const decrypted3 = await decryptRSA(withTabs, privateKeyPEM);
    asserts.assertEquals(decrypted3, data);

    // Test 2: Invalid base64 characters DO fail
    const invalidChars = validEncrypted.slice(0, 50) + '@#$' +
      validEncrypted.slice(50);
    await asserts.assertRejects(
      async () => {
        await decryptRSA(invalidChars, privateKeyPEM);
      },
      Error,
      'Invalid base64',
    );

    // Test 3: Truncated value (missing end) fails
    const truncated = validEncrypted.slice(0, -20);
    await asserts.assertRejects(
      async () => {
        await decryptRSA(truncated, privateKeyPEM);
      },
      Error,
    );

    // Test 4: Extra invalid characters cause base64 decoding to fail
    const extraChars = validEncrypted + '!!!';
    await asserts.assertRejects(
      async () => {
        await decryptRSA(extraChars, privateKeyPEM);
      },
      Error,
      'Invalid base64',
    );

    // Test 5: Completely wrong data (valid base64 but not RSA encrypted)
    const wrongData = btoa('this is not RSA encrypted data at all');
    await asserts.assertRejects(
      async () => {
        await decryptRSA(wrongData, privateKeyPEM);
      },
      Error,
    );

    // Test 6: Modified single character (simulates copy error). The ciphertext
    // keeps its length but one byte differs, so the RSA-OAEP integrity check
    // must fail. Deno and Bun reject inside `crypto.subtle.decrypt`; Node's
    // WebCrypto instead returns garbage without throwing. Both are acceptable
    // as long as the original plaintext is never recovered — assert on that
    // invariant rather than on the throw so the test holds on every runtime.
    // Swap in a char guaranteed to differ from the original at index 50, so the
    // corruption is never accidentally a no-op ('X' is in the base64 alphabet,
    // so blindly writing 'X' would leave the ciphertext unchanged ~1/64 runs).
    const swap = validEncrypted[50] === 'X' ? 'Y' : 'X';
    const modified = validEncrypted.slice(0, 50) + swap +
      validEncrypted.slice(51);
    let recovered: string | undefined;
    try {
      recovered = await decryptRSA(modified, privateKeyPEM);
    } catch {
      recovered = undefined; // rejected — the strict, expected outcome
    }
    asserts.assertNotEquals(recovered, data);

    // Test 7: Correct encrypted value works perfectly
    const correctDecrypted = await decryptRSA(validEncrypted, privateKeyPEM);
    asserts.assertEquals(correctDecrypted, data);
  });

  it('decryptRSA - Variable vs Literal Usage', async () => {
    // This test documents that encrypted values work identically
    // whether used as variables or pasted as string literals
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

    const originalText = 'Hello World';

    // Encrypt the text
    const encryptedValue = await encryptRSA(originalText, publicKeyPEM);

    // Approach 1: Using the encrypted value as a variable (typical usage)
    const decryptedFromVariable = await decryptRSA(
      encryptedValue,
      privateKeyPEM,
    );
    asserts.assertEquals(decryptedFromVariable, originalText);

    // Approach 2: Simulating literal usage - create a new string with same content
    // (In practice, this is what happens when you copy-paste the encrypted value)
    const literalValue = `${encryptedValue}`; // Creates a new string
    const decryptedFromLiteral = await decryptRSA(literalValue, privateKeyPEM);
    asserts.assertEquals(decryptedFromLiteral, originalText);

    // Both should produce identical results
    asserts.assertEquals(decryptedFromVariable, decryptedFromLiteral);

    // Even with whitespace (which might happen during copy-paste)
    const literalWithWhitespace = `  ${encryptedValue}  `;
    const decryptedWithWhitespace = await decryptRSA(
      literalWithWhitespace,
      privateKeyPEM,
    );
    asserts.assertEquals(decryptedWithWhitespace, originalText);

    // Verify the encrypted value is valid base64 with expected characters
    asserts.assertEquals(/^[A-Za-z0-9+/]+=*$/.test(encryptedValue), true);
  });
});

describe('crypt.AES with a pre-derived CryptoKey', () => {
  const keyFor = async (bits: 128 | 192 | 256 = 256): Promise<CryptoKey> => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    return await derivePBKDF2Key('shared-secret', salt, 'AES-GCM', bits);
  };

  it('round-trips with a derivePBKDF2Key key and a 2-part envelope', async () => {
    const key = await keyFor();
    const envelope = await encryptAES('key-based message', key);
    asserts.assertEquals(envelope.split(':').length, 2); // data:iv — no salt
    asserts.assertEquals(await decryptAES(envelope, key), 'key-based message');
  });

  it('round-trips binary data with an imported raw key', async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const key = await crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    const payload = new Uint8Array([0, 1, 2, 253, 254, 255]);
    const envelope = await encryptAES(payload, key);
    const out = await decryptAES(envelope, key, { returnBinary: true });
    asserts.assertEquals([...out], [...payload]);
  });

  it('skipping PBKDF2 means the same key decrypts many envelopes', async () => {
    const key = await keyFor(128);
    const a = await encryptAES('one', key, { keyLength: 128 });
    const b = await encryptAES('two', key);
    asserts.assertEquals(await decryptAES(a, key), 'one');
    asserts.assertEquals(await decryptAES(b, key), 'two');
    asserts.assertEquals(a === b, false); // fresh IV per message
  });

  it('rejects CBC/CTR with a CryptoKey secret (no MAC secret to derive)', async () => {
    const key = await keyFor();
    await asserts.assertRejects(
      () => encryptAES('x', key, { mode: 'CBC' }),
      Error,
      'CryptoKey secret supports GCM only',
    );
    await asserts.assertRejects(
      () => decryptAES('aa:bb', key, { mode: 'CTR' }),
      Error,
      'CryptoKey secret supports GCM only',
    );
  });

  it('rejects a non-GCM key and a contradicting keyLength option', async () => {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
    const cbcKey = await derivePBKDF2Key('s', salt, 'AES-CBC', 256);
    await asserts.assertRejects(
      () => encryptAES('x', cbcKey),
      Error,
      "CryptoKey is for 'AES-CBC'",
    );
    const key = await keyFor(256);
    await asserts.assertRejects(
      () => encryptAES('x', key, { keyLength: 128 }),
      Error,
      'options.keyLength says 128',
    );
  });

  it('rejects a key that does not permit the operation', async () => {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    const encryptOnly = await crypto.subtle.importKey(
      'raw',
      raw as BufferSource,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );
    const envelope = await encryptAES('x', encryptOnly);
    await asserts.assertRejects(
      () => decryptAES(envelope, encryptOnly),
      Error,
      "does not permit 'decrypt'",
    );
  });

  it('string and key envelopes are not interchangeable', async () => {
    const key = await keyFor();
    const stringEnvelope = await encryptAES('x', 'shared-secret'); // 3-part
    await asserts.assertRejects(
      () => decryptAES(stringEnvelope, key),
      Error,
      'Expected "data:iv" for a CryptoKey secret',
    );
    const keyEnvelope = await encryptAES('x', key); // 2-part
    await asserts.assertRejects(
      () => decryptAES(keyEnvelope, 'shared-secret'),
      Error,
      'Expected "data:iv:salt"',
    );
  });

  it('a tampered key-based envelope is rejected (GCM auth)', async () => {
    const key = await keyFor();
    const envelope = await encryptAES('authentic', key);
    const [dataHex, ivHex] = envelope.split(':') as [string, string];
    const flipped = (parseInt(dataHex.slice(0, 2), 16) ^ 0x01)
      .toString(16)
      .padStart(2, '0');
    await asserts.assertRejects(() =>
      decryptAES(`${flipped}${dataHex.slice(2)}:${ivHex}`, key)
    );
  });
});
