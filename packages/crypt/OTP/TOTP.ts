/**
 * @fileoverview Time-based One-Time Password (TOTP) implementation.
 *
 * Implements RFC 6238 for time-based one-time passwords used in
 * two-factor authentication (e.g., Google Authenticator, Authy).
 *
 * @module
 *
 * @example
 * ```typescript
 * import { generateTOTP, verifyTOTP } from '@tundralibs/crypt/OTP';
 *
 * const otp = await generateTOTP('JBSWY3DPEHPK3PXP');
 * const valid = await verifyTOTP(otp, 'JBSWY3DPEHPK3PXP');
 * ```
 */

import {
  constantTimeEqual,
  generate,
  type TOTPOptions,
  type TOTPVerifyOptions,
} from './common.ts';

/**
 * Generates a Time-based One-Time Password (TOTP) as defined in RFC 6238.
 *
 * @param {string} key - The secret key (Base32 string or UTF-8 string, minimum 16 characters)
 * @param {TOTPOptions} [options] - Optional parameters for OTP generation
 * @param {number} [options.epoch=Date.now()] - The epoch time in milliseconds
 * @param {number} [options.period=30] - The time period in seconds (must be at least 1)
 * @param {number} [options.length=6] - The length of the OTP
 * @param {DigestAlgorithms} [options.algo='SHA-1'] - The hash algorithm to use;
 *   `'SHA-1'` is the RFC 6238 interop default authenticator apps assume
 * @returns {Promise<string>} A promise that resolves to the generated TOTP
 *
 * @throws {Error} When the time period is less than 1 second
 *
 * @example
 * ```typescript
 * // Simple usage with defaults (current time, 30s period, 6 digits)
 * const otp = await generateTOTP('JBSWY3DPEHPK3PXP');
 *
 * // Custom options with Base32 secret
 * const otp2 = await generateTOTP('JBSWY3DPEHPK3PXP', {
 *   period: 60,
 *   length: 8,
 *   algo: 'SHA-512'
 * });
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc6238|RFC 6238 - TOTP}
 */
export const generateTOTP = (
  key: string,
  options?: TOTPOptions,
): Promise<string> => {
  const {
    epoch = Date.now(),
    period = 30,
    length = 6,
    algo = 'SHA-1',
  } = options ?? {};

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
 * @param {string} key - The secret key (Base32 string or UTF-8 string, minimum 16 characters)
 * @param {TOTPVerifyOptions} [options] - Optional parameters for OTP verification
 * @param {number} [options.window=1] - The number of time steps to check before and after the current one
 * @param {number} [options.epoch=Date.now()] - The epoch time in milliseconds
 * @param {number} [options.period=30] - The time period in seconds (must be at least 1)
 * @param {number} [options.length=6] - The length of the OTP
 * @param {DigestAlgorithms} [options.algo='SHA-1'] - The hash algorithm to use;
 *   must match generation — the `'SHA-1'` default matches {@link generateTOTP}
 *   and {@link generateOTPAuthURL}
 * @returns {Promise<boolean>} A promise that resolves to true if the OTP is valid, false otherwise
 *
 * @throws {Error} When the time period is less than 1 second
 * @throws {Error} When the window is not a non-negative integer
 * @throws {Error} When the secret key is too short
 *
 * @example
 * ```typescript
 * // Verify a TOTP with default settings
 * const isValid = await verifyTOTP('123456', 'JBSWY3DPEHPK3PXP');
 *
 * // Verify with custom options
 * const isValid2 = await verifyTOTP('987654', 'JBSWY3DPEHPK3PXP', {
 *   window: 2,
 *   period: 60,
 *   length: 8,
 *   algo: 'SHA-512'
 * });
 * ```
 *
 * @see {@link generateTOTP} for generating TOTP codes
 * @see {@link verifyHOTP} for counter-based verification
 */
export const verifyTOTP = async (
  otp: string,
  key: string,
  options?: TOTPVerifyOptions,
): Promise<boolean> => {
  const {
    window = 1,
    epoch = Date.now(),
    period = 30,
    length = 6,
    algo = 'SHA-1',
  } = options ?? {};

  if (period < 1) {
    throw new Error('Time period must be at least 1 second');
  }

  if (window < 0 || !Number.isInteger(window)) {
    throw new Error('Window must be a non-negative integer');
  }

  if (!otp?.length || otp.length !== length || !/^\d+$/.test(otp)) {
    return false;
  }

  const currentCounter = Math.floor(epoch / (period * 1000));

  // Scan every counter in the window and combine the results without
  // short-circuiting, so neither the per-code comparison nor the loop reveals
  // which step matched via early return.
  let matched = false;
  for (let i = -window; i <= window; i++) {
    const counter = currentCounter + i;
    if (counter < 0) continue;

    const generatedOTP = await generate(key, counter, length, algo);
    matched = constantTimeEqual(otp, generatedOTP) || matched;
  }

  return matched;
};
