import { asserts } from '../../dev.dependencies.ts';
import { simpleId } from '../mod.ts';

Deno.test('id > simpleId', async (t) => {
  await t.step('Must generate unique ids', () => {
    const id = simpleId(), 
      iterations = 100000,  // The number of parallel executions to simulate
      generatedIds = new Set<bigint>();  // Set to store the generated IDs
    for (let i = 0; i < iterations; i++) {
      generatedIds.add(id());  // Add the ID to the set
    }
    asserts.assertEquals(generatedIds.size, iterations);  // Ensure the ID is unique
  });

  await t.step('Ensure the ID is in sequence', () => {
    const id = simpleId(), 
      res1 = id(), 
      res2 = id();
    asserts.assertEquals(res2 - res1, 1n);  // Ensure the ID is in sequence
  });

  await t.step('Change seed and length', () => {
    const id = simpleId(3251, 6), 
      res1 = id();
    asserts.assertEquals(res1.toString().length, 14);
    asserts.assertEquals(res1.toString().substring(8), '003252')
  });
});