import type { DigestAlgorithms } from './digest.ts';
import { sprintf } from '$fmt/printf';

/**
 * Converts a number to an 8-byte array (Uint8Array).
 *
 * @param {number} data - The number to convert.
 * @returns {Uint8Array} The resulting 8-byte array.
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
 * Generates a one-time password (OTP) using HMAC-based algorithm.
 *
 * @param {string} key - The secret key for HMAC.
 * @param {number} counter - The counter value.
 * @param {number} [length=6] - The length of the OTP.
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use. ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated OTP.
 */
const generate = async (
  key: string,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => {
  // Validate inputs
  if (!key || key.length < 16) {
    throw new Error('Secret key should be at least 16 characters long');
  }
  if (counter < 0) {
    throw new Error('Counter must be a non-negative integer');
  }
  if (length < 0) {
    throw new Error('OTP length must be a non-negative integer');
  }
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(algo)) {
    throw new Error('The provided algorithm name is not supported');
  }

  // if (length < 4 || length > 10) {
  //   throw new Error('OTP length must be between 4 and 10');
  // }

  const _key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(key),
      { name: 'HMAC', hash: algo },
      false,
      ['sign', 'verify'],
    ),
    digest = new Uint8Array(
      await crypto.subtle.sign('HMAC', _key, numberToBytes(counter)),
    ),
    offset = digest[digest.byteLength - 1]! & 0x0f,
    code = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)
      .getUint32(offset) & 0x7fffffff,
    op = (code % 10 ** length).toString();
  return sprintf('%0' + length + 's', op);
};

/**
 * Generates a Time-based One-Time Password (TOTP).
 *
 * @param {string} key - The secret key for HMAC.
 * @param {number} [epoch=Date.now()] - The epoch time.
 * @param {number} [period=30] - The time period in seconds.
 * @param {number} [length=6] - The length of the OTP.
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use. ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated TOTP.
 */
export const TOTP = (
  key: string,
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
 * Generates a HMAC-based One-Time Password (HOTP).
 *
 * @param {string} key - The secret key for HMAC.
 * @param {number} counter - The counter value.
 * @param {number} [length=6] - The length of the OTP.
 * @param {DigestAlgorithms} [algo='SHA-256'] - The hash algorithm to use. ({@link DigestAlgorithms})
 * @returns {Promise<string>} A promise that resolves to the generated HOTP.
 */
export const HOTP = (
  key: string,
  counter: number,
  length: number = 6,
  algo: DigestAlgorithms = 'SHA-256',
): Promise<string> => generate(key, counter, length, algo);
