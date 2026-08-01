import { assertEquals, assertRejects } from '@std/asserts';
import { describe, it } from '@tundralibs/compat';
import {
  digest,
  type DigestAlgorithms,
  sha1,
  sha256,
  sha384,
  sha512,
} from './mod.ts';

describe('crypt.digest', () => {
  it('digest - Basic Hashing with SHA-1', async () => {
    const data = 'my data';

    const hash = await digest(data, { algorithm: 'SHA-1' });

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 40); // SHA-1 produces a 40-character hex string
    assertEquals(hash, 'fee95d29ae5926af3375e2eb3a688471de0a2c3e'); // Expected SHA-1 hash for 'my data'
  });

  it('digest - Basic Hashing with SHA-256', async () => {
    const data = 'my data';

    // Test with default SHA-256
    const hash = await digest(data);

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 64); // SHA-256 produces a 64-character hex string
    assertEquals(
      hash,
      'b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de',
    ); // Expected SHA-256 hash for 'my data'
  });

  it('digest - Basic Hashing with SHA-384', async () => {
    const data = 'my data';

    const hash = await digest(data, { algorithm: 'SHA-384' });

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 96); // SHA-384 produces a 96-character hex string
    assertEquals(
      hash,
      'b7c0bb5d851bba5d604d192053ef697502738bde726171c7a82fbfb2f6e271ae9b932bf5277d507ef50115849712d91e',
    ); // Expected SHA-384 hash for 'my data'
  });

  it('digest - Basic Hashing with SHA-512', async () => {
    const data = 'my data';

    const hash = await digest(data, { algorithm: 'SHA-512' });

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 128); // SHA-512 produces a 128-character hex string
    assertEquals(
      hash,
      '6e5f36e9cee5cba6ad938977c98e12f3a61fc4d944753ad130116b026b8ab2c895878910fea3b47dba6d760a20d0b23233980a8dab13f04f262c53f25222b416',
    ); // Expected SHA-512 hash for 'my data'
  });

  it('digest - Empty Input', async () => {
    const data = '';

    const hash = await digest(data);
    assertEquals(
      hash,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ); // SHA-256 of empty string
  });

  it('digest - Binary Input (Uint8Array)', async () => {
    const data = new Uint8Array([109, 121, 32, 100, 97, 116, 97]); // "my data" as binary

    const hash = await digest(data);
    assertEquals(
      hash,
      'b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de',
    );
  });

  it('digest - Invalid Algorithm', async () => {
    const data = 'my data';

    await assertRejects(
      async () => {
        await digest(data, { algorithm: 'INVALID-ALGO' as DigestAlgorithms });
      },
      Error,
      'The provided algorithm name is not supported',
    );
  });

  it('digest - Base64 Encoding', async () => {
    const data = 'my data';

    // SHA-256 with base64 encoding
    const hash = await digest(data, { encoding: 'base64' });
    assertEquals(typeof hash, 'string');
    assertEquals(hash, 'shZ7Cqfvd5R0CwVax6iApSk0qmfvHKaIetgdzO/Vud4=');
  });

  it('digest - SHA-512 with Base64', async () => {
    const data = 'my data';

    const hash = await digest(data, {
      algorithm: 'SHA-512',
      encoding: 'base64',
    });
    assertEquals(typeof hash, 'string');
    // Verify it's valid base64
    assertEquals(/^[A-Za-z0-9+/]+=*$/.exec(hash) !== null, true);
  });

  // Convenience function tests
  it('sha256 - Convenience Function', async () => {
    const data = 'my data';
    const hash = await sha256(data);

    assertEquals(
      hash,
      'b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de',
    );
  });

  it('sha256 - Base64 Encoding', async () => {
    const data = 'my data';
    const hash = await sha256(data, 'base64');

    assertEquals(hash, 'shZ7Cqfvd5R0CwVax6iApSk0qmfvHKaIetgdzO/Vud4=');
  });

  it('sha512 - Convenience Function', async () => {
    const data = 'my data';
    const hash = await sha512(data);

    assertEquals(
      hash,
      '6e5f36e9cee5cba6ad938977c98e12f3a61fc4d944753ad130116b026b8ab2c895878910fea3b47dba6d760a20d0b23233980a8dab13f04f262c53f25222b416',
    );
  });

  it('sha384 - Convenience Function', async () => {
    const data = 'my data';
    const hash = await sha384(data);

    assertEquals(
      hash,
      'b7c0bb5d851bba5d604d192053ef697502738bde726171c7a82fbfb2f6e271ae9b932bf5277d507ef50115849712d91e',
    );
  });

  it('sha1 - Convenience Function', async () => {
    const data = 'my data';
    const hash = await sha1(data);

    assertEquals(hash, 'fee95d29ae5926af3375e2eb3a688471de0a2c3e');
  });

  it('sha1 - Base64 Encoding', async () => {
    const data = 'my data';
    const hash = await sha1(data, 'base64');

    assertEquals(typeof hash, 'string');
    // Verify it's valid base64
    assertEquals(/^[A-Za-z0-9+/]+=*$/.exec(hash) !== null, true);
  });

  it('Convenience Functions - Binary Data', async () => {
    const binaryData = new Uint8Array([109, 121, 32, 100, 97, 116, 97]); // "my data"

    const hash256 = await sha256(binaryData);
    const hash512 = await sha512(binaryData);
    const hash384 = await sha384(binaryData);
    const hash1 = await sha1(binaryData);

    assertEquals(
      hash256,
      'b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de',
    );
    assertEquals(
      hash512,
      '6e5f36e9cee5cba6ad938977c98e12f3a61fc4d944753ad130116b026b8ab2c895878910fea3b47dba6d760a20d0b23233980a8dab13f04f262c53f25222b416',
    );
    assertEquals(
      hash384,
      'b7c0bb5d851bba5d604d192053ef697502738bde726171c7a82fbfb2f6e271ae9b932bf5277d507ef50115849712d91e',
    );
    assertEquals(hash1, 'fee95d29ae5926af3375e2eb3a688471de0a2c3e');
  });

  it('digest - Large Data Hashing', async () => {
    // Test with large data (1MB)
    const largeData = 'a'.repeat(1024 * 1024);
    const hash = await digest(largeData);

    assertEquals(typeof hash, 'string');
    assertEquals(hash.length, 64); // SHA-256

    // Verify consistency with same data
    const hash2 = await digest(largeData);
    assertEquals(hash, hash2);
  });

  it('digest - Unicode Data Handling', async () => {
    // Test with various unicode characters
    const unicodeData = 'Hello 世界 🌍 مرحبا Привет';
    const hash = await digest(unicodeData);

    assertEquals(typeof hash, 'string');
    assertEquals(hash.length, 64);

    // Should be consistent
    const hash2 = await digest(unicodeData);
    assertEquals(hash, hash2);

    // Different unicode should give different hashes
    const differentUnicode = 'Hello 世界 🌍 مرحبا';
    const hash3 = await digest(differentUnicode);
    assertEquals(hash !== hash3, true);
  });

  it('digest - Binary Data Variations', async () => {
    // Test with various binary patterns
    const testCases = [
      new Uint8Array([0, 0, 0, 0]),
      new Uint8Array([255, 255, 255, 255]),
      new Uint8Array([0, 128, 255, 1]),
      new Uint8Array(Array.from({ length: 256 }, (_, i) => i)), // 0-255
    ];

    for (const data of testCases) {
      const hash = await digest(data);
      assertEquals(typeof hash, 'string');
      assertEquals(hash.length, 64);

      // Verify consistency
      const hash2 = await digest(data);
      assertEquals(hash, hash2);
    }
  });

  it('digest - Consistency Across Calls', async () => {
    const data = 'consistency test data';
    const hashes = [];

    // Generate same hash multiple times
    for (let i = 0; i < 5; i++) {
      hashes.push(await digest(data));
    }

    // All hashes should be identical
    for (let i = 1; i < hashes.length; i++) {
      assertEquals(hashes[0], hashes[i]);
    }
  });

  it('digest - All Algorithm Consistency', async () => {
    const data = 'test all algorithms';
    const algorithms: DigestAlgorithms[] = [
      'SHA-1',
      'SHA-256',
      'SHA-384',
      'SHA-512',
    ];

    for (const algorithm of algorithms) {
      const hash1 = await digest(data, { algorithm });
      const hash2 = await digest(data, { algorithm });
      assertEquals(hash1, hash2, `${algorithm} should be consistent`);
    }
  });
});
