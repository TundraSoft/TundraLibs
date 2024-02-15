import { cryptoKey } from '../mod.ts';
import {
  assertEquals,
  assertMatch,
  describe,
  it,
} from '../../dev.dependencies.ts';

describe('id', () => {
  describe('cryptoKey', () => {
    it('Check if the length is as specified', () => {
      for (let i = 6; i <= 40; i++) {
        assertEquals(cryptoKey(i).length, i);
      }
    });

    it('Check if Prefix is added', () => {
      assertEquals(cryptoKey(6, 'abc').startsWith('abc'), true);
    });

    it('Check if hyphens are added', () => {
      assertEquals(cryptoKey(6, '', 2).length, 8);
      assertMatch(
        cryptoKey(6, '', 2),
        /^[a-z0-9]{2}\-[a-z0-9]{2}\-[a-z0-9]{2}$/,
      );
    });

    it('Check if hyphens are added with prefix', () => {
      assertEquals(cryptoKey(6, 'abc', 2).length, 11);
      assertMatch(
        cryptoKey(6, 'abc', 2),
        /^abc[a-z0-9]{2}\-[a-z0-9]{2}\-[a-z0-9]{2}$/,
      );
    });

    it('Check for collission on sample set of 100000', () => {
      const iterations = 100000; // The number of parallel executions to simulate
      const generatedIds = new Set<string>(); // Set to store the generated IDs

      // Run the parallel executions
      const promises = Array(iterations).fill(null).map(() => {
        generatedIds.add(cryptoKey()); // Add the ID to the set
      });

      // Wait for all parallel executions to complete
      return Promise.all(promises)
        .then(() => {
          assertEquals(generatedIds.size, iterations);
        });
    });
  });
});
