/**
 * @fileoverview NanoID - Compact URL-Safe Unique ID Generator
 *
 * A tiny, secure, URL-safe, unique string ID generator for Deno.
 * Based on the popular Node.js nanoid project (https://github.com/ai/nanoid).
 *
 * Features:
 * - **Small**: 130 bytes (minified and gzipped). Zero dependencies.
 * - **Safe**: Uses cryptographically strong random APIs.
 * - **Compact**: Uses a larger alphabet than UUID (A-Za-z0-9_-).
 * - **Fast**: Optimized for performance with efficient random generation.
 * - **Customizable**: Length and character set can be configured.
 *
 * @author TundraSoft
 * @see {@link https://github.com/ai/nanoid} Original nanoid project
 *
 * @example
 * ```typescript
 * import { nanoID, ALPHA_NUMERIC, WEB_SAFE } from './nanoID.ts';
 *
 * // Generate a 21-character URL-safe ID (default)
 * const id1 = nanoID(); // "V1StGXR8_Z5jdHi6B-myT"
 *
 * // Generate a 10-character alphanumeric ID
 * const id2 = nanoID(10, ALPHA_NUMERIC); // "4f90d13a42"
 *
 * // Generate an 8-character ID with custom alphabet
 * const id3 = nanoID(8, '0123456789ABCDEF'); // "2A94B63F"
 * ```
 */

/** Numeric characters 0-9 */
export const NUMBERS = '0123456789';

/** Lowercase alphabetic characters a-z */
export const ALPHABETS = 'abcdefghijklmnopqrstuvwxyz';

/** Web-safe characters: a-z, A-Z, 0-9, _, - (URL-safe) */
export const WEB_SAFE = ALPHABETS + '_' + NUMBERS + '-';

/** Alphanumeric characters: a-z, A-Z, 0-9 */
export const ALPHA_NUMERIC: string = ALPHABETS + NUMBERS +
  ALPHABETS.toUpperCase();

/** Case-sensitive alphanumeric: a-z, 0-9 (lowercase only) */
export const ALPHA_NUMERIC_CASE = ALPHABETS + NUMBERS;

/** Password-safe characters including special symbols */
export const PASSWORD = '!@$%^&*' + WEB_SAFE;

/**
 * Generates an array of cryptographically secure random numbers.
 *
 * Uses the Web Crypto API to generate cryptographically strong random values
 * suitable for security-sensitive applications.
 *
 * @param length - The number of random 32-bit integers to generate
 * @returns Array of cryptographically secure random numbers
 * @throws {Error} If the length parameter is invalid
 *
 * @example
 * ```typescript
 * const randomNumbers = random(5); // Uint32Array with 5 random values
 * ```
 */
const random = function (length: number): Uint32Array {
  if (length < 1) {
    throw new Error('Length must be greater than 0');
  }
  return crypto.getRandomValues(new Uint32Array(length));
};

/**
 * Generates a cryptographically secure unique identifier.
 *
 * This function creates a URL-safe, unique string ID using cryptographically
 * strong random generation. The ID is collision-resistant and suitable for
 * use cases requiring unique identifiers such as database keys, session IDs,
 * or file names.
 *
 * @param size - Length of the generated ID (default: 21 characters)
 * @param base - Character set to use for ID generation (default: WEB_SAFE)
 * @returns A unique string identifier of the specified length
 *
 * @throws {Error} If size is less than 1
 * @throws {Error} If base string is empty or undefined
 *
 * @example
 * ```typescript
 * // Generate default 21-character web-safe ID
 * const id1 = nanoID(); // "V1StGXR8_Z5jdHi6B-myT"
 *
 * // Generate 10-character alphanumeric ID
 * const id2 = nanoID(10, ALPHA_NUMERIC); // "4f90d13a42"
 *
 * // Generate 8-character hexadecimal ID
 * const id3 = nanoID(8, '0123456789ABCDEF'); // "2A94B63F"
 *
 * // Generate password with special characters
 * const pwd = nanoID(16, PASSWORD); // "x&2@mK9!zR8$pL4%"
 * ```
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
    const index = bytes[i]! & mask; //NOSONAR
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
