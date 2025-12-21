import * as asserts from '$asserts';
import {
  type DigestAlgorithms,
  signHMAC,
  signRSA,
  verify,
  verifyHMAC,
  verifyRSA,
} from './mod.ts';

Deno.test('crypt.verify', async (t) => {
  const secret = 'abcdefghijklmnopqrstuvwx';
  const data = 'my data';

  await t.step('verifyHMAC - SHA-1', async () => {
    const signature = await signHMAC(data, secret, { hashAlgorithm: 'SHA-1' });
    const isValid = await verifyHMAC(data, signature, secret, {
      hashAlgorithm: 'SHA-1',
    });
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - SHA-256', async () => {
    const signature = await signHMAC(data, secret);
    const isValid = await verifyHMAC(data, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - SHA-384', async () => {
    const signature = await signHMAC(data, secret, {
      hashAlgorithm: 'SHA-384',
    });
    const isValid = await verifyHMAC(data, signature, secret, {
      hashAlgorithm: 'SHA-384',
    });
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - SHA-512', async () => {
    const signature = await signHMAC(data, secret, {
      hashAlgorithm: 'SHA-512',
    });
    const isValid = await verifyHMAC(data, signature, secret, {
      hashAlgorithm: 'SHA-512',
    });
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Binary Data', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await signHMAC(binaryData, secret);
    const isValid = await verifyHMAC(binaryData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Empty Data', async () => {
    const emptyData = '';
    const signature = await signHMAC(emptyData, secret);
    const isValid = await verifyHMAC(emptyData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Invalid Signature', async () => {
    const signature = await signHMAC(data, secret);
    const tamperedSignature = signature.slice(0, -2) + '00'; // Change last byte
    const isValid = await verifyHMAC(
      data,
      tamperedSignature,
      secret,
    );
    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHMAC - Wrong Secret', async () => {
    const signature = await signHMAC(data, secret);
    const wrongSecret = 'wrongsecret123456789012345';
    const isValid = await verifyHMAC(data, signature, wrongSecret);
    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHMAC - Wrong Data', async () => {
    const signature = await signHMAC(data, secret);
    const wrongData = 'wrong data';
    const isValid = await verifyHMAC(wrongData, signature, secret);
    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHMAC - Empty Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, '', secret);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  await t.step('verifyHMAC - Null Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, null as any, secret);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  await t.step('verifyHMAC - Undefined Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, undefined as any, secret);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  await t.step('verifyHMAC - Invalid Hex Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, 'invalidhex', secret);
      },
      Error,
      'Invalid signature format. Must be a hex string',
    );
  });

  await t.step('verifyHMAC - Odd Length Hex', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, '123', secret); // Odd length
      },
      Error,
      'Invalid signature format. Must be a hex string',
    );
  });

  await t.step('verifyHMAC - Known Test Vectors', async () => {
    // Test against known HMAC values
    const testCases = [
      {
        hashAlgorithm: 'SHA-1' as const,
        secret: 'abcdefghijklmnopqrstuvwx',
        data: 'my data',
        expectedSignature: 'cd02551761ed331daf90a78386a9613f19b55604',
      },
      {
        hashAlgorithm: 'SHA-256' as const,
        secret: 'abcdefghijklmnopqrstuvwx',
        data: 'my data',
        expectedSignature:
          '5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5',
      },
    ];

    for (const testCase of testCases) {
      const isValid = await verifyHMAC(
        testCase.data,
        testCase.expectedSignature,
        testCase.secret,
        { hashAlgorithm: testCase.hashAlgorithm },
      );
      asserts.assertEquals(isValid, true);
    }
  });

  await t.step('verifyHMAC - All Algorithms', async () => {
    const algorithms: Array<'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'> = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    for (const algo of algorithms) {
      const signature = await signHMAC(data, secret, { hashAlgorithm: algo });
      const isValid = await verifyHMAC(data, signature, secret, {
        hashAlgorithm: algo,
      });
      asserts.assertEquals(isValid, true);
    }
  });

  await t.step('verifyHMAC - Long Data', async () => {
    const longData = 'a'.repeat(10000);
    const signature = await signHMAC(longData, secret);
    const isValid = await verifyHMAC(longData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Unicode Data', async () => {
    const unicodeData = '🔐 Hello 世界 🌍';
    const signature = await signHMAC(unicodeData, secret);
    const isValid = await verifyHMAC(unicodeData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Error Handling', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(
          data,
          'signature',
          secret,
          { hashAlgorithm: 'INVALID' as any },
        );
      },
      Error,
      'Invalid HMAC hash',
    );
  });

  // RSA Verification Tests
  await t.step('verifyRSA - Basic RSA-PSS Verification', async () => {
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

    const testData = 'Document to be verified';

    // Sign then verify
    const signature = await signRSA(
      testData,
      privateKeyPEM,
    );
    const isValid = await verifyRSA(
      testData,
      signature,
      publicKeyPEM,
    );

    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyRSA - Invalid Signature Detection', async () => {
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

    const testData = 'Original document';
    const wrongData = 'Modified document';

    // Sign original data
    const signature = await signRSA(
      testData,
      privateKeyPEM,
    );

    // Verify with original data (should pass)
    const validSignature = await verifyRSA(
      testData,
      signature,
      publicKeyPEM,
    );
    asserts.assertEquals(validSignature, true);

    // Verify with wrong data (should fail)
    const invalidSignature = await verifyRSA(
      wrongData,
      signature,
      publicKeyPEM,
    );
    asserts.assertEquals(invalidSignature, false);
  });

  await t.step('verifyRSA - Different Key Sizes', async () => {
    const testData = 'Test verification with different key sizes';

    for (const keySize of [2048, 3072, 4096]) {
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

      const signature = await signRSA(
        testData,
        privateKeyPEM,
        { keySize: keySize as 2048 | 3072 | 4096 },
      );
      const isValid = await verifyRSA(
        testData,
        signature,
        publicKeyPEM,
        { keySize: keySize as 2048 | 3072 | 4096 },
      );

      asserts.assertEquals(isValid, true);
    }
  });

  await t.step('verifyRSA - Binary Data', async () => {
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

    const signature = await signRSA(
      binaryData,
      privateKeyPEM,
    );
    const isValid = await verifyRSA(
      binaryData,
      signature,
      publicKeyPEM,
    );

    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyRSA - Error Handling', async () => {
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

    const publicKeyRaw = await crypto.subtle.exportKey(
      'spki',
      keyPair.publicKey,
    );
    const publicKeyBase64 = btoa(
      String.fromCharCode(...new Uint8Array(publicKeyRaw)),
    );
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;

    const testData = 'test data';
    const validSignature = 'dGVzdA=='; // Valid base64

    // Invalid signature format
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          testData,
          'invalid-base64!@#',
          publicKeyPEM,
        );
      },
      Error,
      'Invalid signature format',
    );

    // Invalid PEM key
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          testData,
          validSignature,
          'invalid-pem',
        );
      },
      Error,
      'Invalid PEM public key format',
    );
  });

  await t.step('verify - RSA-PSS Integration', async () => {
    // Test the main verify function with RSA-PSS
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

    const testData = 'Integration test for RSA-PSS verification';

    // Use main sign and verify functions
    const signature = await signRSA(
      testData,
      privateKeyPEM,
    );
    const isValid = await verify(
      'RSA-PSS:2048:SHA-256',
      publicKeyPEM,
      testData,
      signature,
    );

    asserts.assertEquals(isValid, true);
  });

  // Additional error handling tests for verifyRSA
  await t.step('verifyRSA - Invalid key sizes', async () => {
    const testData = 'test data';
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuGBMfmXXcQJfCj4v4LVj
-----END PUBLIC KEY-----`;
    const signature = 'dGVzdA==';

    // Test invalid key sizes
    const invalidKeySizes = [1024, 2000, 5000];

    for (const keySize of invalidKeySizes) {
      await asserts.assertRejects(
        async () => {
          await verifyRSA(
            testData,
            signature,
            publicKeyPEM,
            { keySize: keySize as any },
          );
        },
        Error,
        'Invalid RSA key size',
      );
    }
  });

  await t.step('verifyRSA - Invalid hash algorithms', async () => {
    const testData = 'test data';
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuGBMfmXXcQJfCj4v4LVj
-----END PUBLIC KEY-----`;
    const signature = 'dGVzdA==';

    // Test invalid hash algorithms
    const invalidHashes = ['SHA-1', 'SHA-128', 'MD5', 'INVALID'];

    for (const hash of invalidHashes) {
      await asserts.assertRejects(
        async () => {
          await verifyRSA(
            testData,
            signature,
            publicKeyPEM,
            { hashAlgorithm: hash as any },
          );
        },
        Error,
        'Invalid hash algorithm',
      );
    }
  });

  await t.step('verifyRSA - Empty or invalid signature', async () => {
    const testData = 'test data';
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuGBMfmXXcQJfCj4v4LVj
-----END PUBLIC KEY-----`;

    // Test empty signature
    await asserts.assertRejects(
      async () => {
        await verifyRSA(testData, '', publicKeyPEM);
      },
      Error,
      'Signature must be a non-empty string',
    );

    // Test null signature
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          testData,
          null as any,
          publicKeyPEM,
        );
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  await t.step('verifyRSA - Invalid PEM formats', async () => {
    const testData = 'test data';
    const signature = 'dGVzdA==';

    // Test completely invalid PEM
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          testData,
          signature,
          'not-a-pem-key',
        );
      },
      Error,
      'Invalid PEM public key format',
    );

    // Test invalid base64 in PEM
    await asserts.assertRejects(
      async () => {
        const invalidPEM = `-----BEGIN PUBLIC KEY-----
InvalidBase64Characters!@#$%^&*()
-----END PUBLIC KEY-----`;
        await verifyRSA(
          testData,
          signature,
          invalidPEM,
        );
      },
      Error,
      'Invalid PEM public key format',
    );
  });

  // Test different hash algorithms for RSA
  await t.step('verifyRSA - SHA-384 hash algorithm', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-384',
      },
      true,
      ['sign', 'verify'],
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

    const testData = 'Test SHA-384 hash algorithm';
    const signature = await signRSA(
      testData,
      privateKeyPEM,
      { hashAlgorithm: 'SHA-384' },
    );
    const isValid = await verifyRSA(
      testData,
      signature,
      publicKeyPEM,
      { hashAlgorithm: 'SHA-384' },
    );

    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyRSA - SHA-512 hash algorithm', async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-512',
      },
      true,
      ['sign', 'verify'],
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

    const testData = 'Test SHA-512 hash algorithm';
    const signature = await signRSA(
      testData,
      privateKeyPEM,
      { hashAlgorithm: 'SHA-512' },
    );
    const isValid = await verifyRSA(
      testData,
      signature,
      publicKeyPEM,
      { hashAlgorithm: 'SHA-512' },
    );

    asserts.assertEquals(isValid, true);
  });

  // Test verify() function error handling
  await t.step('verify - Invalid signing mode', async () => {
    await asserts.assertRejects(
      async () => {
        await verify('INVALID:MODE' as any, 'secret', 'data', 'signature');
      },
      Error,
      'Invalid signing mode. Must be HMAC or RSA-PSS',
    );
  });

  await t.step('verify - Missing hash algorithm in HMAC mode', async () => {
    await asserts.assertRejects(
      async () => {
        await verify('HMAC:' as any, 'secret', 'data', 'signature');
      },
      Error,
      'Invalid signing mode format. Expected "HMAC:HASH_ALGORITHM"',
    );
  });

  // Test HMAC integration through verify() function
  await t.step('verify - HMAC Integration', async () => {
    const secret = 'test-secret-key';
    const data = 'test data for HMAC verification';

    // Test all HMAC hash algorithms through verify()
    const algorithms: Array<'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512'> = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    for (const algo of algorithms) {
      const signature = await signHMAC(data, secret, { hashAlgorithm: algo });
      const isValid = await verify(
        `HMAC:${algo}` as any,
        secret,
        data,
        signature,
      );
      asserts.assertEquals(
        isValid,
        true,
        `HMAC verification failed for ${algo}`,
      );
    }
  });
});
