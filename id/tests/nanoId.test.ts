import {
  alphabets,
  alphaNumeric,
  alphaNumericCase,
  nanoId,
  numbers,
  password,
  webSafe,
} from '../mod.ts';
import { assertEquals, assertMatch } from '../../dev.dependencies.ts';

Deno.test('id:nanoId', async (t) => {
  const sampleSize = 10000,
    minLength = 6,
    maxLength = 40,
    dictionary = [
      { data: numbers, reg: /^[0-9{0,}]+$/ }, // NOSONAR
      { data: alphabets, reg: /^[a-z{0,}]+$/i }, // NOSONAR
      { data: alphaNumeric, reg: /^[A-Z0-9{0,}]+$/i }, // NOSONAR
      { data: alphaNumericCase, reg: /^[a-z0-9{0,}]+$/ }, // NOSONAR
      { data: webSafe, reg: /^[a-z0-9\_\-{0,}]+$/i }, // NOSONAR
      { data: password, reg: /^[a-z0-9\_\-\!\@\$\%\^\&\*{0,}]+$/i }, // NOSONAR
    ];
  await t.step('Check for length consistency on sample set of 10000', () => {
    for (let i = minLength; i <= maxLength; i++) {
      dictionary.forEach((dict) => {
        for (let j = 0; j < sampleSize; j++) {
          assertEquals(i, nanoId(i, dict.data).length);
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
            assertMatch(nanoId(6, dict.data), dict.reg);
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
          id = nanoId(i, dict.data); // 3. Declare and assign id inside the loop
          if (!op.has(id)) {
            op.add(id);
          }
        }
        const diff: number = Math.round(
          ((sampleSize - op.size) / sampleSize) * 100,
        );
        assertEquals(diff <= 1, true);
      }
    }
  });
});
