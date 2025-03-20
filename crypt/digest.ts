import { encodeHex } from '$encoding';

export type DigestAlgorithms = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * Generates a cryptographic hash of the given data using the specified algorithm.
 *
 * @param {DigestAlgorithms} algorithm - The hash algorithm to use (e.g., 'SHA-256'). {@link DigestAlgorithms}
 * @param {string} data - The data to hash.
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the hash.
 *
 * @example
 * const hash = await digest('SHA-256', 'my data');
 * console.log(hash); // Logs the SHA-256 hash of 'my data'
 */
export const digest = async (
  algorithm: DigestAlgorithms,
  data: string,
): Promise<string> => {
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algorithm)) {
    throw new Error('The provided algorithm name is not supported');
  }
  return encodeHex(
    await crypto.subtle.digest(
      algorithm,
      new TextEncoder().encode(data),
    ),
  );
};
