/**
 * nanoid
 *
 * This generates a "unique" id, whose length can be customised as per needs.
 * Based on nodejs nanoid project (https://github.com/ai/nanoid)
 */

import { webSafe } from "./dictionary.ts";

/**
 * Generates an array of random numbers basis the length specified
 *
 * @param length the length or size of randomly generated array
 * @returns array of randomly generated numbers
 */
const random = function (length: number): Uint32Array {
  return crypto.getRandomValues(new Uint32Array(length));
};

/**
 * Generates a unique id from the base characterset provided. The characters used
 * are as uniform as possible ensuring even spread and low repeatability.
 * During testing, when generating 10,000,000 < 1% collision was found. However, this
 * is subject to multiple scenarios in production
 *
 * @param size length of ID required
 * @param base the base characters to use for ID generation. Defaults to webSafe from dictionaty [[webSafe]]
 * @returns string - The unique id
 */
export function nanoid(size = 21, base: string = webSafe): string {
  let id = "",
    i = 0;
  const mask = (2 << (31 - Math.clz32((base.length - 1) | 1))) - 1,
    step = Math.ceil((1.6 * mask * size) / base.length),
    bytes: Uint32Array = random(step);

  while (id.length < size) {
    id += base[bytes[i] & mask] || "";
    i++;
  }
  return id;
}
