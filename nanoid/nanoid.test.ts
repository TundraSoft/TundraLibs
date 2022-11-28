import {
  alphabets,
  alphaNumeric,
  alphaNumericCase,
  nanoid,
  numbers,
  password,
  webSafe,
} from './mod.ts';
import { assertEquals, assertMatch } from '/root/dev.dependencies.ts';

//#region Begin variable definition
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
//#endregion End Variable definition

//#region Begin Length consistency check
/**
 * Length consistency check
 * Check if the length of the generated id matches requested length
 */
Deno.test({
  name: 'Check for length consistency on sample set of ' + sampleSize,
  fn() {
    for (let i = minLength; i <= maxLength; i++) {
      dictionary.forEach((dict) => {
        for (let j = 0; j < sampleSize; j++) {
          assertEquals(i, nanoid(i, dict.data).length);
        }
      });
    }
  },
});
//#endregion End Length consistency check

//#region Begin allowed character check
/**
 * Allowed character check
 * Checks if the generated ID uses the characters present in dictionary
 */
Deno.test({
  name: 'Ensure only allowed characters are present on sample set of ' +
    sampleSize,
  fn() {
    for (let i = minLength; i <= maxLength; i++) {
      dictionary.forEach((dict) => {
        for (let j = 0; j < sampleSize; j++) {
          assertMatch(nanoid(6, dict.data), dict.reg);
        }
      });
    }
  },
});
//#endregion End allowed character check

//#region Begin collision check
/**
 * Collission check
 * Check for collissions when generating id. Expectation is to have < 1%
 */

// Deno.test({
//   name: "Check if the collision is < 1% on sample set of " + sampleSize,
//   fn() {
//     const op: Set<string> = new Set();
//     let id: string;
//     for (let i = minLength; i <= maxLength; i++) {
//       dictionary.forEach((dict) => {
//         op.clear();
//         for (let j = 0; j < sampleSize; j++) {
//           id = nanoid(i, dict.data);
//           if (!op.has(id)) {
//             op.add(id);
//           }
//         }
//         const diff: number = Math.round(((sampleSize - op.size) / sampleSize) * 100);
//         assertEquals(0, diff);
//       });
//     }
//   },
// });

//#endregion End collission check
