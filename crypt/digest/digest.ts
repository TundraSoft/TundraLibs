import { encodeHex } from '$encoding';
import type { DigestAlgorithms } from './types.ts';

/**
 * Generates a cryptographic hash of the given data using the specified algorithm.
 *
 * Uses the Web Crypto API's `crypto.subtle.digest()` method to compute secure hashes.
 * The output is encoded as a hexadecimal string for easy use in applications.
 *
 * @param {DigestAlgorithms} algorithm - The hash algorithm to use ({@link DigestAlgorithms})
 * @param {string | Uint8Array} data - The data to hash, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the hash
 *
 * @throws {Error} When the provided algorithm name is not supported
 *
 * @example
 * ```typescript
 * // Hash a string with SHA-256
 * const hash = await digest('SHA-256', 'my data');
 * console.log(hash); // "b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de"
 * ```
 *
 * @example
 * ```typescript
 * // Hash binary data with SHA-384
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const hash = await digest('SHA-384', binaryData);
 * console.log(hash); // SHA-384 hash of the binary data
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest} Web Crypto API digest
 * @see {@link DigestAlgorithms} for supported algorithms
 */
export const digest = async (
  algorithm: DigestAlgorithms,
  data: string | Uint8Array,
): Promise<string> => {
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algorithm)) {
    throw new Error('The provided algorithm name is not supported');
  }

  const dataToHash = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  return encodeHex(
    await crypto.subtle.digest(
      algorithm,
      dataToHash,
    ),
  );
};
