import { decodeHex, encodeHex } from '$encoding';
import type { DigestAlgorithms } from './mod.ts';

export type SigningModes =
  | 'HMAC:SHA-1'
  | 'HMAC:SHA-256'
  | 'HMAC:SHA-384'
  | 'HMAC:SHA-512';

/**
 * Validates that the digest algorithm is supported
 *
 * @param {DigestAlgorithms} digest - The digest algorithm to validate
 * @throws {Error} If the digest algorithm is not supported
 */
const validateDigestAlgorithm = (digest: DigestAlgorithms): void => {
  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(digest)) {
    throw new Error(
      'Invalid HMAC hash. Must be SHA-1, SHA-256, SHA-384 or SHA-512',
    );
  }
};

/**
 * Signs data using HMAC with the specified hash algorithm.
 *
 * @param {DigestAlgorithms} digest - The hash algorithm to use ({@link DigestAlgorithms}).
 * @param {string} secret - The secret key for signing.
 * @param {string | Uint8Array} data - The data to sign.
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the signature.
 *
 * @example
 * ```ts
 * const signature = await signHMAC('SHA-256', 'mysecret', 'mydata');
 * console.log(signature); // Logs the HMAC-SHA-256 signature of 'mydata'
 * ```
 *
 * @example
 * ```ts
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const signature = await signHMAC('SHA-256', 'mysecret', binaryData);
 * console.log(signature); // Logs the HMAC-SHA-256 signature of the binary data
 * ```
 */
export const signHMAC = async (
  digest: DigestAlgorithms,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => {
  try {
    validateDigestAlgorithm(digest);

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

    const dataToSign = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    const signature = await crypto.subtle.sign(
      {
        name: 'HMAC',
        hash: digest,
      },
      key,
      dataToSign,
    );

    return encodeHex(signature);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Signing failed: ${String(error)}`);
  }
};

/**
 * Verifies an HMAC signature.
 *
 * @param {DigestAlgorithms} digest - The hash algorithm to use ({@link DigestAlgorithms}).
 * @param {string} secret - The secret key for verification.
 * @param {string | Uint8Array} data - The data to verify.
 * @param {string} signature - The signature to verify.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the signature is valid.
 *
 * @example
 * ```ts
 * const isValid = await verifyHMAC('SHA-256', 'mysecret', 'mydata', 'signature');
 * console.log(isValid); // Logs true if the signature is valid, false otherwise
 * ```
 *
 * @example
 * ```ts
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const isValid = await verifyHMAC('SHA-256', 'mysecret', binaryData, 'signature');
 * console.log(isValid); // Logs true if the signature is valid, false otherwise
 * ```
 */
export const verifyHMAC = async (
  digest: DigestAlgorithms,
  secret: string,
  data: string | Uint8Array,
  signature: string,
): Promise<boolean> => {
  try {
    validateDigestAlgorithm(digest);

    if (!signature || typeof signature !== 'string') {
      throw new Error('Signature must be a non-empty string');
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

    const dataToVerify = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = decodeHex(signature);
    } catch {
      throw new Error('Invalid signature format. Must be a hex string');
    }

    return crypto.subtle.verify(
      {
        name: 'HMAC',
        hash: digest,
      },
      key,
      signatureBytes,
      dataToVerify,
    );
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Verification failed: ${String(error)}`);
  }
};

/**
 * Signs data using the specified signing mode.
 *
 * @param {SigningModes} mode - The signing mode and hash algorithm ({@link SigningModes}).
 * @param {string} secret - The secret key for signing.
 * @param {string | Uint8Array} data - The data to sign.
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the signature.
 *
 * @example
 * ```ts
 * const signature = await sign('HMAC:SHA-256', 'mysecret', 'mydata');
 * console.log(signature); // Logs the HMAC-SHA-256 signature of 'mydata'
 * ```
 *
 * @example
 * ```ts
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const signature = await sign('HMAC:SHA-256', 'mysecret', binaryData);
 * console.log(signature);
 * ```
 */
export const sign = (
  mode: SigningModes,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => {
  try {
    const [algorithm, hash] = mode.split(':');
    if (algorithm !== 'HMAC') {
      throw new Error('Invalid signing mode. Must be HMAC');
    }

    if (!hash) {
      throw new Error(
        'Invalid signing mode format. Expected "HMAC:HASH_ALGORITHM"',
      );
    }

    return signHMAC(hash as DigestAlgorithms, secret, data);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Signing failed: ${String(error)}`);
  }
};

/**
 * Verifies a signature using the specified signing mode.
 *
 * @param {SigningModes} mode - The signing mode and hash algorithm ({@link SigningModes}).
 * @param {string} secret - The secret key for verification.
 * @param {string | Uint8Array} data - The data to verify.
 * @param {string} signature - The signature to verify.
 * @returns {Promise<boolean>} A promise that resolves to a boolean indicating whether the signature is valid.
 *
 * @example
 * ```ts
 * const isValid = await verify('HMAC:SHA-256', 'mysecret', 'mydata', 'signature');
 * console.log(isValid); // Logs true if the signature is valid, false otherwise
 * ```
 *
 * @example
 * ```ts
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const isValid = await verify('HMAC:SHA-256', 'mysecret', binaryData, 'signature');
 * console.log(isValid);
 * ```
 */
export const verify = (
  mode: SigningModes,
  secret: string,
  data: string | Uint8Array,
  signature: string,
): Promise<boolean> => {
  try {
    const [algorithm, hash] = mode.split(':');
    if (algorithm !== 'HMAC') {
      throw new Error('Invalid signing mode. Must be HMAC');
    }

    if (!hash) {
      throw new Error(
        'Invalid signing mode format. Expected "HMAC:HASH_ALGORITHM"',
      );
    }

    return verifyHMAC(hash as DigestAlgorithms, secret, data, signature);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Verification failed: ${String(error)}`);
  }
};
