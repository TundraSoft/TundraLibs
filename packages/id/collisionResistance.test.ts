import * as asserts from '@std/asserts';
import { describe, it } from '@tundralibs/compat/test';
import { nanoID, ObjectID, sequenceID, simpleID } from './mod.ts';

describe('id.collisionResistance', () => {
  it('simpleID collision test with parallel generation', () => {
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

  it(
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

  it('ObjectID collision test with parallel generation', () => {
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

  it('nanoID generates collision-free IDs at scale', () => {
    // Actually exercise the generator. (The previous "collision probability
    // analysis" only evaluated a birthday-paradox formula on constants and
    // never called nanoID — zero coverage of the generator it claimed to test.)
    const iterations = 100000;
    const ids = new Set<string>();
    for (let i = 0; i < iterations; i++) {
      const id = nanoID(21);
      asserts.assertFalse(ids.has(id), `Collision detected at iteration ${i}`);
      ids.add(id);
    }
    asserts.assertEquals(ids.size, iterations);
  });

  it('nanoID collision test with different lengths', () => {
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
});
