import { encodeBase64, encodeHex } from '$encoding';
import type { DigestOptions } from './types.ts';

/**
 * Generates a cryptographic hash of the given data using the specified algorithm.
 *
 * Uses the Web Crypto API's `crypto.subtle.digest()` method to compute secure hashes.
 * The output can be encoded as hexadecimal or base64 string.
 *
 * @param {string | Uint8Array} data - The data to hash, either as a string or binary data
 * @param {DigestOptions} [options] - Options for the digest operation
 * @param {DigestAlgorithms} [options.algorithm='SHA-256'] - The hash algorithm to use
 * @param {'hex' | 'base64'} [options.encoding='hex'] - The output encoding format
 * @returns {Promise<string>} A promise that resolves to the encoded hash
 *
 * @throws {Error} When the provided algorithm name is not supported
 *
 * @example
 * ```typescript
 * // Hash a string with default SHA-256
 * const hash = await digest('my data');
 * console.log(hash); // "b2167b0aa7ef7794740b055ac7a880a52934aa67ef1ca6887ad81dccefd5b9de"
 * ```
 *
 * @example
 * ```typescript
 * // Hash with SHA-512 and base64 encoding
 * const hash = await digest('my data', { algorithm: 'SHA-512', encoding: 'base64' });
 * console.log(hash); // Base64-encoded SHA-512 hash
 * ```
 *
 * @example
 * ```typescript
 * // Hash binary data
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const hash = await digest(binaryData, { algorithm: 'SHA-384' });
 * console.log(hash); // SHA-384 hash in hex encoding
 * ```
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest} Web Crypto API digest
 * @see {@link DigestAlgorithms} for supported algorithms
 * @see {@link DigestOptions} for available options
 */
export async function digest(
  data: string | Uint8Array,
  options?: DigestOptions,
): Promise<string> {
  const { algorithm = 'SHA-256', encoding = 'hex' } = options ?? {};

  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algorithm)) {
    throw new Error('The provided algorithm name is not supported');
  }

  const dataToHash = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  const hashBuffer = await crypto.subtle.digest(
    algorithm,
    dataToHash as BufferSource,
  );

  return encoding === 'base64'
    ? encodeBase64(hashBuffer)
    : encodeHex(hashBuffer);
}

/**
 * Generates a SHA-256 hash of the given data.
 *
 * Convenience function for the most commonly used hash algorithm.
 *
 * @param {string | Uint8Array} data - The data to hash
 * @param {'hex' | 'base64'} [encoding='hex'] - The output encoding format
 * @returns {Promise<string>} A promise that resolves to the encoded SHA-256 hash
 *
 * @example
 * ```typescript
 * const hash = await sha256('my data');
 * console.log(hash); // SHA-256 hash in hex
 * ```
 */
export function sha256(
  data: string | Uint8Array,
  encoding: 'hex' | 'base64' = 'hex',
): Promise<string> {
  return digest(data, { algorithm: 'SHA-256', encoding });
}

/**
 * Generates a SHA-512 hash of the given data.
 *
 * Convenience function for SHA-512 hashing.
 *
 * @param {string | Uint8Array} data - The data to hash
 * @param {'hex' | 'base64'} [encoding='hex'] - The output encoding format
 * @returns {Promise<string>} A promise that resolves to the encoded SHA-512 hash
 *
 * @example
 * ```typescript
 * const hash = await sha512('my data');
 * console.log(hash); // SHA-512 hash in hex
 * ```
 */
export function sha512(
  data: string | Uint8Array,
  encoding: 'hex' | 'base64' = 'hex',
): Promise<string> {
  return digest(data, { algorithm: 'SHA-512', encoding });
}

/**
 * Generates a SHA-384 hash of the given data.
 *
 * Convenience function for SHA-384 hashing.
 *
 * @param {string | Uint8Array} data - The data to hash
 * @param {'hex' | 'base64'} [encoding='hex'] - The output encoding format
 * @returns {Promise<string>} A promise that resolves to the encoded SHA-384 hash
 *
 * @example
 * ```typescript
 * const hash = await sha384('my data');
 * console.log(hash); // SHA-384 hash in hex
 * ```
 */
export function sha384(
  data: string | Uint8Array,
  encoding: 'hex' | 'base64' = 'hex',
): Promise<string> {
  return digest(data, { algorithm: 'SHA-384', encoding });
}

/**
 * Generates a SHA-1 hash of the given data.
 *
 * Convenience function for SHA-1 hashing.
 * Note: SHA-1 is considered weak and should only be used for legacy compatibility.
 *
 * @param {string | Uint8Array} data - The data to hash
 * @param {'hex' | 'base64'} [encoding='hex'] - The output encoding format
 * @returns {Promise<string>} A promise that resolves to the encoded SHA-1 hash
 *
 * @example
 * ```typescript
 * const hash = await sha1('my data');
 * console.log(hash); // SHA-1 hash in hex
 * ```
 */
export function sha1(
  data: string | Uint8Array,
  encoding: 'hex' | 'base64' = 'hex',
): Promise<string> {
  return digest(data, { algorithm: 'SHA-1', encoding });
}
