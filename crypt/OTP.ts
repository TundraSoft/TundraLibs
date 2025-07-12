import type { DigestAlgorithms } from './digest.ts';
import { sprintf } from '$fmt/printf';

/**
 * Converts a number to an 8-byte array (Uint8Array).
 *
 * @param {number} data - The number to convert.
 * @returns {Uint8Array} The resulting 8-byte array.
 * @throws {Error} If the number is not a non-negative integer.
 */
function numberToBytes(data: number): Uint8Array {
  if (!Number.isInteger(data) || data < 0) {
    throw new Error('Counter must be a non-negative integer');
  }

  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setBigUint64(0, BigInt(data), false); // false for big-endian
  return new Uint8Array(buffer);
}

/**
 * Validates input parameters for OTP generation
 *
 * @param {string | Uint8Array} key - The secret key for HMAC
 * @param {number} counter - The counter value
 * @param {number} length - The length of the OTP
 * @param {DigestAlgorithms} algo - The hash algorithm to use
 * @throws {Error} If any input is invalid
 */
function validateInputs(
  key: string | Uint8Array,
  counter: number,
  length: number,
  algo: DigestAlgorithms,
): void {
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
}

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
const generate = async (
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
    keyData,
    { name: 'HMAC', hash: algo },
    false,
    ['sign'],
  );

  // Generate HMAC
  const digest = new Uint8Array(
    await crypto.subtle.sign('HMAC', cryptoKey, numberToBytes(counter)),
  );

  // Extract code using dynamic truncation (RFC 4226 section 5.4)
  const offset = (digest[digest.byteLength - 1] ?? 0) & 0x0f;
  const code = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
    .getUint32(offset) & 0x7fffffff;

  // Generate code modulo 10^length and pad with leading zeros if needed
  const op = (code % 10 ** length).toString();
  return sprintf('%0' + length + 's', op);
};

/**
 * Verifies a Time-based One-Time Password (TOTP).
 *
 * Checks if the provided OTP is valid within a specified time window.
 * The verification allows for clock drift by checking multiple time steps
 * before and after the current time.
 *
 * @param {string} otp - The OTP to verify (must be numeric and match expected length)
 * @param {string | Uint8Array} key - The secret key for HMAC (minimum 16 characters/bytes)
 * @param {number} [window=1] - The number of time steps to check before and after the current one
 * @param {number} [epoch=Date.now()] - The epoch time in milliseconds
 * @param {number} [period=30] - The time period in seconds (must be at least 1)
 * @param {number} [length=6] - The length of the OTP (positive integer)
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use ({@link DigestAlgorithms})
 * @returns {Promise<boolean>} A promise that resolves to true if the OTP is valid, false otherwise
 *
 * @throws {Error} When the time period is less than 1 second
 * @throws {Error} When the window is not a non-negative integer
 * @throws {Error} When the secret key is too short
 * @throws {Error} When OTP verification fails
 *
 * @example
 * ```typescript
 * // Verify a TOTP with default settings
 * const isValid = await verifyTOTP('123456', 'mySecretKey123456');
 * console.log(isValid); // true or false
 * ```
 *
 * @example
 * ```typescript
 * // Verify with custom time window and period
 * const isValid = await verifyTOTP(
 *   '987654',
 *   'mySecretKey123456',
 *   2,        // window: ±2 time steps
 *   Date.now(),
 *   30,       // 30-second periods
 *   6,        // 6-digit OTP
 *   'SHA-1'
 * );
 * ```
 *
 * @see {@link TOTP} for generating TOTP codes
 * @see {@link verifyHOTP} for counter-based verification
 * @see {@link DigestAlgorithms} for supported algorithms
 */
export const verifyTOTP = async (
  otp: string,
  key: string | Uint8Array,
  window: number = 1,
  epoch: number = Date.now(),
  period: number = 30,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<boolean> => {
  if (period < 1) {
    throw new Error('Time period must be at least 1 second');
  }

  if (window < 0 || !Number.isInteger(window)) {
    throw new Error('Window must be a non-negative integer');
  }

  if (!otp || otp.length !== length || !/^\d+$/.test(otp)) {
    return false;
  }

  const currentCounter = Math.floor(epoch / (period * 1000));

  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i;
    if (counter < 0) continue;

    const generatedOTP = await generate(key, counter, length, algo);
    if (otp === generatedOTP) {
      return true;
    }
  }

  return false;
};

/**
 * Verifies an HMAC-based One-Time Password (HOTP).
 *
 * @param {string} otp - The OTP to verify
 * @param {string | Uint8Array} key - The secret key for HMAC
 * @param {number} counter - The counter value
 * @param {number} [length=6] - The length of the OTP
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use
 * @returns {Promise<boolean>} True if the OTP is valid, false otherwise
 */
export const verifyHOTP = async (
  otp: string,
  key: string | Uint8Array,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<boolean> => {
  if (!otp || otp.length !== length || !/^\d+$/.test(otp)) {
    return false;
  }

  const generatedOTP = await generate(key, counter, length, algo);
  return otp === generatedOTP;
};

/**
 * Generates a Time-based One-Time Password (TOTP) as defined in RFC 6238.
 *
 * @param {string | Uint8Array} key - The secret key for HMAC.
 * @param {number} [epoch=Date.now()] - The epoch time.
 * @param {number} [period=30] - The time period in seconds.
 * @param {number} [length=6] - The length of the OTP.
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use. ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated TOTP.
 *
 * @see {@link https://tools.ietf.org/html/rfc6238|RFC 6238 - TOTP}
 */
export const TOTP = (
  key: string | Uint8Array,
  epoch: number = Date.now(),
  period: number = 30,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => {
  if (period < 1) {
    throw new Error('Time period must be at least 1 second');
  }
  const counter = Math.floor(epoch / (period * 1000));
  return generate(key, counter, length, algo);
};

/**
 * Generates a HMAC-based One-Time Password (HOTP) as defined in RFC 4226.
 *
 * @param {string | Uint8Array} key - The secret key for HMAC.
 * @param {number} counter - The counter value.
 * @param {number} [length=6] - The length of the OTP.
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use. ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated HOTP.
 *
 * @see {@link https://tools.ietf.org/html/rfc4226|RFC 4226 - HOTP}
 */
export const HOTP = (
  key: string | Uint8Array,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => generate(key, counter, length, algo);
