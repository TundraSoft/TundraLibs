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
    const signature = await signHMAC('SHA-1', secret, data);
    const isValid = await verifyHMAC('SHA-1', secret, data, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - SHA-256', async () => {
    const signature = await signHMAC('SHA-256', secret, data);
    const isValid = await verifyHMAC('SHA-256', secret, data, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - SHA-384', async () => {
    const signature = await signHMAC('SHA-384', secret, data);
    const isValid = await verifyHMAC('SHA-384', secret, data, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - SHA-512', async () => {
    const signature = await signHMAC('SHA-512', secret, data);
    const isValid = await verifyHMAC('SHA-512', secret, data, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Binary Data', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await signHMAC('SHA-256', secret, binaryData);
    const isValid = await verifyHMAC('SHA-256', secret, binaryData, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Empty Data', async () => {
    const emptyData = '';
    const signature = await signHMAC('SHA-256', secret, emptyData);
    const isValid = await verifyHMAC('SHA-256', secret, emptyData, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Invalid Signature', async () => {
    const signature = await signHMAC('SHA-256', secret, data);
    const tamperedSignature = signature.slice(0, -2) + '00'; // Change last byte
    const isValid = await verifyHMAC(
      'SHA-256',
      secret,
      data,
      tamperedSignature,
    );
    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHMAC - Wrong Secret', async () => {
    const signature = await signHMAC('SHA-256', secret, data);
    const wrongSecret = 'wrongsecret123456789012345';
    const isValid = await verifyHMAC('SHA-256', wrongSecret, data, signature);
    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHMAC - Wrong Data', async () => {
    const signature = await signHMAC('SHA-256', secret, data);
    const wrongData = 'wrong data';
    const isValid = await verifyHMAC('SHA-256', secret, wrongData, signature);
    asserts.assertEquals(isValid, false);
  });

  await t.step('verifyHMAC - Empty Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC('SHA-256', secret, data, '');
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  await t.step('verifyHMAC - Null Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC('SHA-256', secret, data, null as any);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  await t.step('verifyHMAC - Undefined Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC('SHA-256', secret, data, undefined as any);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  await t.step('verifyHMAC - Invalid Hex Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC('SHA-256', secret, data, 'invalidhex');
      },
      Error,
      'Invalid signature format. Must be a hex string',
    );
  });

  await t.step('verifyHMAC - Odd Length Hex', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC('SHA-256', secret, data, '123'); // Odd length
      },
      Error,
      'Invalid signature format. Must be a hex string',
    );
  });

  await t.step('verifyHMAC - Known Test Vectors', async () => {
    // Test against known HMAC values
    const testCases = [
      {
        algorithm: 'SHA-1' as DigestAlgorithms,
        secret: 'abcdefghijklmnopqrstuvwx',
        data: 'my data',
        expectedSignature: 'cd02551761ed331daf90a78386a9613f19b55604',
      },
      {
        algorithm: 'SHA-256' as DigestAlgorithms,
        secret: 'abcdefghijklmnopqrstuvwx',
        data: 'my data',
        expectedSignature:
          '5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5',
      },
    ];

    for (const testCase of testCases) {
      const isValid = await verifyHMAC(
        testCase.algorithm,
        testCase.secret,
        testCase.data,
        testCase.expectedSignature,
      );
      asserts.assertEquals(isValid, true);
    }
  });

  await t.step('verifyHMAC - All Algorithms', async () => {
    const algorithms: DigestAlgorithms[] = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    for (const algo of algorithms) {
      const signature = await signHMAC(algo, secret, data);
      const isValid = await verifyHMAC(algo, secret, data, signature);
      asserts.assertEquals(isValid, true);
    }
  });

  await t.step('verifyHMAC - Long Data', async () => {
    const longData = 'a'.repeat(10000);
    const signature = await signHMAC('SHA-256', secret, longData);
    const isValid = await verifyHMAC('SHA-256', secret, longData, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Unicode Data', async () => {
    const unicodeData = '🔐 Hello 世界 🌍';
    const signature = await signHMAC('SHA-256', secret, unicodeData);
    const isValid = await verifyHMAC('SHA-256', secret, unicodeData, signature);
    asserts.assertEquals(isValid, true);
  });

  await t.step('verifyHMAC - Error Handling', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(
          'INVALID' as DigestAlgorithms,
          secret,
          data,
          'signature',
        );
      },
      Error,
      'Invalid HMAC hash. Must be SHA-1, SHA-256, SHA-384 or SHA-512',
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
      'RSA-PSS:2048:SHA-256',
      privateKeyPEM,
      testData,
    );
    const isValid = await verifyRSA(
      'RSA-PSS:2048:SHA-256',
      publicKeyPEM,
      testData,
      signature,
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
      'RSA-PSS:2048:SHA-256',
      privateKeyPEM,
      testData,
    );

    // Verify with original data (should pass)
    const validSignature = await verifyRSA(
      'RSA-PSS:2048:SHA-256',
      publicKeyPEM,
      testData,
      signature,
    );
    asserts.assertEquals(validSignature, true);

    // Verify with wrong data (should fail)
    const invalidSignature = await verifyRSA(
      'RSA-PSS:2048:SHA-256',
      publicKeyPEM,
      wrongData,
      signature,
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
        `RSA-PSS:${keySize}:SHA-256` as any,
        privateKeyPEM,
        testData,
      );
      const isValid = await verifyRSA(
        `RSA-PSS:${keySize}:SHA-256` as any,
        publicKeyPEM,
        testData,
        signature,
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
      'RSA-PSS:2048:SHA-256',
      privateKeyPEM,
      binaryData,
    );
    const isValid = await verifyRSA(
      'RSA-PSS:2048:SHA-256',
      publicKeyPEM,
      binaryData,
      signature,
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

    // Invalid mode format
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'INVALID-MODE' as any,
          publicKeyPEM,
          testData,
          validSignature,
        );
      },
      Error,
      'Invalid RSA mode format',
    );

    // Invalid signature format
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'RSA-PSS:2048:SHA-256',
          publicKeyPEM,
          testData,
          'invalid-base64!@#',
        );
      },
      Error,
      'Invalid signature format',
    );

    // Invalid PEM key
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'RSA-PSS:2048:SHA-256',
          'invalid-pem',
          testData,
          validSignature,
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
      'RSA-PSS:2048:SHA-256',
      privateKeyPEM,
      testData,
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
  await t.step('verifyRSA - Invalid mode format variations', async () => {
    const testData = 'test data';
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuGBMfmXXcQJfCj4v4LVj
-----END PUBLIC KEY-----`;
    const signature = 'dGVzdA==';

    // Test with insufficient parts
    await asserts.assertRejects(
      async () => {
        await verifyRSA('RSA-PSS' as any, publicKeyPEM, testData, signature);
      },
      Error,
      'Invalid RSA mode format',
    );

    // Test with too many parts
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'RSA-PSS:2048:SHA-256:EXTRA' as any,
          publicKeyPEM,
          testData,
          signature,
        );
      },
      Error,
      'Invalid RSA mode format',
    );

    // Test with wrong algorithm
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'RSA-OAEP:2048:SHA-256' as any,
          publicKeyPEM,
          testData,
          signature,
        );
      },
      Error,
      'Invalid RSA mode format',
    );

    // Test with empty parts
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'RSA-PSS::SHA-256' as any,
          publicKeyPEM,
          testData,
          signature,
        );
      },
      Error,
      'Invalid RSA mode format',
    );

    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'RSA-PSS:2048:' as any,
          publicKeyPEM,
          testData,
          signature,
        );
      },
      Error,
      'Invalid RSA mode format',
    );
  });

  await t.step('verifyRSA - Invalid key sizes', async () => {
    const testData = 'test data';
    const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAuGBMfmXXcQJfCj4v4LVj
-----END PUBLIC KEY-----`;
    const signature = 'dGVzdA==';

    // Test invalid key sizes
    const invalidKeySizes = ['1024', '2000', '5000', 'invalid'];

    for (const keySize of invalidKeySizes) {
      await asserts.assertRejects(
        async () => {
          await verifyRSA(
            `RSA-PSS:${keySize}:SHA-256` as any,
            publicKeyPEM,
            testData,
            signature,
          );
        },
        Error,
        'Invalid RSA key size. Must be 2048, 3072, or 4096',
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
            `RSA-PSS:2048:${hash}` as any,
            publicKeyPEM,
            testData,
            signature,
          );
        },
        Error,
        'Invalid hash algorithm. Must be SHA-256, SHA-384, or SHA-512',
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
        await verifyRSA('RSA-PSS:2048:SHA-256', publicKeyPEM, testData, '');
      },
      Error,
      'Signature must be a non-empty string',
    );

    // Test null signature
    await asserts.assertRejects(
      async () => {
        await verifyRSA(
          'RSA-PSS:2048:SHA-256',
          publicKeyPEM,
          testData,
          null as any,
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
          'RSA-PSS:2048:SHA-256',
          'not-a-pem-key',
          testData,
          signature,
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
          'RSA-PSS:2048:SHA-256',
          invalidPEM,
          testData,
          signature,
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
      'RSA-PSS:2048:SHA-384',
      privateKeyPEM,
      testData,
    );
    const isValid = await verifyRSA(
      'RSA-PSS:2048:SHA-384',
      publicKeyPEM,
      testData,
      signature,
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
      'RSA-PSS:2048:SHA-512',
      privateKeyPEM,
      testData,
    );
    const isValid = await verifyRSA(
      'RSA-PSS:2048:SHA-512',
      publicKeyPEM,
      testData,
      signature,
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
    const algorithms = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];

    for (const algo of algorithms) {
      const signature = await signHMAC(algo as DigestAlgorithms, secret, data);
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
