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
 * Implements the algorithm described in RFC 4226 (HOTP) and RFC 6238 (TOTP).
 *
 * @param {string | Uint8Array} key - The secret key for HMAC.
 * @param {number} counter - The counter value.
 * @param {number} [length=6] - The length of the OTP.
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use. ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated OTP.
 *
 * @see {@link https://tools.ietf.org/html/rfc4226|RFC 4226 - HOTP}
 * @see {@link https://tools.ietf.org/html/rfc6238|RFC 6238 - TOTP}
 */
const generate = async (
  key: string | Uint8Array,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => {
  try {
    // Validate inputs
    validateInputs(key, counter, length, algo);

    // Prepare key for HMAC
    const keyData = typeof key === 'string'
      ? new TextEncoder().encode(key)
      : key;

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
    const offset = digest[digest.byteLength - 1]! & 0x0f;
    const code =
      new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
        .getUint32(offset) & 0x7fffffff;

    // Generate code modulo 10^length and pad with leading zeros if needed
    const op = (code % 10 ** length).toString();
    return sprintf('%0' + length + 's', op);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`OTP generation failed: ${String(error)}`);
  }
};

/**
 * Verifies a Time-based One-Time Password (TOTP).
 *
 * @param {string} otp - The OTP to verify
 * @param {string | Uint8Array} key - The secret key for HMAC
 * @param {number} [window=1] - The number of time steps to check before and after the current one
 * @param {number} [epoch=Date.now()] - The epoch time
 * @param {number} [period=30] - The time period in seconds
 * @param {number} [length=6] - The length of the OTP
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use
 * @returns {Promise<boolean>} True if the OTP is valid, false otherwise
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
  try {
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
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`OTP verification failed: ${String(error)}`);
  }
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
  try {
    if (!otp || otp.length !== length || !/^\d+$/.test(otp)) {
      return false;
    }

    const generatedOTP = await generate(key, counter, length, algo);
    return otp === generatedOTP;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`OTP verification failed: ${String(error)}`);
  }
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
