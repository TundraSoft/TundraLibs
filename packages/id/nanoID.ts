/**
 * @fileoverview NanoID - Compact URL-Safe Unique ID Generator
 *
 * A tiny, secure, URL-safe, unique string ID generator for Deno.
 * Based on the popular Node.js nanoid project (https://github.com/ai/nanoid).
 *
 * Features:
 * - **Self-contained**: no third-party dependencies in this module.
 * - **Safe**: Uses cryptographically strong random APIs.
 * - **Compact**: Uses a larger alphabet than UUID (a-z, 0-9, _, -).
 * - **Fast**: Optimized for performance with efficient random generation.
 * - **Customizable**: Length and character set can be configured.
 *
 * @author TundraSoft
 * @see {@link https://github.com/ai/nanoid} Original nanoid project
 *
 * @module
 *
 * @example
 * ```typescript
 * import { nanoID, ALPHA_NUMERIC, WEB_SAFE } from './nanoID.ts';
 *
 * // Generate a 21-character URL-safe ID (default)
 * const id1 = nanoID(); // "g0b30yv24uuo0grjvi6su"
 *
 * // Generate a 10-character alphanumeric ID
 * const id2 = nanoID(10, ALPHA_NUMERIC); // "4f90d13a42"
 *
 * // Generate an 8-character ID with custom alphabet
 * const id3 = nanoID(8, '0123456789ABCDEF'); // "2A94B63F"
 * ```
 */

import { InvalidOptionError } from './errors/mod.ts';

/**
 * Numeric characters 0-9
 */
export const NUMBERS = '0123456789';

/**
 * Lowercase alphabetic characters a-z
 */
export const ALPHABETS = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Web-safe characters: a-z, 0-9, _, - (URL-safe, 38 characters)
 */
export const WEB_SAFE = ALPHABETS + '_' + NUMBERS + '-';

/**
 * Alphanumeric characters: a-z, A-Z, 0-9
 */
export const ALPHA_NUMERIC: string = ALPHABETS + NUMBERS +
  ALPHABETS.toUpperCase();

/**
 * Case-sensitive alphanumeric: a-z, 0-9 (lowercase only)
 */
export const ALPHA_NUMERIC_CASE = ALPHABETS + NUMBERS;

/**
 * Password-safe characters including special symbols
 */
export const PASSWORD = '!@$%^&*' + WEB_SAFE;

/**
 * Web Crypto's `getRandomValues` rejects any view longer than 65536 bytes
 * (a spec-mandated quota enforced by Deno, Node >= 22, and Bun). For a
 * `Uint32Array` that is 65536 / 4 = 16384 elements per call.
 */
const MAX_U32_PER_CALL = 16384;

/**
 * Generates an array of cryptographically secure random numbers.
 *
 * Uses the Web Crypto API to generate cryptographically strong random values
 * suitable for security-sensitive applications. The output is filled in
 * chunks of at most {@link MAX_U32_PER_CALL} elements so that large requests
 * (e.g. very long IDs) do not trip Web Crypto's 65536-byte `getRandomValues`
 * quota and throw a raw `QuotaExceededError` `DOMException`.
 *
 * @param length - The number of random 32-bit integers to generate
 * @returns Array of cryptographically secure random numbers
 * @throws {@link InvalidOptionError} If the length parameter is less than 1
 *
 * @example
 * ```typescript ignore
 * const randomNumbers = random(5); // Uint32Array with 5 random values
 * ```
 */
const random = function (length: number): Uint32Array {
  if (length < 1) {
    throw new InvalidOptionError('Length must be greater than 0', {
      generator: 'nanoID',
      option: 'length',
      value: length,
    });
  }
  const values = new Uint32Array(length);
  // Fill in <= 65536-byte chunks to respect the getRandomValues quota; for the
  // common case (length <= 16384) this is a single call, unchanged in cost.
  for (let offset = 0; offset < length; offset += MAX_U32_PER_CALL) {
    const end = Math.min(offset + MAX_U32_PER_CALL, length);
    crypto.getRandomValues(values.subarray(offset, end));
  }
  return values;
};

/**
 * Generates a cryptographically secure unique identifier.
 *
 * This function creates a URL-safe, unique string ID using cryptographically
 * strong random generation. The ID is collision-resistant and suitable for
 * use cases requiring unique identifiers such as database keys, session IDs,
 * or file names.
 *
 * @param size - Length of the generated ID (default: 21 characters). Must be a
 *   positive integer. There is no upper bound on legitimate (integer) sizes:
 *   large sizes chunk the underlying random generation so they never trip Web
 *   Crypto's 65536-byte quota (they only cost proportional memory/time).
 * @param base - Character set to use for ID generation (default: WEB_SAFE)
 * @returns A unique string identifier of the specified length
 *
 * @throws {@link InvalidOptionError} If size is less than 1 or not an integer
 *   (NaN, a fractional value, or Infinity). A NaN or fractional size is **not**
 *   silently coerced (which would yield an empty or wrong-length ID).
 * @throws {@link InvalidOptionError} If base string is empty or undefined
 *
 * @example
 * ```typescript
 * // Generate default 21-character web-safe ID
 * const id1 = nanoID(); // "g0b30yv24uuo0grjvi6su"
 *
 * // Generate 10-character alphanumeric ID
 * const id2 = nanoID(10, ALPHA_NUMERIC); // "4f90d13a42"
 *
 * // Generate 8-character hexadecimal ID
 * const id3 = nanoID(8, '0123456789ABCDEF'); // "2A94B63F"
 *
 * // Generate password with special characters
 * const pwd = nanoID(16, PASSWORD); // "k9!m@2x$p4^w7&a-"
 * ```
 */
export function nanoID(size = 21, base: string = WEB_SAFE): string {
  // Input validation
  if (size < 1) {
    throw new InvalidOptionError('Size should be greater than 0', {
      generator: 'nanoID',
      option: 'size',
      value: size,
    });
  }

  // Reject NaN / fractional / Infinity sizes up front. They slip past
  // `size < 1` (NaN compares false both ways; fractional/Infinite are > 1) and
  // then produce silently wrong output — NaN yields an empty string, a
  // fractional value rounds to the wrong length, and Infinity leaks a raw
  // RangeError out of the underlying typed-array allocation — all bypassing
  // the InvalidOptionError contract.
  if (!Number.isInteger(size)) {
    throw new InvalidOptionError('Size must be an integer', {
      generator: 'nanoID',
      option: 'size',
      value: size,
    });
  }

  if (!base || base.length === 0) {
    throw new InvalidOptionError('Base string cannot be empty', {
      generator: 'nanoID',
      option: 'base',
      value: base,
    });
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
