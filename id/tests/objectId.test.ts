import { asserts } from '../../dev.dependencies.ts';
import { ObjectId } from '../mod.ts';

Deno.test('id > objectId', async (t) => {
  await t.step('Must generate unique ids', () => {
    const id = ObjectId(),
      iterations = 100000, // The number of parallel executions to simulate
      generatedIds = new Set<string>(); // Set to store the generated IDs
    for (let i = 0; i < iterations; i++) {
      generatedIds.add(id()); // Add the ID to the set
    }
    asserts.assertEquals(generatedIds.size, iterations); // Ensure the ID is unique
  });

  await t.step('Ensure the ID is in sequence', () => {
    const id = ObjectId(),
      res1 = id(),
      res2 = id();
    asserts.assertEquals(
      parseInt(res2.substring(res2.length - 1)) -
        parseInt(res1.substring(res1.length - 1)),
      1,
    ); // Ensure the ID is in sequence
  });

  await t.step('Change seed and length', () => {
    const id = ObjectId(3251),
      res1 = id();
    asserts.assertEquals(res1.endsWith('3252'), true);
  });

  await t.step('Custom machine ID', () => {
    const id = ObjectId(0, 'aaa'),
      res1 = id();
    asserts.assertEquals(res1.substring(8, 11), 'aaa');
  });
});
