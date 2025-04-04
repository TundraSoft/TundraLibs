import { assertEquals, assertRejects } from '$asserts';
import { digest, type DigestAlgorithms } from './mod.ts';

Deno.test('digest', async (t) => {
  await t.step('digest - Basic Hashing with SHA-1', async () => {
    const algorithm: DigestAlgorithms = 'SHA-1';
    const data = 'my data';

    const hash = await digest(algorithm, data);

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 40); // SHA-1 produces a 40-character hex string
    assertEquals(hash, 'fee95d29ae5926af3375e2eb3a688471de0a2c3e'); // Expected SHA-1 hash for 'my data'
  });

  await t.step('digest - Basic Hashing with SHA-256', async () => {
    const algorithm: DigestAlgorithms = 'SHA-256';
    const data = 'my data';

    const hash = await digest(algorithm, data);

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 64); // SHA-256 produces a 64-character hex string
    assertEquals(
      hash,
      'b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de',
    ); // Expected SHA-256 hash for 'my data'
  });

  await t.step('digest - Basic Hashing with SHA-384', async () => {
    const algorithm: DigestAlgorithms = 'SHA-384';
    const data = 'my data';

    const hash = await digest(algorithm, data);

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 96); // SHA-384 produces a 96-character hex string
    assertEquals(
      hash,
      'b7c0bb5d851bba5d604d192053ef697502738bde726171c7a82fbfb2f6e271ae9b932bf5277d507ef50115849712d91e',
    ); // Expected SHA-384 hash for 'my data'
  });

  await t.step('digest - Basic Hashing with SHA-512', async () => {
    const algorithm: DigestAlgorithms = 'SHA-512';
    const data = 'my data';

    const hash = await digest(algorithm, data);

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
    assertEquals(hash.length, 128); // SHA-512 produces a 128-character hex string
    assertEquals(
      hash,
      '6e5f36e9cee5cba6ad938977c98e12f3a61fc4d944753ad130116b026b8ab2c895878910fea3b47dba6d760a20d0b23233980a8dab13f04f262c53f25222b416',
    ); // Expected SHA-512 hash for 'my data'
  });

  await t.step('digest - Empty Input', async () => {
    const algorithm: DigestAlgorithms = 'SHA-256';
    const data = '';

    const hash = await digest(algorithm, data);
    assertEquals(
      hash,
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    ); // SHA-256 of empty string
  });

  await t.step('digest - Binary Input (Uint8Array)', async () => {
    const algorithm: DigestAlgorithms = 'SHA-256';
    const data = new Uint8Array([109, 121, 32, 100, 97, 116, 97]); // "my data" as binary

    const hash = await digest(algorithm, data);
    assertEquals(
      hash,
      'b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de',
    );
  });

  await t.step('digest - Invalid Algorithm', async () => {
    const algorithm = 'INVALID-ALGO' as DigestAlgorithms;
    const data = 'my data';

    await assertRejects(
      async () => {
        await digest(algorithm, data);
      },
      Error,
      'The provided algorithm name is not supported',
    );
  });
});
