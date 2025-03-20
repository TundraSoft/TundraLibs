/**
 * nanoid
 *
 * This generates a "unique" id, whose length can be customised as per needs.
 * Based on nodejs nanoid project (https://github.com/ai/nanoid)
 */

export const NUMBERS = '0123456789';
export const ALPHABETS = 'abcdefghijklmnopqrstuvwxyz';
export const WEB_SAFE = ALPHABETS + '_' + NUMBERS + '-';
export const ALPHA_NUMERIC: string = ALPHABETS + NUMBERS +
  ALPHABETS.toUpperCase();
export const ALPHA_NUMERIC_CASE = ALPHABETS + NUMBERS;
export const PASSWORD = '!@$%^&*' + WEB_SAFE;

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
 * @param {number} size length of ID required
 * @param {string} base the base characters to use for ID generation. Defaults to WEB_SAFE [[WEB_SAFE]]
 * @returns {string} The generated unique id
 *
 * @example
 * // Basic usage
 * const id = nanoID();
 * console.log(id); // Logs a 21-character unique id using WEB_SAFE characters
 *
 * @example
 * // Generate an ID with a specific length
 * const id = nanoID(10);
 * console.log(id); // Logs a 10-character unique id using WEB_SAFE characters
 *
 * @example
 * // Generate an ID with a custom character set
 * const id = nanoID(10, NUMBERS);
 * console.log(id); // Logs a 10-character unique id using only numeric characters
 *
 * @example
 * // Generate an ID with a custom character set including special characters
 * const id = nanoID(15, PASSWORD);
 * console.log(id); // Logs a 15-character unique id using PASSWORD characters
 */
export function nanoID(size = 21, base: string = WEB_SAFE): string {
  if (size < 1) {
    throw new Error('Size should be greater than 0');
  }
  let id = '',
    i = 0;
  const mask = (2 << (31 - Math.clz32((base.length - 1) | 1))) - 1,
    step = Math.ceil((1.6 * mask * size) / base.length),
    bytes: Uint32Array = random(step);

  while (id.length < size) {
    id += base[bytes[i]! & mask] || '';
    i++;
  }
  return id;
}

// Path: id/nanoID.ts
