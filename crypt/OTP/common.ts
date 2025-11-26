import type { DigestAlgorithms } from '../digest/mod.ts';
import { sprintf } from '$fmt/printf';

/**
 * Converts a number to an 8-byte array (Uint8Array).
 *
 * @param {number} data - The number to convert.
 * @returns {Uint8Array} The resulting 8-byte array.
 * @throws {Error} If the number is not a non-negative integer.
 */
export const numberToBytes = (data: number): Uint8Array => {
  if (!Number.isInteger(data) || data < 0) {
    throw new Error('Counter must be a non-negative integer');
  }

  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(data), false); // false for big-endian
  return new Uint8Array(buffer) as Uint8Array;
};

/**
 * Validates input parameters for OTP generation
 *
 * @param {string | Uint8Array} key - The secret key for HMAC
 * @param {number} counter - The counter value
 * @param {number} length - The length of the OTP
 * @param {DigestAlgorithms} algo - The hash algorithm to use
 * @throws {Error} If any input is invalid
 */
export const validateInputs = (
  key: string | Uint8Array,
  counter: number,
  length: number,
  algo: DigestAlgorithms,
): void => {
  // Validate key
  if (typeof key === 'string') {
    if (!key || key.length < 16) {
      throw new Error('Secret key should be at least 16 characters long');
    }
  } else if (key.byteLength < 16) {
    throw new Error('Secret key should be at least 16 bytes long');
  }

  // Validate counter
  if (!Number.isInteger(counter) || counter < 0) {
    throw new Error('Counter must be a non-negative integer');
  }

  // Validate OTP length
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('OTP length must be a non-negative integer');
  }

  // Validate algorithm
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algo)) {
    throw new Error('The provided algorithm name is not supported');
  }
};

/**
 * Generates a one-time password (OTP) using HMAC-based algorithm.
 *
 * Implements the algorithm described in RFC 4226 (HOTP) and RFC 6238 (TOTP).
 * Uses dynamic truncation to extract a numeric code from the HMAC digest.
 * This is an internal function used by both {@link HOTP} and {@link TOTP}.
 *
 * @param {string | Uint8Array} key - The secret key for HMAC (minimum 16 characters/bytes)
 * @param {number} counter - The counter value (non-negative integer)
 * @param {number} [length=6] - The length of the OTP (positive integer)
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated OTP (zero-padded)
 *
 * @throws {Error} When the secret key is shorter than 16 characters/bytes
 * @throws {Error} When the counter is not a non-negative integer
 * @throws {Error} When the OTP length is not a positive integer
 * @throws {Error} When the algorithm is not supported
 * @throws {Error} When OTP generation fails
 *
 * @example
 * ```typescript
 * // Generate a 6-digit HOTP
 * const otp = await generate('mySecretKey123456', 0, 6, 'SHA-1');
 * console.log(otp); // "755224"
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc4226} RFC 4226 - HOTP
 * @see {@link https://tools.ietf.org/html/rfc6238} RFC 6238 - TOTP
 * @see {@link DigestAlgorithms} for supported algorithms
 */
export const generate = async (
  key: string | Uint8Array,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => {
  // Validate inputs
  validateInputs(key, counter, length, algo);

  // Prepare key for HMAC
  const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : key;

  // Import key for HMAC
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData as BufferSource,
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  );

  // Generate HMAC
  const digest = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      cryptoKey,
      numberToBytes(counter) as BufferSource,
    ),
  );

  // Extract code using dynamic truncation (RFC 4226 section 5.4)
  const offset = (digest[digest.byteLength - 1] ?? 0) & 0x0f;
  const code = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
    .getUint32(offset) & 0x7fffffff;

  // Generate code modulo 10^length and pad with leading zeros if needed
  const op = (code % 10 ** length).toString();
  return sprintf('%0' + length + 's', op);
};
