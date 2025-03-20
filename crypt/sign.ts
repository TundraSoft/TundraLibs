import { decodeHex, encodeHex } from '$encoding';
import type { DigestAlgorithms } from './mod.ts';

export type SigningModes =
  | 'HMAC:SHA-1'
  | 'HMAC:SHA-256'
  | 'HMAC:SHA-384'
  | 'HMAC:SHA-512';

/**
 * Signs data using HMAC with the specified hash algorithm.
 *
 * @param {DigestAlgorithms} digest - The hash algorithm to use ({@link DigestAlgorithms}).
 * @param {string} secret - The secret key for signing.
 * @param {string} data - The data to sign.
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the signature.
 *
 * @example
 * ```ts
 * const signature = await signHMAC('SHA-256', 'mysecret', 'mydata');
 * console.log(signature); // Logs the HMAC-SHA-256 signature of 'mydata'
 * ```
 */
export const signHMAC = async (
  digest: DigestAlgorithms,
  secret: string,
  data: string,
): Promise<string> => {
  if (['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].indexOf(digest) === -1) {
    throw new Error(
      'Invalid HMAC hash. Must be SHA-1, SHA-256, SHA-384 or SHA-512',
    );
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: digest,
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    {
      name: 'HMAC',
      hash: digest,
    },
    key,
    new TextEncoder().encode(data),
  );
  return encodeHex(signature);
};

/**
 * Verifies an HMAC signature.
 *
 * @param {DigestAlgorithms} digest - The hash algorithm to use ({@link DigestAlgorithms}).
 * @param {string} secret - The secret key for verification.
 * @param {string} data - The data to verify.
 * @param {string} signature - The signature to verify.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the signature is valid.
 *
 * @example
 * ```ts
 * const isValid = await verifyHMAC('SHA-256', 'mysecret', 'mydata', 'signature');
 * console.log(isValid); // Logs true if the signature is valid, false otherwise
 * ```
 */
export const verifyHMAC = async (
  digest: DigestAlgorithms,
  secret: string,
  data: string,
  signature: string,
): Promise<boolean> => {
  if (['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].indexOf(digest) === -1) {
    throw new Error(
      'Invalid HMAC hash. Must be SHA-1, SHA-256, SHA-384 or SHA-512',
    );
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: 'HMAC',
      hash: digest,
    },
    false,
    ['verify'],
  );
  return crypto.subtle.verify(
    {
      name: 'HMAC',
      hash: digest,
    },
    key,
    decodeHex(signature),
    new TextEncoder().encode(data),
  );
};

/**
 * Signs data using the specified signing mode.
 *
 * @param {SigningModes} mode - The signing mode and hash algorithm ({@link DigestAlgorithms}).
 * @param {string} secret - The secret key for signing.
 * @param {string} data - The data to sign.
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the signature.
 *
 * @example
 * ```ts
 * const signature = await sign('HMAC:SHA-256', 'mysecret', 'mydata');
 * console.log(signature); // Logs the HMAC-SHA-256 signature of 'mydata'
 * ```
 */
export const sign = (
  mode: SigningModes,
  secret: string,
  data: string,
): Promise<string> => {
  const [algorithm, hash] = mode.split(':');
  if (algorithm !== 'HMAC') {
    throw new Error('Invalid signing mode. Must be HMAC');
  }
  // No need for if-else here since we already checked above
  return signHMAC(hash! as DigestAlgorithms, secret, data);
};

/**
 * Verifies a signature using the specified signing mode.
 *
 * @param {SigningModes} mode - The signing mode and hash algorithm ({@link DigestAlgorithms}).
 * @param {string} secret - The secret key for verification.
 * @param {string} data - The data to verify.
 * @param {string} signature - The signature to verify.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the signature is valid.
 *
 * @example
 * ```ts
 * const isValid = await verify('HMAC:SHA-256', 'mysecret', 'mydata', 'signature');
 * console.log(isValid); // Logs true if the signature is valid, false otherwise
 * ```
 */
export const verify = (
  mode: SigningModes,
  secret: string,
  data: string,
  signature: string,
): Promise<boolean> => {
  const [algorithm, hash] = mode.split(':');
  if (algorithm !== 'HMAC') {
    throw new Error('Invalid signing mode. Must be HMAC');
  }
  // No need for if-else here since we already checked above
  return verifyHMAC(hash! as DigestAlgorithms, secret, data, signature);
};
