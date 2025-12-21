import { generate, type HOTPOptions } from './common.ts';

/**
 * Generates a counter/hash One-Time Password (HOTP) as defined in RFC 4226.
 *
 * @param {string} key - The secret key for HMAC (minimum 16 characters)
 * @param {number} counter - The counter value (non-negative integer)
 * @param {HOTPOptions} [options] - Optional parameters for OTP generation
 * @param {number} [options.length=6] - The length of the OTP
 * @param {DigestAlgorithms} [options.algo='SHA-256'] - The hash algorithm to use
 * @returns {Promise<string>} A promise that resolves to the generated HOTP
 *
 * @example
 * ```typescript
 * // Simple usage with defaults
 * const otp = await generateHOTP('mySecretKey123456', 0);
 * console.log(otp); // 6-digit OTP
 *
 * // Custom options
 * const otp2 = await generateHOTP('mySecretKey123456', 5, {
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
  const { length = 6, algo = 'SHA-256' } = options ?? {};
  return generate(key, counter, length, algo);
};

/**
 * Verifies a counter/hash One-Time Password (HOTP).
 *
 * @param {string} otp - The OTP to verify
 * @param {string} key - The secret key for HMAC (minimum 16 characters)
 * @param {number} counter - The counter value (non-negative integer)
 * @param {HOTPOptions} [options] - Optional parameters for OTP verification
 * @param {number} [options.length=6] - The length of the OTP
 * @param {DigestAlgorithms} [options.algo='SHA-256'] - The hash algorithm to use
 * @returns {Promise<boolean>} True if the OTP is valid, false otherwise
 *
 * @example
 * ```typescript
 * // Simple verification
 * const isValid = await verifyHOTP('123456', 'mySecretKey123456', 0);
 *
 * // With custom options
 * const isValid2 = await verifyHOTP('12345678', 'mySecretKey123456', 5, {
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
  const { length = 6, algo = 'SHA-256' } = options ?? {};

  if (!otp || otp?.length !== length || !/^\d+$/.test(otp)) {
    return false;
  }

  const generatedOTP = await generate(key, counter, length, algo);
  return otp === generatedOTP;
};
