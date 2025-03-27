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
 * Generates a unique id from the base characterset provided.
 *
 * @param {number} size length of ID required
 * @param {string} base the base characters to use for ID generation. Defaults to WEB_SAFE
 * @returns {string} The generated unique id
 */
export function nanoID(size = 21, base: string = WEB_SAFE): string {
  // Input validation
  if (size < 1) {
    throw new Error('Size should be greater than 0');
  }

  if (!base || base.length === 0) {
    throw new Error('Base string cannot be empty');
  }

  // Performance optimizations
  let id = '';
  let i = 0;

  // Calculate mask based on base length
  const mask = (2 << (31 - Math.clz32((base.length - 1) | 1))) - 1;

  // Calculate step for sufficient randomness
  const step = Math.ceil((1.6 * mask * size) / base.length);

  // Get random bytes all at once (more efficient)
  const bytes: Uint32Array = random(step);

  // Generate ID
  while (id.length < size) {
    const index = bytes[i]! & mask;
    // Only add valid characters (when index is within base length)
    if (index < base.length) {
      id += base[index];
    }
    i++;

    // If we run out of random bytes, generate more
    if (i >= bytes.length) {
      const newBytes = random(step);
      bytes.set(newBytes);
      i = 0;
    }
  }

  return id;
}

// Path: id/nanoID.ts
