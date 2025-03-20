import * as asserts from '$asserts';
import { simpleID } from './mod.ts';

Deno.test('id.simpleId', async (t) => {
  await t.step('Must generate unique ids', () => {
    const id = simpleID(),
      iterations = 100000, // The number of parallel executions to simulate
      generatedIds = new Set<bigint>(); // Set to store the generated IDs
    for (let i = 0; i < iterations; i++) {
      generatedIds.add(id()); // Add the ID to the set
    }
    asserts.assertEquals(generatedIds.size, iterations); // Ensure the ID is unique
  });

  await t.step('Ensure the ID is in sequence', () => {
    const id = simpleID(),
      res1 = id(),
      res2 = id();
    asserts.assertEquals(res2 - res1, 1n); // Ensure the ID is in sequence
  });

  await t.step('Change seed and length', () => {
    const id = simpleID(3251, 6),
      res1 = id();
    asserts.assertEquals(res1.toString().length, 14);
    asserts.assertEquals(res1.toString().substring(8), '003252');
  });

  // Additional test cases
  await t.step('Test minimum length padding with different values', () => {
    // Test with minLen = 2
    const id1 = simpleID(5, 2);
    asserts.assertEquals(id1().toString().substring(8), '06');

    // Test with minLen = 10
    const id2 = simpleID(42, 10);
    asserts.assertEquals(id2().toString().substring(8), '0000000043');
  });

  await t.step('Test with zero as seed value', () => {
    const id = simpleID(0, 3);
    const result = id();
    asserts.assertEquals(result.toString().substring(8), '001');
  });

  await t.step('Test date portion formatting', () => {
    const id = simpleID();
    const result = id().toString();
    const datePart = result.substring(0, 8);

    const today = new Date();
    const expectedDatePart = `${today.getFullYear()}${
      String(today.getMonth() + 1).padStart(2, '0')
    }${String(today.getDate()).padStart(2, '0')}`;

    asserts.assertEquals(datePart, expectedDatePart);
  });

  await t.step('Test consecutive calls with same date', () => {
    const id = simpleID(100, 5);
    const results = [id(), id(), id(), id(), id()];

    // Check that the date part stays the same
    const datePart = results[0]!.toString().substring(0, 8);
    for (const result of results) {
      asserts.assertEquals(result.toString().substring(0, 8), datePart);
    }

    // Check sequential counter values
    for (let i = 1; i < results.length; i++) {
      asserts.assertEquals(results[i]! - results[i - 1]!, 1n);
    }
  });

  await t.step('Test if the counter resets on a new day', () => {
    // Save original Date constructor
    const OriginalDate = Date;

    try {
      const OriginalDate = Date;
      const dt = new Date(2023, 0, 2, 12, 0, 0);

      // @ts-ignore: Mocking Date for testing
      globalThis.Date = class extends OriginalDate {
        constructor() {
          super();
          return dt;
        }
      };

      const id = simpleID(0, 4);

      asserts.assertEquals(id(), 202301020001n);

      globalThis.Date = OriginalDate;

      // Check that the date part changed and seed reset
      asserts.assertNotEquals(id(), 202301020002n);
    } finally {
      // Restore original Date constructor
      globalThis.Date = OriginalDate;
    }
  });
});
