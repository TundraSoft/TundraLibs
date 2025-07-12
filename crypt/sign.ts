import { decodeHex, encodeHex } from '$encoding';
import type { DigestAlgorithms } from './mod.ts';

/**
 * Supported HMAC signing modes combining algorithm and hash function.
 *
 * Format: `HMAC:{HashAlgorithm}` where HashAlgorithm is one of the supported
 * cryptographic hash functions.
 *
 * @see {@link DigestAlgorithms} for supported hash algorithms
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign} Web Crypto API sign
 */
export type SigningModes =
  | 'HMAC:SHA-1'
  | 'HMAC:SHA-256'
  | 'HMAC:SHA-384'
  | 'HMAC:SHA-512';

/**
 * Validates that the digest algorithm is supported for HMAC operations.
 *
 * @param {DigestAlgorithms} digest - The digest algorithm to validate ({@link DigestAlgorithms})
 * @throws {Error} When the digest algorithm is not supported
 *
 * @example
 * ```typescript
 * validateDigestAlgorithm('SHA-256'); // Valid, no error
 * validateDigestAlgorithm('MD5'); // Throws error
 * ```
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
 * Creates a Hash-based Message Authentication Code (HMAC) using the Web Crypto API.
 * The signature is returned as a hexadecimal string for easy transmission and storage.
 *
 * @param {DigestAlgorithms} digest - The hash algorithm to use ({@link DigestAlgorithms})
 * @param {string} secret - The secret key for signing (any length)
 * @param {string | Uint8Array} data - The data to sign, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the hexadecimal representation of the signature
 *
 * @throws {Error} When the digest algorithm is not supported
 * @throws {Error} When signing operation fails
 *
 * @example
 * ```typescript
 * // Sign a string with SHA-256
 * const signature = await signHMAC('SHA-256', 'mySecretKey', 'important data');
 * console.log(signature); // "5a45d6d13019b54096f18218194c22cc7fb126c800d4c5c6f4c8bebd16dc32e5"
 * ```
 *
 * @example
 * ```typescript
 * // Sign binary data with SHA-512
 * const binaryData = new Uint8Array([1, 2, 3, 4]);
 * const signature = await signHMAC('SHA-512', 'mySecretKey', binaryData);
 * console.log(signature); // HMAC-SHA-512 signature of the binary data
 * ```
 *
 * @see {@link verifyHMAC} for signature verification
 * @see {@link sign} for the wrapper function
 * @see {@link DigestAlgorithms} for supported algorithms
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign} Web Crypto API sign
 */
export const signHMAC = async (
  digest: DigestAlgorithms,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => {
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
};
