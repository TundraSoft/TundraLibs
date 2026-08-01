import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import {
  signEC,
  signHMAC,
  signRSA,
  verifyEC,
  verifyHMAC,
  verifyRSA,
} from './mod.ts';

describe('crypt.verify', () => {
  const secret = 'abcdefghijklmnopqrstuvwx';
  const data = 'my data';

  it('verifyHMAC - SHA-1', async () => {
    const signature = await signHMAC(data, secret, { hashAlgorithm: 'SHA-1' });
    const isValid = await verifyHMAC(data, signature, secret, {
      hashAlgorithm: 'SHA-1',
    });
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - SHA-256', async () => {
    const signature = await signHMAC(data, secret);
    const isValid = await verifyHMAC(data, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - SHA-384', async () => {
    const signature = await signHMAC(data, secret, {
      hashAlgorithm: 'SHA-384',
    });
    const isValid = await verifyHMAC(data, signature, secret, {
      hashAlgorithm: 'SHA-384',
    });
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - SHA-512', async () => {
    const signature = await signHMAC(data, secret, {
      hashAlgorithm: 'SHA-512',
    });
    const isValid = await verifyHMAC(data, signature, secret, {
      hashAlgorithm: 'SHA-512',
    });
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - Binary Data', async () => {
    const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
    const signature = await signHMAC(binaryData, secret);
    const isValid = await verifyHMAC(binaryData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - Empty Data', async () => {
    const emptyData = '';
    const signature = await signHMAC(emptyData, secret);
    const isValid = await verifyHMAC(emptyData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - Invalid Signature', async () => {
    const signature = await signHMAC(data, secret);
    const tamperedSignature = signature.slice(0, -2) + '00'; // Change last byte
    const isValid = await verifyHMAC(
      data,
      tamperedSignature,
      secret,
    );
    asserts.assertEquals(isValid, false);
  });

  it('verifyHMAC - Wrong Secret', async () => {
    const signature = await signHMAC(data, secret);
    const wrongSecret = 'wrongsecret123456789012345';
    const isValid = await verifyHMAC(data, signature, wrongSecret);
    asserts.assertEquals(isValid, false);
  });

  it('verifyHMAC - Wrong Data', async () => {
    const signature = await signHMAC(data, secret);
    const wrongData = 'wrong data';
    const isValid = await verifyHMAC(wrongData, signature, secret);
    asserts.assertEquals(isValid, false);
  });

  it('verifyHMAC - Empty Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, '', secret);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  it('verifyHMAC - Null Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, null as any, secret);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  it('verifyHMAC - Undefined Signature', async () => {
    await asserts.assertRejects(
      async () => {
        // @ts-expect-error testing undefined
        await verifyHMAC(data, undefined, secret);
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  it('verifyHMAC - Invalid Hex Signature', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, 'invalidhex', secret);
      },
      Error,
      'Invalid signature format. Must be a hex string',
    );
  });

  it('verifyHMAC - Odd Length Hex', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(data, '123', secret); // Odd length
      },
      Error,
      'Invalid signature format. Must be a hex string',
    );
  });

  it('verifyHMAC - Known Test Vectors', async () => {
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

  it('verifyHMAC - All Algorithms', async () => {
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

  it('verifyHMAC - Long Data', async () => {
    const longData = 'a'.repeat(10000);
    const signature = await signHMAC(longData, secret);
    const isValid = await verifyHMAC(longData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - Unicode Data', async () => {
    const unicodeData = '🔐 Hello 世界 🌍';
    const signature = await signHMAC(unicodeData, secret);
    const isValid = await verifyHMAC(unicodeData, signature, secret);
    asserts.assertEquals(isValid, true);
  });

  it('verifyHMAC - Error Handling', async () => {
    await asserts.assertRejects(
      async () => {
        await verifyHMAC(
          data,
          'signature',
          secret,
          // @ts-expect-error invalid hash algorithm
          { hashAlgorithm: 'INVALID' },
        );
      },
      Error,
      'Invalid HMAC hash',
    );
  });

  // RSA Verification Tests
  it('verifyRSA - Basic RSA-PSS Verification', async () => {
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

  it('verifyRSA - PKCS#1 v1.5 scheme round-trip', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const priv = keys.privateKeyExported as string;
    const pub = keys.publicKeyExported as string;
    const sig = await signRSA(data, priv, { scheme: 'PKCS1' });
    asserts.assertEquals(
      await verifyRSA(data, sig, pub, { scheme: 'PKCS1' }),
      true,
    );
  });

  it('verifyRSA - PSS and PKCS1 signatures are not interchangeable', async () => {
    const { generateRSAKeyPair } = await import('../generators/key.ts');
    const keys = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const priv = keys.privateKeyExported as string;
    const pub = keys.publicKeyExported as string;
    const pssSig = await signRSA(data, priv, { scheme: 'PSS' });
    const pkcs1Sig = await signRSA(data, priv, { scheme: 'PKCS1' });
    // Same scheme verifies.
    asserts.assertEquals(
      await verifyRSA(data, pssSig, pub, { scheme: 'PSS' }),
      true,
    );
    asserts.assertEquals(
      await verifyRSA(data, pkcs1Sig, pub, { scheme: 'PKCS1' }),
      true,
    );
    // Cross scheme does not (proves they are distinct primitives).
    asserts.assertEquals(
      await verifyRSA(data, pssSig, pub, { scheme: 'PKCS1' }),
      false,
    );
    asserts.assertEquals(
      await verifyRSA(data, pkcs1Sig, pub, { scheme: 'PSS' }),
      false,
    );
  });

  it('verifyRSA - Invalid Signature Detection', async () => {
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

  it('verifyRSA - Different Key Sizes', async () => {
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
    }
  });

  it('verifyRSA - Binary Data', async () => {
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

  it('verifyRSA - Error Handling', async () => {
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
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
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

  it('verifyRSA - Invalid hash algorithms', async () => {
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
            // @ts-expect-error invalid hash algorithm
            { hashAlgorithm: hash },
          );
        },
        Error,
        'Invalid hash algorithm',
      );
    }
  });

  it('verifyRSA - Empty or invalid signature', async () => {
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
          // @ts-expect-error null signature
          null,
          publicKeyPEM,
        );
      },
      Error,
      'Signature must be a non-empty string',
    );
  });

  it('verifyRSA - Invalid PEM formats', async () => {
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
  it('verifyRSA - SHA-384 hash algorithm', async () => {
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

  it('verifyRSA - SHA-512 hash algorithm', async () => {
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

  it('verifyRSA - Hash Algorithm Must Match Signing', async () => {
    // Verify that signature verification fails when hash algorithms don't match
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

    // Sign with SHA-256
    const signature = await signRSA(
      data,
      privateKeyPEM,
      { hashAlgorithm: 'SHA-256' },
    );

    // Try to verify with SHA-512 (should fail)
    const isValid512 = await verifyRSA(
      data,
      signature,
      publicKeyPEM,
      { hashAlgorithm: 'SHA-512' },
    );
    asserts.assertEquals(isValid512, false);

    // Try to verify with SHA-384 (should fail)
    const isValid384 = await verifyRSA(
      data,
      signature,
      publicKeyPEM,
      { hashAlgorithm: 'SHA-384' },
    );
    asserts.assertEquals(isValid384, false);

    // Verify with correct algorithm (should succeed)
    const isValid256 = await verifyRSA(
      data,
      signature,
      publicKeyPEM,
      { hashAlgorithm: 'SHA-256' },
    );
    asserts.assertEquals(isValid256, true);
  });

  it('verifyRSA - PEM Format Variations', async () => {
    // Test that different PEM formatting styles work correctly
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
      String.fromCodePoint(...new Uint8Array(publicKeyRaw)),
    );
    const privateKeyBase64 = btoa(
      String.fromCodePoint(...new Uint8Array(privateKeyRaw)),
    );

    const privateKeyPEM = `-----BEGIN PRIVATE KEY-----\n${
      privateKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PRIVATE KEY-----`;

    const data = 'Test PEM format variations';
    const signature = await signRSA(data, privateKeyPEM);

    // Standard 64-character line breaks
    const standardPublicPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,64}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const valid1 = await verifyRSA(data, signature, standardPublicPEM);
    asserts.assertEquals(valid1, true);

    // No line breaks
    const singleLinePublicPEM =
      `-----BEGIN PUBLIC KEY-----\n${publicKeyBase64}\n-----END PUBLIC KEY-----`;
    const valid2 = await verifyRSA(data, signature, singleLinePublicPEM);
    asserts.assertEquals(valid2, true);

    // Extra whitespace
    const spacedPublicPEM = `-----BEGIN PUBLIC KEY-----
    ${publicKeyBase64.match(/.{1,64}/g)?.join('\n    ')}
    -----END PUBLIC KEY-----`;
    const valid3 = await verifyRSA(data, signature, spacedPublicPEM);
    asserts.assertEquals(valid3, true);

    // Different line lengths
    const irregularPublicPEM = `-----BEGIN PUBLIC KEY-----\n${
      publicKeyBase64.match(/.{1,80}/g)?.join('\n')
    }\n-----END PUBLIC KEY-----`;
    const valid4 = await verifyRSA(data, signature, irregularPublicPEM);
    asserts.assertEquals(valid4, true);
  });

  it('verifyRSA - Malformed Signature Handling', async () => {
    // Test handling of various malformed signatures
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
    const validSignature = await signRSA(data, privateKeyPEM);

    // Whitespace variations (atob strips them, should still work)
    const withNewline = validSignature.slice(0, 50) + '\n' +
      validSignature.slice(50);
    const valid1 = await verifyRSA(data, withNewline, publicKeyPEM);
    asserts.assertEquals(valid1, true);

    const withSpaces = ' ' + validSignature + ' ';
    const valid2 = await verifyRSA(data, withSpaces, publicKeyPEM);
    asserts.assertEquals(valid2, true);

    // Invalid base64 characters - use characters atob() definitely rejects
    const invalidChars = 'not_valid_base64!@#$%';
    await asserts.assertRejects(
      async () => {
        await verifyRSA(data, invalidChars, publicKeyPEM);
      },
      Error,
      'Invalid signature format',
    );

    // Truncated signature should fail verification
    const truncated = validSignature.slice(0, -20);
    const valid3 = await verifyRSA(data, truncated, publicKeyPEM);
    asserts.assertEquals(valid3, false);

    // Modified single character should fail. Pick a replacement guaranteed
    // to differ from the original character so the mutation is never a
    // no-op — a fixed 'X' silently leaves the signature unchanged (and thus
    // still valid) whenever sig[50] is already 'X', ~1/64 of the time.
    const repl = validSignature[50] === 'A' ? 'B' : 'A';
    const modified = validSignature.slice(0, 50) + repl +
      validSignature.slice(51);
    const valid4 = await verifyRSA(data, modified, publicKeyPEM);
    asserts.assertEquals(valid4, false);

    // Wrong data should fail
    const valid5 = await verifyRSA(
      'wrong data',
      validSignature,
      publicKeyPEM,
    );
    asserts.assertEquals(valid5, false);

    // Completely wrong signature should fail
    const wrongSig = btoa('this is not a real signature');
    const valid6 = await verifyRSA(data, wrongSig, publicKeyPEM);
    asserts.assertEquals(valid6, false);
  });

  it('verifyEC - round-trips on every curve and rejects tampering', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');

    for (const curve of ['P-256', 'P-384', 'P-521'] as const) {
      const keys = await generateECKeyPair({
        algorithm: 'ECDSA',
        curve,
        format: 'PEM',
        extractable: true,
      });
      const priv = keys.privateKeyExported as string;
      const pub = keys.publicKeyExported as string;

      const signature = await signEC('my data', priv);
      asserts.assertEquals(
        await verifyEC('my data', signature, pub),
        true,
        `${curve} must round-trip`,
      );
      asserts.assertEquals(
        await verifyEC('my dat a', signature, pub),
        false,
        `${curve} must reject altered data`,
      );

      // Flip one signature byte — must not verify.
      const { decodeBase64, encodeBase64 } = await import('@std/encoding');
      const raw = decodeBase64(signature);
      raw[0] = raw[0]! ^ 0xff;
      asserts.assertEquals(
        await verifyEC('my data', encodeBase64(raw), pub),
        false,
        `${curve} must reject a mutated signature`,
      );
    }
  });

  it('verifyEC - SECURITY: a DER-encoded signature is rejected', async () => {
    // JOSE requires raw R‖S (RFC 7515 §3.4). OpenSSL and most non-web tooling
    // emit ASN.1/DER instead. Accepting both would mean the same signature had
    // two valid spellings; the DER form must simply not verify.
    const { decodeBase64, encodeBase64 } = await import('@std/encoding');
    const { generateECKeyPair } = await import('../generators/key.ts');
    const keys = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });
    const priv = keys.privateKeyExported as string;
    const pub = keys.publicKeyExported as string;

    const signature = await signEC('my data', priv);
    asserts.assertEquals(await verifyEC('my data', signature, pub), true);

    // Re-encode the very same (r, s) as DER: SEQUENCE { INTEGER r, INTEGER s }.
    const raw = decodeBase64(signature);
    const toInteger = (bytes: Uint8Array): number[] => {
      let start = 0;
      while (start < bytes.length - 1 && bytes[start] === 0x00) start++;
      const body = [...bytes.slice(start)];
      // DER INTEGERs are signed; a leading high bit needs a 0x00 pad.
      if ((body[0]! & 0x80) !== 0) body.unshift(0x00);
      return [0x02, body.length, ...body];
    };
    const body = [
      ...toInteger(raw.slice(0, 32)),
      ...toInteger(raw.slice(32)),
    ];
    const der = new Uint8Array([0x30, body.length, ...body]);
    asserts.assertEquals(der[0], 0x30, 'fixture must be a DER SEQUENCE');

    asserts.assertEquals(
      await verifyEC('my data', encodeBase64(der), pub),
      false,
      'a DER-encoded signature must not verify where R‖S is required',
    );
  });

  it('verifyEC - SECURITY: wrong curve is refused, not merely invalid', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const p256 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });
    const p384 = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-384',
      format: 'PEM',
      extractable: true,
    });

    const signature = await signEC(
      'my data',
      p256.privateKeyExported as string,
    );

    // A P-256 signature offered to a P-384 key: the signature is even the
    // wrong length for that curve, and pinning makes the mismatch explicit
    // rather than letting it masquerade as a forged signature.
    await asserts.assertRejects(
      () =>
        verifyEC('my data', signature, p384.publicKeyExported as string, {
          curve: 'P-256',
        }),
      Error,
      "EC key is on curve 'P-384' but this operation needs 'P-256'",
    );

    // Unpinned, the curve is read from the key — the signature is then the
    // wrong width for P-384 and simply does not verify.
    asserts.assertEquals(
      await verifyEC('my data', signature, p384.publicKeyExported as string),
      false,
    );
  });

  it('verifyEC - SECURITY: non-EC keys are refused', async () => {
    const { generateECKeyPair, generateRSAKeyPair } = await import(
      '../generators/key.ts'
    );
    const ec = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'PEM',
      extractable: true,
    });
    const rsa = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
      extractable: true,
    });
    const signature = await signEC('my data', ec.privateKeyExported as string);

    await asserts.assertRejects(
      () => verifyEC('my data', signature, rsa.publicKeyExported as string),
      Error,
      'ECDSA needs an EC key',
    );
    await asserts.assertRejects(
      () => verifyEC('my data', signature, 'a-raw-hmac-secret'),
      Error,
      'ECDSA needs an EC key',
    );
    await asserts.assertRejects(
      () => verifyEC('my data', '', ec.publicKeyExported as string),
      Error,
      'Signature must be a non-empty string',
    );
  });

  it('verifyEC - accepts a public JWK and a CryptoKey', async () => {
    const { generateECKeyPair } = await import('../generators/key.ts');
    const keys = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'JWK',
      extractable: true,
    });
    const signature = await signEC('my data', keys.privateKey);

    asserts.assertEquals(
      await verifyEC('my data', signature, keys.publicKey),
      true,
    );
    asserts.assertEquals(
      await verifyEC(
        'my data',
        signature,
        keys.publicKeyExported as JsonWebKey,
      ),
      true,
    );
  });
});
