import {
  alphabets,
  alphaNumeric,
  alphaNumericCase,
  nanoid,
  numbers,
  password,
  webSafe,
} from '../mod.ts';
import { assertEquals, assertMatch, describe, it } from '../../dev.dependencies.ts';

describe('[library="id" mode="nanoid"]', () => {
  const sampleSize = 10000,
  minLength = 6,
  maxLength = 40,
  dictionary = [
    { data: numbers, reg: /^[0-9{0,}]+$/ },
    { data: alphabets, reg: /^[a-z{0,}]+$/i },
    { data: alphaNumeric, reg: /^[A-Z0-9{0,}]+$/i },
    { data: alphaNumericCase, reg: /^[a-z0-9{0,}]+$/ },
    { data: webSafe, reg: /^[a-z0-9\_\-{0,}]+$/i },
    { data: password, reg: /^[a-z0-9\_\-\!\@\$\%\^\&\*{0,}]+$/i },
  ];

  it('Check for length consistency on sample set of 10000', () => {
    for (let i = minLength; i <= maxLength; i++) {
      dictionary.forEach((dict) => {
        for (let j = 0; j < sampleSize; j++) {
          assertEquals(i, nanoid(i, dict.data).length);
        }
      });
    }
  }), 

  it('Ensure only allowed characters are present on sample set of 10000', () => {
    for (let i = minLength; i <= maxLength; i++) {
      dictionary.forEach((dict) => {
        for (let j = 0; j < sampleSize; j++) {
          assertMatch(nanoid(6, dict.data), dict.reg);
        }
      });
    }
  }),

  it('Check if the collision is < 1% on sample set of 10000', () => {
    let id: string;
    for (let i = minLength; i <= maxLength; i++) {
      for (const dict of dictionary) { // 2. Use for...of loop
        const op: Set<string> = new Set(); // 1. Initialize op inside the loop
        for (let j = 0; j < sampleSize; j++) {
          id = nanoid(i, dict.data); // 3. Declare and assign id inside the loop
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
  })
});
