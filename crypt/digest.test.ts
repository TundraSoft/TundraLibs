import { assertEquals, assertRejects } from '$asserts';
import { digest, type DigestAlgorithms } from './mod.ts';

Deno.test('digest', async (t) => {
  await t.step('digest - Basic Hashing with SHA-1', async () => {
    const algorithm: DigestAlgorithms = 'SHA-1';
    const data = 'my data';

    const hash = await digest(algorithm, data);
    // console.log(hash); // Logs the SHA-1 hash of 'my data'

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
  });

  await t.step('digest - Basic Hashing with SHA-256', async () => {
    const algorithm: DigestAlgorithms = 'SHA-256';
    const data = 'my data';

    const hash = await digest(algorithm, data);
    // console.log(hash); // Logs the SHA-256 hash of 'my data'

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
  });

  await t.step('digest - Basic Hashing with SHA-384', async () => {
    const algorithm: DigestAlgorithms = 'SHA-384';
    const data = 'my data';

    const hash = await digest(algorithm, data);
    // console.log(hash); // Logs the SHA-256 hash of 'my data'

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
  });

  await t.step('digest - Basic Hashing with SHA-512', async () => {
    const algorithm: DigestAlgorithms = 'SHA-512';
    const data = 'my data';

    const hash = await digest(algorithm, data);
    // console.log(hash); // Logs the SHA-256 hash of 'my data'

    // Check that the hash is a non-empty string
    assertEquals(typeof hash, 'string');
    assertEquals(hash.length > 0, true);
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
