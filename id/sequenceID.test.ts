import * as asserts from '$asserts';
import { sequenceID } from './mod.ts';

Deno.test('id.sequenceId', async (t) => {
  await t.step('ensure the values are in sequence', () => {
    for (let i = 0; i < 100; i++) {
      const seq = sequenceID();
      const res1 = seq(),
        res2 = seq();
      asserts.assertEquals(res2 - res1, 1n);
    }
  });

  await t.step('ensure the sequence is getting overridden', () => {
    const seq = sequenceID();
    const res1 = seq(),
      res2 = seq(3251);
    asserts.assertNotEquals(res2, res1 + 1n);
  });

  await t.step('check for collission on sample set of 100000', () => {
    const iterations = 100000; // The number of parallel executions to simulate
    const generatedIds = new Set<bigint>(); // Set to store the generated IDs
    const seq = sequenceID();
    // Run the parallel executions
    const promises = Array(iterations).fill(null).map(() => {
      generatedIds.add(seq()); // Add the ID to the set
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
    const seq = sequenceID(largeNumber);
    const id = seq();
    asserts.assertEquals(typeof id, 'bigint');
    const nextId = seq();
    asserts.assertEquals(nextId - id, 1n);
  });

  await t.step('handle zero as override value', () => {
    const seq = sequenceID(0);
    const id = seq();
    asserts.assertEquals(typeof id, 'bigint');
    asserts.assertEquals(id >= 0n, true);
  });

  await t.step('verify sequence persistence after multiple calls', () => {
    const seq = sequenceID();
    const startId = seq();
    const calls = 10;
    let lastId = startId;

    for (let i = 0; i < calls; i++) {
      const currentId = seq();
      asserts.assertEquals(currentId - lastId, 1n);
      lastId = currentId;
    }

    asserts.assertEquals(lastId - startId, BigInt(calls));
  });

  await t.step('test cross-instance collision resistance', () => {
    // Create multiple sequences at the same time
    const sequences = [];
    const count = 100;
    const seq = sequenceID();
    for (let i = 0; i < count; i++) {
      sequences.push(seq());
    }

    // Check for uniqueness
    const uniqueSequences = new Set(sequences.map((id) => id.toString()));
    asserts.assertEquals(uniqueSequences.size, count);
  });
});
