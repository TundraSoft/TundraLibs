import { encodeHex } from '$encoding';

export type DigestAlgorithms = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * Generates a cryptographic hash of the given data using the specified algorithm.
 *
 * @param {DigestAlgorithms} algorithm - The hash algorithm to use (e.g., 'SHA-256'). {@link DigestAlgorithms}
 * @param {string | Uint8Array} data - The data to hash, either as a string or binary data.
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the hash.
 *
 * @example
 * const hash = await digest('SHA-256', 'my data');
 * console.log(hash); // Logs the SHA-256 hash of 'my data'
 *
 * @example
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const hash = await digest('SHA-256', binaryData);
 * console.log(hash); // Logs the SHA-256 hash of the binary data
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
