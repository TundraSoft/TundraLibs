/**
 * @fileoverview HMAC-based One-Time Password (HOTP) implementation.
 *
 * Implements RFC 4226 for counter-based one-time passwords used in
 * two-factor authentication and secure login systems.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { generateHOTP, verifyHOTP } from '@tundralibs/crypt/OTP';
 *
 * const otp = await generateHOTP('JBSWY3DPEHPK3PXP', 0);
 * const valid = await verifyHOTP(otp, 'JBSWY3DPEHPK3PXP', 0);
 * ```
 */

import { constantTimeEqual, generate, type HOTPOptions } from './common.ts';

/**
 * Generates a counter/hash One-Time Password (HOTP) as defined in RFC 4226.
 *
 * @param {string} key - The secret key (Base32 string or UTF-8 string, minimum 16 characters)
 * @param {number} counter - The counter value (non-negative integer)
 * @param {HOTPOptions} [options] - Optional parameters for OTP generation
 * @param {number} [options.length=6] - The length of the OTP
 * @param {DigestAlgorithms} [options.algo='SHA-1'] - The hash algorithm to use;
 *   `'SHA-1'` is the RFC 4226 interop default authenticator apps assume
 * @returns {Promise<string>} A promise that resolves to the generated HOTP
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const otp = await generateHOTP('JBSWY3DPEHPK3PXP', 0);
 * console.log(otp); // 6-digit OTP
 *
 * // Custom options
 * const otp2 = await generateHOTP('JBSWY3DPEHPK3PXP', 5, {
 *   length: 8,
 *   algo: 'SHA-512'
 * });
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc4226|RFC 4226 - HOTP}
 */
export const generateHOTP = (
  key: string,
  counter: number,
  options?: HOTPOptions,
): Promise<string> => {
  const { length = 6, algo = 'SHA-1' } = options ?? {};
  return generate(key, counter, length, algo);
};

/**
 * Verifies a counter/hash One-Time Password (HOTP).
 *
 * @param {string} otp - The OTP to verify
 * @param {string} key - The secret key (Base32 string or UTF-8 string, minimum 16 characters)
 * @param {number} counter - The counter value (non-negative integer)
 * @param {HOTPOptions} [options] - Optional parameters for OTP verification
 * @param {number} [options.length=6] - The length of the OTP
 * @param {DigestAlgorithms} [options.algo='SHA-1'] - The hash algorithm to use;
 *   must match generation — the `'SHA-1'` default matches {@link generateHOTP}
 * @returns {Promise<boolean>} True if the OTP is valid, false otherwise
 *
 * @example
 * ```typescript
 * // Simple verification
 * const isValid = await verifyHOTP('123456', 'JBSWY3DPEHPK3PXP', 0);
 *
 * // With custom options
 * const isValid2 = await verifyHOTP('12345678', 'JBSWY3DPEHPK3PXP', 5, {
 *   length: 8,
 *   algo: 'SHA-512'
 * });
 * ```
 */
export const verifyHOTP = async (
  otp: string,
  key: string,
  counter: number,
  options?: HOTPOptions,
): Promise<boolean> => {
  const { length = 6, algo = 'SHA-1' } = options ?? {};

  if (!otp || otp?.length !== length || !/^\d+$/.test(otp)) {
    return false;
  }

  const generatedOTP = await generate(key, counter, length, algo);
  return constantTimeEqual(otp, generatedOTP);
};
