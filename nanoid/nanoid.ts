/**
 * nanoid
 *
 * This generates a "unique" id, whose length can be customised as per needs.
 * Based on nodejs nanoid project (https://github.com/ai/nanoid)
 */

import { webSafe } from './dictionary.ts';

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
  let id = '',
    i = 0;
  const mask = (2 << (31 - Math.clz32((base.length - 1) | 1))) - 1,
    step = Math.ceil((1.6 * mask * size) / base.length),
    bytes: Uint32Array = random(step);

  while (id.length < size) {
    id += base[bytes[i] & mask] || '';
    i++;
  }
  return id;
}

// export function nanoid2(size = 21, base: string = webSafe): string {
//   const maskLength = (base.length - 1) | 1;
//   const mask = (2 << (31 - Math.clz32(maskLength))) - 1;
//   const step = Math.ceil((1.6 * mask * size) / base.length);
//   const bytes: Uint32Array = random(step);
//   const lookup: string[] = [];
//   const limits: number[] = [];

//   // Build lookup table and consecutive occurrence limits
//   for (let i = 0; i <= mask; i++) {
//     lookup[i] = base[i % base.length];
//     limits[i] = (i > 0 && lookup[i] === lookup[i - 1]) ? limits[i - 1] + 1 : 0;
//     if (limits[i] >= 2) {
//       let j = i;
//       while (j < base.length && lookup[j] === lookup[i]) {
//         limits[j++] = limits[i];
//       }
//     }
//   }

//   let id = '',
//     i = 0,
//     length = bytes.length,
//     lastChar = '',
//     lastCount = 0;

//   // Generate random ID with consecutive occurrence check
//   while (id.length < size && i < length) {
//     const byte = bytes[i] & mask;
//     const char = lookup[byte];
//     const count = (char === lastChar) ? lastCount + 1 : 0;
//     if (count >= 3) {
//       i++;
//       continue;
//     }
//     id += char;
//     lastChar = char;
//     lastCount = count;
//     i++;
//   }

//   return id;
// }

// const serverId = Math.round(12),
//   st = Math.round(Date.now()/1000);
// let seed = 100000;
// export function shortId() {
//   console.log(serverId, st, seed);
//   return (((serverId & 255) << 56) + (st << 24)) + seed++;
// }
// Another idea
/**
 * This will be unique as long as we can manage to get server_id (PID), server_startup_time_in_seconds (to an extent consistent)
 * https://mariadb.com/kb/en/uuid_short/
 *   (server_id & 255) << 56
+ (server_startup_time_in_seconds << 24)
+ incremented_variable++;
 */
