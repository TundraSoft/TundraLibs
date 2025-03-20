import * as asserts from '$asserts';
import { sequenceID } from './mod.ts';

Deno.test('id.sequenceId', async (t) => {
  await t.step('ensure the values are in sequence', () => {
    for (let i = 0; i < 100; i++) {
      const res1 = sequenceID(),
        res2 = sequenceID();
      asserts.assertEquals(res2 - res1, 1n);
    }
  });

  await t.step('ensure the sequence is getting overridden', () => {
    const res1 = sequenceID(),
      res2 = sequenceID(3251);
    asserts.assertNotEquals(res2, res1 + 1n);
  });

  await t.step('check for collission on sample set of 100000', () => {
    const iterations = 100000; // The number of parallel executions to simulate
    const generatedIds = new Set<bigint>(); // Set to store the generated IDs

    // Run the parallel executions
    const promises = Array(iterations).fill(null).map(() => {
      generatedIds.add(sequenceID()); // Add the ID to the set
    });

    // Wait for all parallel executions to complete
    return Promise.all(promises)
      .then(() => {
        asserts.assertEquals(generatedIds.size, iterations);
      });
  });

  // Additional test cases
  await t.step('handle very large override values', () => {
    const largeNumber = Number.MAX_SAFE_INTEGER;
    const id = sequenceID(largeNumber);
    asserts.assertEquals(typeof id, 'bigint');
    const nextId = sequenceID();
    asserts.assertEquals(nextId - id, 1n);
  });

  await t.step('handle zero as override value', () => {
    const id = sequenceID(0);
    asserts.assertEquals(typeof id, 'bigint');
    asserts.assertEquals(id >= 0n, true);
  });

  await t.step('verify sequence persistence after multiple calls', () => {
    const startId = sequenceID();
    const calls = 10;
    let lastId = startId;

    for (let i = 0; i < calls; i++) {
      const currentId = sequenceID();
      asserts.assertEquals(currentId - lastId, 1n);
      lastId = currentId;
    }

    asserts.assertEquals(lastId - startId, BigInt(calls));
  });
});
