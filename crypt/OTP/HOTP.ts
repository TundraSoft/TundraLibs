import { generate } from './common.ts';
import type { DigestAlgorithms } from '../digest/mod.ts';

/**
 * Generates a counter/hash One-Time Password (HOTP) as defined in RFC 4226.
 *
 * @param {string | Uint8Array} key - The secret key for HMAC.
 * @param {number} counter - The counter value.
 * @param {number} [length=6] - The length of the OTP.
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use. ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated HOTP.
 *
 * @see {@link https://tools.ietf.org/html/rfc4226|RFC 4226 - HOTP}
 */
export const generateHOTP = (
  key: string | Uint8Array,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => generate(key, counter, length, algo);

/**
 * Verifies an counter/hash One-Time Password (HOTP).
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
