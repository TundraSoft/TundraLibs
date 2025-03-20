import * as asserts from '$asserts';
import {
  ALPHA_NUMERIC,
  ALPHA_NUMERIC_CASE,
  ALPHABETS,
  nanoID,
  NUMBERS,
  PASSWORD,
  WEB_SAFE,
} from './mod.ts';

Deno.test('id.nanoId', async (t) => {
  const sampleSize = 10000,
    minLength = 6,
    maxLength = 40,
    dictionary = [
      { data: NUMBERS, reg: /^[0-9{0,}]+$/ }, // NOSONAR
      { data: ALPHABETS, reg: /^[a-z{0,}]+$/i }, // NOSONAR
      { data: ALPHA_NUMERIC, reg: /^[A-Z0-9{0,}]+$/i }, // NOSONAR
      { data: ALPHA_NUMERIC_CASE, reg: /^[a-z0-9{0,}]+$/ }, // NOSONAR
      { data: WEB_SAFE, reg: /^[a-z0-9\_\-{0,}]+$/i }, // NOSONAR
      { data: PASSWORD, reg: /^[a-z0-9\_\-\!\@\$\%\^\&\*{0,}]+$/i }, // NOSONAR
    ];
  await t.step('Check for length consistency on sample set of 10000', () => {
    for (let i = minLength; i <= maxLength; i++) {
      dictionary.forEach((dict) => {
        for (let j = 0; j < sampleSize; j++) {
          asserts.assertEquals(i, nanoID(i, dict.data).length);
        }
      });
    }
  });

  await t.step(
    'Ensure only allowed characters are present on sample set of 10000',
    () => {
      for (let i = minLength; i <= maxLength; i++) {
        dictionary.forEach((dict) => {
          for (let j = 0; j < sampleSize; j++) {
            asserts.assertMatch(nanoID(6, dict.data), dict.reg);
          }
        });
      }
    },
  );

  await t.step('Check if the collision is < 1% on sample set of 10000', () => {
    let id: string;
    for (let i = minLength; i <= maxLength; i++) {
      for (const dict of dictionary) { // 2. Use for...of loop
        const op: Set<string> = new Set(); // 1. Initialize op inside the loop
        for (let j = 0; j < sampleSize; j++) {
          id = nanoID(i, dict.data); // 3. Declare and assign id inside the loop
          if (!op.has(id)) {
            op.add(id);
          }
        }
        const diff: number = Math.round(
          ((sampleSize - op.size) / sampleSize) * 100,
        );
        asserts.assertEquals(diff <= 1, true);
      }
    }
  });

  // Additional test cases
  await t.step('Test default parameters', () => {
    // Test default size is 21
    const defaultId = nanoID();
    asserts.assertEquals(defaultId.length, 21);

    // Test default base is WEB_SAFE
    asserts.assertMatch(defaultId, /^[a-z0-9\_\-{0,}]+$/i);

    // Test uniqueness of default IDs
    const ids = new Set();
    for (let i = 0; i < 1000; i++) {
      ids.add(nanoID());
    }
    asserts.assertEquals(ids.size, 1000);
  });

  await t.step('Test edge cases for size parameter', () => {
    // Test very small size
    const tinyId = nanoID(1);
    asserts.assertEquals(tinyId.length, 1);

    // Test zero size (should still produce at least one character)
    asserts.assertThrows(
      () => nanoID(0),
      Error,
      'Size should be greater than 0',
    );

    // // Test large size
    const largeSize = 200;
    const largeId = nanoID(largeSize);
    asserts.assertEquals(largeId.length, largeSize);
  });

  await t.step('Test with custom character sets', () => {
    // Test with single character base
    const singleCharBase = 'A';
    const singleCharId = nanoID(10, singleCharBase);
    asserts.assertEquals(singleCharId.length, 10);
    asserts.assertEquals(singleCharId, 'AAAAAAAAAA');

    // Test with custom character set
    const customBase = '!@#$%^&*()';
    const customId = nanoID(10, customBase);
    asserts.assertEquals(customId.length, 10);
    for (const char of customId) {
      asserts.assert(customBase.includes(char));
    }
  });

  await t.step('Test distribution of characters', () => {
    // Generate a large number of IDs to test character distribution
    const testBase = 'ABC';
    const testSize = 10;
    const iterations = 10000;

    const charCount = {
      'A': 0,
      'B': 0,
      'C': 0,
    };

    for (let i = 0; i < iterations; i++) {
      const id = nanoID(testSize, testBase);
      for (const char of id) {
        charCount[char as keyof typeof charCount]++;
      }
    }

    // Check that character distribution is roughly even (within 10%)
    const totalChars = iterations * testSize;
    const expectedCountPerChar = totalChars / testBase.length;
    const tolerance = 0.1; // 10% tolerance

    for (const char of testBase) {
      const count = charCount[char as keyof typeof charCount];
      const ratio = count / expectedCountPerChar;
      asserts.assert(
        ratio > (1 - tolerance) && ratio < (1 + tolerance),
        `Character ${char} distribution is uneven: ${count} occurrences (ratio: ${ratio})`,
      );
    }
  });
});
