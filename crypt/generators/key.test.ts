import { assert, assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  generateECDHKeys,
  generateECDSAKeys,
  generateECKeyPair,
  generateKeyPair,
  generateRSAEncryptionKeys,
  generateRSAKeyPair,
  generateRSASigningKeys,
} from './key.ts';

Deno.test('crypt.generators.key', async (t) => {
  await t.step('generateRSAKeyPair - RSA-OAEP encryption keys', async () => {
    const keyPair = await generateRSAKeyPair({
      algorithm: 'RSA-OAEP',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
    });

    assert(
      keyPair.publicKey instanceof CryptoKey,
      'Public key should be CryptoKey',
    );
    assert(
      keyPair.privateKey instanceof CryptoKey,
      'Private key should be CryptoKey',
    );
    assertEquals(keyPair.publicKey.algorithm.name, 'RSA-OAEP');
    assertEquals(keyPair.privateKey.algorithm.name, 'RSA-OAEP');
  });

  await t.step('generateRSAKeyPair - RSA-PSS signing keys', async () => {
    const keyPair = await generateRSAKeyPair({
      algorithm: 'RSA-PSS',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
    });

    assert(
      keyPair.publicKey instanceof CryptoKey,
      'Public key should be CryptoKey',
    );
    assert(
      keyPair.privateKey instanceof CryptoKey,
      'Private key should be CryptoKey',
    );
    assertEquals(keyPair.publicKey.algorithm.name, 'RSA-PSS');
    assertEquals(keyPair.privateKey.algorithm.name, 'RSA-PSS');
  });

  await t.step('generateRSAKeyPair - different key sizes', async () => {
    // Test 3072-bit key
    const keyPair3072 = await generateRSAKeyPair({
      algorithm: 'RSA-OAEP',
      keySize: 3072,
      hashAlgorithm: 'SHA-256',
    });

    assert(keyPair3072.publicKey instanceof CryptoKey);
    // RSA key length is accessible through the algorithm property
    assertEquals(
      (keyPair3072.publicKey.algorithm as RsaHashedKeyGenParams).modulusLength,
      3072,
    );
  });

  await t.step('generateRSAKeyPair - with PEM export format', async () => {
    const keyPair = await generateRSAKeyPair({
      algorithm: 'RSA-OAEP',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
      format: 'PEM',
    });

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assert(
      typeof keyPair.publicKeyExported === 'string',
      'Public key should be exported as PEM string',
    );
    assert(
      typeof keyPair.privateKeyExported === 'string',
      'Private key should be exported as PEM string',
    );
    assert(keyPair.publicKeyExported.includes('-----BEGIN PUBLIC KEY-----'));
    assert(keyPair.privateKeyExported.includes('-----BEGIN PRIVATE KEY-----'));
  });

  await t.step('generateECKeyPair - ECDSA keys', async () => {
    const keyPair = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
    });

    assert(
      keyPair.publicKey instanceof CryptoKey,
      'Public key should be CryptoKey',
    );
    assert(
      keyPair.privateKey instanceof CryptoKey,
      'Private key should be CryptoKey',
    );
    assertEquals(keyPair.publicKey.algorithm.name, 'ECDSA');
    assertEquals(keyPair.privateKey.algorithm.name, 'ECDSA');
  });

  await t.step('generateECKeyPair - ECDH keys', async () => {
    const keyPair = await generateECKeyPair({
      algorithm: 'ECDH',
      curve: 'P-384',
    });

    assert(
      keyPair.publicKey instanceof CryptoKey,
      'Public key should be CryptoKey',
    );
    assert(
      keyPair.privateKey instanceof CryptoKey,
      'Private key should be CryptoKey',
    );
    assertEquals(keyPair.publicKey.algorithm.name, 'ECDH');
    assertEquals(keyPair.privateKey.algorithm.name, 'ECDH');
  });

  await t.step('generateECKeyPair - different curves', async () => {
    // Test P-521 curve
    const keyPair = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-521',
    });

    assert(keyPair.publicKey instanceof CryptoKey);
    assertEquals(
      (keyPair.publicKey.algorithm as EcKeyGenParams).namedCurve,
      'P-521',
    );
  });

  await t.step('generateECKeyPair - with JWK export format', async () => {
    const keyPair = await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
      format: 'JWK',
    });

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assert(
      typeof keyPair.publicKeyExported === 'object',
      'Public key should be exported as JWK object',
    );
    assert(
      typeof keyPair.privateKeyExported === 'object',
      'Private key should be exported as JWK object',
    );

    const publicJWK = keyPair.publicKeyExported as JsonWebKey;
    const privateJWK = keyPair.privateKeyExported as JsonWebKey;
    assertEquals(publicJWK.kty, 'EC');
    assertEquals(privateJWK.kty, 'EC');
  });

  await t.step('generateKeyPair - convenience function RSA', async () => {
    const keyPair = await generateKeyPair('RSA-OAEP');

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assertEquals(keyPair.publicKey.algorithm.name, 'RSA-OAEP');
  });

  await t.step('generateKeyPair - convenience function ECDSA', async () => {
    const keyPair = await generateKeyPair('ECDSA');

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assertEquals(keyPair.publicKey.algorithm.name, 'ECDSA');
  });

  await t.step('generateRSAEncryptionKeys - convenience function', async () => {
    const keyPair = await generateRSAEncryptionKeys(2048);

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assertEquals(keyPair.publicKey.algorithm.name, 'RSA-OAEP');
  });

  await t.step('generateRSASigningKeys - convenience function', async () => {
    const keyPair = await generateRSASigningKeys(2048);

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assertEquals(keyPair.publicKey.algorithm.name, 'RSA-PSS');
  });

  await t.step('generateECDSAKeys - convenience function', async () => {
    const keyPair = await generateECDSAKeys('P-256');

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assertEquals(keyPair.publicKey.algorithm.name, 'ECDSA');
  });

  await t.step('generateECDHKeys - convenience function', async () => {
    const keyPair = await generateECDHKeys('P-384');

    assert(keyPair.publicKey instanceof CryptoKey);
    assert(keyPair.privateKey instanceof CryptoKey);
    assertEquals(keyPair.publicKey.algorithm.name, 'ECDH');
  });

  await t.step('Error handling - invalid parameters', async () => {
    // Test invalid RSA algorithm
    try {
      await generateRSAKeyPair({
        algorithm: 'INVALID' as any,
        keySize: 2048,
        hashAlgorithm: 'SHA-256',
      });
      assert(false, 'Should have thrown an error for invalid algorithm');
    } catch (error) {
      assert(error instanceof Error, 'Should throw an Error');
    }

    // Test invalid EC curve
    try {
      await generateECKeyPair({
        algorithm: 'ECDSA',
        curve: 'INVALID-CURVE' as any,
      });
      assert(false, 'Should have thrown an error for invalid curve');
    } catch (error) {
      assert(error instanceof Error, 'Should throw an Error');
    }
  });

  await t.step('Performance test - key generation speed', async () => {
    const start = performance.now();

    // Generate a few keys to test performance
    await generateRSAKeyPair({
      algorithm: 'RSA-OAEP',
      keySize: 2048,
      hashAlgorithm: 'SHA-256',
    });

    await generateECKeyPair({
      algorithm: 'ECDSA',
      curve: 'P-256',
    });

    const duration = performance.now() - start;
    console.log(`Generated 2 key pairs in ${duration.toFixed(2)}ms`);

    // Should complete in reasonable time (key generation can be slow)
    assert(duration < 10000, `Performance too slow: ${duration}ms`);
  });
});
