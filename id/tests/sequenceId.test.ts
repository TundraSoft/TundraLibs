import { sequenceId } from '../mod.ts';
import {
  assertEquals,
  assertMatch,
  assertNotEquals,
  describe, 
  it
} from '../../dev.dependencies.ts';

describe('[library="id" mode="sequenceId"]', () => {

  it('Ensure the values are in sequence', () => {
    for (let i = 0; i < 100; i++) {
      const res1 = sequenceId(),
        res2 = sequenceId();
      assertEquals(res2 - res1, 1n);
    }
  });

  it('Ensure the sequence is getting overridden', () => {
    const res1 = sequenceId(),
      res2 = sequenceId(3251);
    assertNotEquals(res2, res1 + 1n);
  });

  it('Check for collission on sample set of 100000', () => {
    const iterations = 100000; // The number of parallel executions to simulate
    const generatedIds = new Set<bigint>(); // Set to store the generated IDs

    // Run the parallel executions
    const promises = Array(iterations).fill(null).map(() => {
      generatedIds.add(sequenceId()); // Add the ID to the set
    });

    // Wait for all parallel executions to complete
    return Promise.all(promises)
      .then(() => {
        assertEquals(generatedIds.size, iterations);
      });
  });
});