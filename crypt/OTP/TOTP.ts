import { generate } from './common.ts';
import type { DigestAlgorithms } from '../digest/mod.ts';

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
export const generateTOTP = (
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
