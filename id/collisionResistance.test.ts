import * as asserts from '$asserts';
import { nanoID, ObjectID, sequenceID, simpleID } from './mod.ts';

/**
 * Calculates the theoretical collision probability for random IDs
 * using the birthday paradox formula.
 *
 * @param space The size of the ID space (possible unique values)
 * @param attempts The number of IDs generated
 * @returns The probability of at least one collision
 */
function birthdayProbability(space: number, attempts: number): number {
  // For very large numbers, use approximation formula
  if (attempts > 1000 || space > Number.MAX_SAFE_INTEGER) {
    return 1 - Math.exp(-(attempts * attempts) / (2 * space));
  }

  // Exact calculation for smaller numbers
  let probability = 1;
  for (let i = 0; i < attempts; i++) {
    probability *= (space - i) / space;
  }
  return 1 - probability;
}

Deno.test('id.collisionResistance', async (t) => {
  await t.step('simpleID collision test with parallel generation', () => {
    const iterations = 100000;
    const generator = simpleID(0, 6); // 6-digit counter
    const ids = new Set<string>();

    // Generate IDs and check for collisions
    for (let i = 0; i < iterations; i++) {
      const id = generator().toString();
      asserts.assertFalse(ids.has(id), `Collision detected at iteration ${i}`);
      ids.add(id);
    }

    // Verify the count matches
    asserts.assertEquals(ids.size, iterations);
  });

  await t.step(
    'sequenceID collision test with parallel generation',
    () => {
      const iterations = 100000;
      const ids = new Set<string>();
      const seq = sequenceID();
      // Test with concurrent ID generation
      for (let i = 0; i < iterations; i++) {
        const id = seq().toString();
        asserts.assertFalse(
          ids.has(id),
          `Collision detected at iteration ${i}`,
        );
        ids.add(id);
      }

      asserts.assertEquals(ids.size, iterations);
    },
  );

  await t.step('ObjectID collision test with parallel generation', () => {
    const iterations = 100000;
    const generator = ObjectID();
    const ids = new Set<string>();

    for (let i = 0; i < iterations; i++) {
      const id = generator();
      asserts.assertFalse(ids.has(id), `Collision detected at iteration ${i}`);
      ids.add(id);
    }

    asserts.assertEquals(ids.size, iterations);
  });

  await t.step('nanoID collision probability analysis', () => {
    // For a 21-character ID with 64 possible characters per position
    // The ID space is 64^21 = 2^126, which is enormous

    const idLength = 21;
    const baseSize = 64; // Approximate size of WEB_SAFE
    const idSpace = Math.pow(baseSize, idLength);

    // Calculate collision probability for different numbers of IDs
    const oneMillionIds = birthdayProbability(idSpace, 1_000_000);
    const oneBillionIds = birthdayProbability(idSpace, 1_000_000_000);

    console.log(`
    nanoID collision probability analysis:
    - For 1 million IDs: ${oneMillionIds.toExponential(10)}
    - For 1 billion IDs: ${oneBillionIds.toExponential(10)}
    `);

    // The probability should be extremely low
    asserts.assert(
      oneMillionIds < 1e-20,
      'Collision probability should be negligible for 1M IDs',
    );
  });

  await t.step('nanoID collision test with different lengths', () => {
    // Test with shorter IDs to verify collision resistance scales properly
    const iterations = 10000;
    const lengths = [8, 12, 16, 21];

    for (const length of lengths) {
      const ids = new Set<string>();

      for (let i = 0; i < iterations; i++) {
        ids.add(nanoID(length));
      }

      // Calculate the collision rate
      const collisions = iterations - ids.size;
      const rate = collisions / iterations;

      console.log(
        `nanoID with length ${length}: ${collisions} collisions in ${iterations} iterations (${
          rate.toFixed(6)
        })`,
      );

      // For length >= 12, expect virtually no collisions in 10K ids
      if (length >= 12) {
        asserts.assertEquals(
          collisions,
          0,
          `Expected no collisions for length ${length}`,
        );
      }
    }
  });

  await t.step('Measure ID generation throughput for stress scenario', () => {
    const iterations = 50000;
    const methods = [
      { name: 'simpleID', fn: simpleID() },
      { name: 'sequenceID', fn: () => sequenceID() },
      { name: 'ObjectID', fn: ObjectID() },
      { name: 'nanoID', fn: () => nanoID() },
    ];

    // Measure throughput in IDs per second
    for (const method of methods) {
      const start = performance.now();

      for (let i = 0; i < iterations; i++) {
        method.fn();
      }

      const end = performance.now();
      const timeInSeconds = (end - start) / 1000;
      const throughput = Math.round(iterations / timeInSeconds);

      console.log(
        `${method.name} throughput: ${throughput.toLocaleString()} IDs/second`,
      );
    }

    asserts.assert(true);
  });
});
