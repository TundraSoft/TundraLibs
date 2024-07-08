import { sequenceId } from '../mod.ts';
import { asserts } from '../../dev.dependencies.ts';

Deno.test('id:sequenceId', async (t) => {
  await t.step('Ensure the values are in sequence', () => {
    for (let i = 0; i < 100; i++) {
      const res1 = sequenceId(),
        res2 = sequenceId();
      asserts.assertEquals(res2 - res1, 1n);
    }
  });

  await t.step('Ensure the sequence is getting overridden', () => {
    const res1 = sequenceId(),
      res2 = sequenceId(3251);
    asserts.assertNotEquals(res2, res1 + 1n);
  });

  await t.step('Check for collission on sample set of 100000', () => {
    const iterations = 100000; // The number of parallel executions to simulate
    const generatedIds = new Set<bigint>(); // Set to store the generated IDs

    // Run the parallel executions
    const promises = Array(iterations).fill(null).map(() => {
      generatedIds.add(sequenceId()); // Add the ID to the set
    });

    // Wait for all parallel executions to complete
    return Promise.all(promises)
      .then(() => {
        asserts.assertEquals(generatedIds.size, iterations);
      });
  });
});
