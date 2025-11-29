import {
  type DigestAlgorithms,
  validateDigestAlgorithm,
} from '../digest/mod.ts';
import { decodeHex } from '$encoding';
import type { SigningModes } from './types.ts';

/**
 * Parses a PEM-formatted public key string to extract the raw key data.
 *
 * @param {string} pemKey - The PEM-formatted public key string
 * @returns {Uint8Array} The raw key data
 * @throws {Error} When the PEM format is invalid or the key cannot be extracted
 */
const parsePEMPublicKey = (pemKey: string): Uint8Array => {
  // Remove PEM headers, footers, and whitespace
  const base64Key = pemKey
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replaceAll(/\s/g, '');

  try {
    // Decode the base64 key data
    return Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  } catch (error) {
    throw new Error(`Invalid PEM public key format: ${error}`);
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
    signatureBytes as BufferSource,
    dataToVerify as BufferSource,
  );
};

/**
 * Verifies an RSA-PSS signature.
 *
 * Uses the Web Crypto API for RSA-PSS digital signature verification. Expects a PEM-formatted
 * public key and a base64-encoded signature.
 *
 * @param {SigningModes} mode - The RSA signing mode (e.g., 'RSA-PSS:2048:SHA-256')
 * @param {string} publicKey - The RSA public key in PEM format
 * @param {string | Uint8Array} data - The data to verify, either as a string or binary data
 * @param {string} signature - The signature to verify as a base64-encoded string
 * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise
 *
 * @throws {Error} When the RSA mode format is invalid (must be 'RSA-PSS:keySize:hashAlgorithm')
 * @throws {Error} When the key size is not supported (must be 2048, 3072, or 4096)
 * @throws {Error} When the hash algorithm is not supported (must be SHA-256, SHA-384, or SHA-512)
 * @throws {Error} When the public key is in invalid PEM format
 * @throws {Error} When the signature is invalid base64
 * @throws {Error} When the RSA verification operation fails
 *
 * @example
 * ```typescript
 * const publicKey = `-----BEGIN PUBLIC KEY-----
 * MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
 * -----END PUBLIC KEY-----`;
 *
 * const isValid = await verifyRSA(
 *   'RSA-PSS:2048:SHA-256',
 *   publicKey,
 *   'important document',
 *   'base64EncodedSignature=='
 * );
 * console.log(isValid); // true if signature is valid
 * ```
 *
 * @see {@link signRSA} for RSA-PSS signing
 * @see {@link verify} for the wrapper function
 * @see {@link SigningModes} for supported modes
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify} Web Crypto API verify
 */
export const verifyRSA = async (
  mode: SigningModes,
  publicKey: string,
  data: string | Uint8Array,
  signature: string,
): Promise<boolean> => {
  const parts = mode.split(':');
  if (parts.length !== 3 || parts[0] !== 'RSA-PSS') {
    throw new Error(
      'Invalid RSA mode format. Expected "RSA-PSS:keySize:hashAlgorithm"',
    );
  }

  const [, lengthStr, hashAlgorithm] = parts;

  if (!lengthStr || !hashAlgorithm) {
    throw new Error(
      'Invalid RSA mode format. Expected "RSA-PSS:keySize:hashAlgorithm"',
    );
  }

  const keySize = Number.parseInt(lengthStr, 10);
  if (![2048, 3072, 4096].includes(keySize)) {
    throw new Error(
      'Invalid RSA key size. Must be 2048, 3072, or 4096',
    );
  }

  if (!['SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-256, SHA-384, or SHA-512',
    );
  }

  if (!signature || typeof signature !== 'string') {
    throw new Error('Signature must be a non-empty string');
  }

  // Parse the PEM public key
  const keyData = parsePEMPublicKey(publicKey);

  // Import the public key
  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    keyData as BufferSource,
    {
      name: 'RSA-PSS',
      hash: hashAlgorithm,
    },
    false,
    ['verify'],
  );

  // Prepare the data to verify
  const dataToVerify = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Decode the base64 signature
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  } catch (error) {
    throw new Error(
      `Invalid signature format. Must be a base64 string: ${error}`,
    );
  }

  // Calculate salt length based on hash algorithm (typically hash length)
  let saltLength: number;
  if (hashAlgorithm === 'SHA-256') {
    saltLength = 32;
  } else if (hashAlgorithm === 'SHA-384') {
    saltLength = 48;
  } else if (hashAlgorithm === 'SHA-512') {
    saltLength = 64;
  } else {
    saltLength = 32;
  }

  // Verify the signature
  return crypto.subtle.verify(
    {
      name: 'RSA-PSS',
      saltLength,
    },
    cryptoKey,
    signatureBytes as BufferSource,
    dataToVerify as BufferSource,
  );
};

/**
 * Verifies a signature using the specified signing mode.
 *
 * Supports both HMAC and RSA-PSS signature verification. For HMAC modes, uses the secret as a symmetric key.
 * For RSA modes, the secret parameter should be the public key in PEM format.
 *
 * @param {SigningModes} mode - The signing mode and parameters ({@link SigningModes})
 * @param {string} secret - For HMAC: secret key, For RSA: public key in PEM format
 * @param {string | Uint8Array} data - The data to verify, either as a string or binary data
 * @param {string} signature - The signature to verify (hex for HMAC, base64 for RSA)
 * @returns {Promise<boolean>} A promise that resolves to true if the signature is valid, false otherwise
 *
 * @throws {Error} When the signing mode is invalid or verification operation fails
 *
 * @example
 * ```typescript
 * // HMAC verification
 * const isValid = await verify('HMAC:SHA-256', 'mysecret', 'mydata', 'hexSignature');
 * console.log(isValid); // true if signature is valid
 *
 * // RSA-PSS verification
 * const publicKey = '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----';
 * const rsaValid = await verify('RSA-PSS:2048:SHA-256', publicKey, 'mydata', 'base64Signature');
 * console.log(rsaValid); // true if RSA signature is valid
 * ```
 *
 * @see {@link verifyHMAC} for HMAC verification
 * @see {@link verifyRSA} for RSA-PSS verification
 * @see {@link sign} for signature creation
 * @see {@link SigningModes} for supported modes
 */
export const verify = (
  mode: SigningModes,
  secret: string,
  data: string | Uint8Array,
  signature: string,
): Promise<boolean> => {
  if (mode.startsWith('RSA-')) {
    return verifyRSA(mode, secret, data, signature);
  } else {
    const [algorithm, hash] = mode.split(':');
    if (algorithm !== 'HMAC') {
      throw new Error('Invalid signing mode. Must be HMAC or RSA-PSS');
    }

    if (!hash) {
      throw new Error(
        'Invalid signing mode format. Expected "HMAC:HASH_ALGORITHM"',
      );
    }

    return verifyHMAC(hash as DigestAlgorithms, secret, data, signature);
  }
};
