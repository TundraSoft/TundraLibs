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
});
