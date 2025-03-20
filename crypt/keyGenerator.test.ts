import * as asserts from '$asserts';
import { keyGenerator } from './mod.ts';

Deno.test('id > generateKey', async (t) => {
  await t.step('Check if the length is as specified', () => {
    for (let i = 6; i <= 40; i++) {
      asserts.assertEquals(keyGenerator(i).length, i);
    }
  });

  await t.step('Check if Prefix is added', () => {
    asserts.assertEquals(keyGenerator(6, 'abc').startsWith('abc'), true);
  });

  await t.step('Check if hyphens are added', () => {
    asserts.assertEquals(keyGenerator(6, '', 2).length, 8);
    asserts.assertMatch(
      keyGenerator(6, '', 2),
      /^[a-z0-9]{2}\-[a-z0-9]{2}\-[a-z0-9]{2}$/, // NOSONAR
    );
  });

  await t.step('Check if hyphens are added with prefix', () => {
    asserts.assertEquals(keyGenerator(6, 'abc', 2).length, 11);
    asserts.assertMatch(
      keyGenerator(6, 'abc', 2),
      /^abc[a-z0-9]{2}\-[a-z0-9]{2}\-[a-z0-9]{2}$/, // NOSONAR
    );
  });

  await t.step('Check without hyphens', () => {
    asserts.assertEquals(keyGenerator(6, 'abc', 2).length, 11);
    asserts.assertMatch(
      keyGenerator(6, 'abc', 0),
      /^abc[a-z0-9]{2}[a-z0-9]{2}[a-z0-9]{2}$/, // NOSONAR
    );
    asserts.assertThrows(() =>
      keyGenerator(6, 'abc', 'asdf' as unknown as number)
    );
  });

  await t.step('Check for collission on sample set of 100000', () => {
    const iterations = 100000; // The number of parallel executions to simulate
    const generatedIds = new Set<string>(); // Set to store the generated IDs

    // Run the parallel executions
    const promises = Array(iterations).fill(null).map(() => {
      generatedIds.add(keyGenerator()); // Add the ID to the set
    });

    // Wait for all parallel executions to complete
    return Promise.all(promises)
      .then(() => {
        asserts.assertEquals(generatedIds.size, iterations);
      });
  });
});
