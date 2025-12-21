import * as asserts from '$asserts';
import { type DigestAlgorithms, sign, signHMAC, signRSA } from './mod.ts';

Deno.test('crypt.sign', async (t) => {
  const secret = 'abcdefghijklmnopqrstuvwx';
  const data = 'my data';

  await t.step('signHMAC - SHA-1', async () => {
    const signature = await signHMAC(data, secret, { hashAlgorithm: 'SHA-1' });
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 40); // SHA-1 produces 160 bits = 20 bytes = 40 hex chars
    // Verify against a known test vector
    asserts.assertEquals(
      signature,
      'cd02551761ed331daf90a78386a9613f19b55604',
    );
  });

  await t.step('signHMAC - SHA-256', async () => {
    const signature = await signHMAC(data, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64); // SHA-256 produces 256 bits = 32 bytes = 64 hex chars
    // Verify against a known test vector
    asserts.assertEquals(
      signature,
      '5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5',
    );
  });

  await t.step('signHMAC - SHA-384', async () => {
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

  await t.step('signHMAC - SHA-512', async () => {
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

  await t.step('signHMAC - Binary Data', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await signHMAC(binaryData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  await t.step('signHMAC - Empty Data', async () => {
    const emptyData = '';
    const signature = await signHMAC(emptyData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  await t.step('signHMAC - Long Data', async () => {
    const longData = 'a'.repeat(10000);
    const signature = await signHMAC(longData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  await t.step('signHMAC - Unicode Data', async () => {
    const unicodeData = '🔐 Hello 世界 🌍';
    const signature = await signHMAC(unicodeData, secret);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  await t.step('signHMAC - Different Secrets', async () => {
    const secret1 = 'secret1';
    const secret2 = 'secret2';

    const signature1 = await signHMAC(data, secret1);
    const signature2 = await signHMAC(data, secret2);

    asserts.assertNotEquals(signature1, signature2);
  });

  await t.step('signHMAC - Consistency', async () => {
    // Same input should produce same output
    const signature1 = await signHMAC(data, secret);
    const signature2 = await signHMAC(data, secret);

    asserts.assertEquals(signature1, signature2);
  });

  await t.step('signHMAC - All Algorithms', async () => {
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

  await t.step('signHMAC - Error Handling', async () => {
    await asserts.assertRejects(
      async () => {
        await signHMAC(data, secret, { hashAlgorithm: 'INVALID' as any });
      },
      Error,
      'Invalid HMAC hash',
    );
  });

  await t.step('sign - Basic functionality with HMAC', async () => {
    const signature = await sign('HMAC:SHA-256', secret, data);
    const expectedSignature = await signHMAC(data, secret);

    asserts.assertEquals(signature, expectedSignature);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  await t.step('sign - All HMAC algorithms', async () => {
    const algorithms: Array<'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'> = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    for (const algo of algorithms) {
      const signature = await sign(
        `HMAC:${algo}` as 'HMAC:SHA-256',
        secret,
        data,
      );
      const expectedSignature = await signHMAC(
        data,
        secret,
        { hashAlgorithm: algo },
      );

      asserts.assertEquals(signature, expectedSignature);
      asserts.assertEquals(typeof signature, 'string');
      asserts.assert(/^[0-9a-f]+$/.test(signature), 'Should be hex string');
    }
  });

  await t.step('sign - Binary data support', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await sign('HMAC:SHA-256', secret, binaryData);
    const expectedSignature = await signHMAC(binaryData, secret);

    asserts.assertEquals(signature, expectedSignature);
    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length, 64);
  });

  await t.step('sign - Error handling - invalid algorithm', async () => {
    await asserts.assertRejects(
      async () => {
        await sign('RSA:SHA-256' as any, secret, data);
      },
      Error,
      'Invalid signing mode. Must be HMAC',
    );

    await asserts.assertRejects(
      async () => {
        await sign('INVALID:SHA-256' as any, secret, data);
      },
      Error,
      'Invalid signing mode. Must be HMAC',
    );
  });

  await t.step('sign - Error handling - invalid format', async () => {
    await asserts.assertRejects(
      async () => {
        await sign('HMAC' as any, secret, data);
      },
      Error,
      'Invalid signing mode format. Expected "HMAC:HASH_ALGORITHM"',
    );

    await asserts.assertRejects(
      async () => {
        await sign('HMAC:' as any, secret, data);
      },
      Error,
      'Invalid signing mode format. Expected "HMAC:HASH_ALGORITHM"',
    );
  });

  await t.step('sign - Error handling - invalid hash algorithm', async () => {
    await asserts.assertRejects(
      async () => {
        await sign('HMAC:MD5' as any, secret, data);
      },
      Error,
      'Invalid HMAC hash. Must be SHA-1, SHA-256, SHA-384 or SHA-512',
    );
  });

  // RSA Signing Tests
  await t.step('signRSA - Basic RSA-PSS Signing', async () => {
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

  await t.step('signRSA - Different Key Sizes', async () => {
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
        { keySize },
      );
      asserts.assertEquals(typeof signature, 'string');
      asserts.assertEquals(signature.length > 0, true);
    }
  });

  await t.step('signRSA - Different Hash Algorithms', async () => {
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
        { hashAlgorithm: hash as any },
      );
      asserts.assertEquals(typeof signature, 'string');
      asserts.assertEquals(signature.length > 0, true);
    }
  });

  await t.step('signRSA - Binary Data', async () => {
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

  await t.step('signRSA - Error Handling', async () => {
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

    // Invalid key size
    await asserts.assertRejects(
      async () => {
        await signRSA(testData, privateKeyPEM, { keySize: 1024 as any });
      },
      Error,
      'Invalid RSA key size',
    );

    // Invalid hash algorithm
    await asserts.assertRejects(
      async () => {
        await signRSA(testData, privateKeyPEM, { hashAlgorithm: 'MD5' as any });
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

  await t.step('sign - RSA-PSS Integration', async () => {
    // Test the main sign function with RSA-PSS
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

    const testData = 'Integration test for RSA-PSS signing';
    const signature = await sign(
      'RSA-PSS:2048:SHA-256',
      privateKeyPEM,
      testData,
    );

    asserts.assertEquals(typeof signature, 'string');
    asserts.assertEquals(signature.length > 0, true);
  });
});
