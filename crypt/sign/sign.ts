import {
  type DigestAlgorithms,
  validateDigestAlgorithm,
} from '../digest/mod.ts';
import type { SigningModes } from './types.ts';
import { encodeHex } from '$encoding';

/**
 * Parses a PEM-formatted private key string to extract the raw key data.
 *
 * @param {string} pemKey - The PEM-formatted private key string
 * @returns {Uint8Array} The raw key data
 * @throws {Error} When the PEM format is invalid or the key cannot be extracted
 */
const parsePEMPrivateKey = (pemKey: string): Uint8Array => {
  // Remove PEM headers, footers, and whitespace
  const base64Key = pemKey
    .replace(/-----BEGIN [A-Z ]+-----/, '')
    .replace(/-----END [A-Z ]+-----/, '')
    .replaceAll(/\s/g, '');

  try {
    // Decode the base64 key data
    return Uint8Array.from(atob(base64Key), (c) => c.codePointAt(0) ?? 0);
  } catch {
    throw new Error('Invalid PEM private key format');
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
    dataToSign as BufferSource,
  );

  return encodeHex(signature);
};

/**
 * Signs data using RSA-PSS with the specified key size and hash algorithm.
 *
 * Uses the Web Crypto API for RSA-PSS digital signature creation. The signature is returned
 * as a base64-encoded string for easy transmission and storage.
 *
 * @param {SigningModes} mode - The RSA signing mode (e.g., 'RSA-PSS:2048:SHA-256')
 * @param {string} privateKey - The RSA private key in PEM format
 * @param {string | Uint8Array} data - The data to sign, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the base64 representation of the signature
 *
 * @throws {Error} When the RSA mode format is invalid (must be 'RSA-PSS:keySize:hashAlgorithm')
 * @throws {Error} When the key size is not supported (must be 2048, 3072, or 4096)
 * @throws {Error} When the hash algorithm is not supported (must be SHA-256, SHA-384, or SHA-512)
 * @throws {Error} When the private key is in invalid PEM format
 * @throws {Error} When the RSA signing operation fails
 *
 * @example
 * ```typescript
 * const privateKey = `-----BEGIN PRIVATE KEY-----
 * MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
 * -----END PRIVATE KEY-----`;
 *
 * const signature = await signRSA(
 *   'RSA-PSS:2048:SHA-256',
 *   privateKey,
 *   'important document'
 * );
 * console.log(signature); // Base64-encoded RSA-PSS signature
 * ```
 *
 * @see {@link verifyRSA} for signature verification
 * @see {@link sign} for the wrapper function
 * @see {@link SigningModes} for supported modes
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/sign} Web Crypto API sign
 */
export const signRSA = async (
  mode: SigningModes,
  privateKey: string,
  data: string | Uint8Array,
): Promise<string> => {
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

  // Parse the PEM private key
  const keyData = parsePEMPrivateKey(privateKey);

  // Import the private key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData as BufferSource,
    {
      name: 'RSA-PSS',
      hash: hashAlgorithm,
    },
    false,
    ['sign'],
  );

  // Prepare the data to sign
  const dataToSign = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Calculate salt length based on hash algorithm (typically hash length)
  const saltLength = hashAlgorithm === 'SHA-256'
    ? 32
    : hashAlgorithm === 'SHA-384' //NOSONAR
    ? 48
    : hashAlgorithm === 'SHA-512' //NOSONAR
    ? 64
    : 32;

  // Sign the data
  const signature = await crypto.subtle.sign(
    {
      name: 'RSA-PSS',
      saltLength,
    },
    cryptoKey,
    dataToSign as BufferSource,
  );

  // Return the signature as base64
  return btoa(String.fromCodePoint(...new Uint8Array(signature)));
};

/**
 * Signs data using the specified signing mode.
 *
 * Supports both HMAC and RSA-PSS signing modes. For HMAC modes, uses the secret as a symmetric key.
 * For RSA modes, the secret parameter should be the private key in PEM format.
 *
 * @param {SigningModes} mode - The signing mode and parameters ({@link SigningModes})
 * @param {string} secret - For HMAC: secret key, For RSA: private key in PEM format
 * @param {string | Uint8Array} data - The data to sign, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the signature (hex for HMAC, base64 for RSA)
 *
 * @throws {Error} When the signing mode is invalid or signing operation fails
 *
 * @example
 * ```typescript
 * // HMAC signing
 * const signature = await sign('HMAC:SHA-256', 'mysecret', 'mydata');
 * console.log(signature); // Logs the HMAC-SHA-256 signature of 'mydata'
 *
 * // RSA-PSS signing
 * const privateKey = '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----';
 * const rsaSignature = await sign('RSA-PSS:2048:SHA-256', privateKey, 'mydata');
 * console.log(rsaSignature); // Base64-encoded RSA-PSS signature
 * ```
 *
 * @see {@link signHMAC} for HMAC signing
 * @see {@link signRSA} for RSA-PSS signing
 * @see {@link verify} for signature verification
 * @see {@link SigningModes} for supported modes
 */
export const sign = (
  mode: SigningModes,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => {
  if (mode.startsWith('RSA-')) {
    return signRSA(mode, secret, data);
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

    return signHMAC(hash as DigestAlgorithms, secret, data);
  }
};
