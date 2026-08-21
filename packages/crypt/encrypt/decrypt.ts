/**
 * @fileoverview Data decryption functions.
 *
 * Provides decryption for AES and RSA encrypted data using the Web Crypto API.
 * Supports AES-GCM, AES-CBC, AES-CTR modes and RSA-OAEP.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { decryptAES, decryptRSA } from '@tundralibs/crypt/encrypt';
 *
 * declare const encryptedData: string;
 * declare const encrypted: string;
 * declare const privateKeyPEM: string;
 *
 * const decrypted = await decryptAES(encryptedData, 'password');
 * const rsaDecrypted = await decryptRSA(encrypted, privateKeyPEM);
 * ```
 */

import { decodeHex } from '@std/encoding';
import type { AESOptions, RSAOptions } from './types/mod.ts';
import { deriveMacSecret, derivePBKDF2Key } from './kdf.ts';
import { verifyHMAC } from '../sign/mod.ts';

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
 * Decrypts data produced by {@link encryptAES}.
 *
 * Expects the envelope produced by {@link encryptAES}: hex
 * `data:iv:salt` for `GCM`, or `data:iv:salt:mac` for `CBC`/`CTR`. The AES key
 * is re-derived from the supplied secret + embedded salt with PBKDF2-SHA-256.
 *
 * Security — all modes are authenticated:
 * `GCM` rejects tampered ciphertext natively (AEAD). For `CBC`/`CTR` this
 * function verifies the encrypt-then-MAC HMAC-SHA-256 (constant-time, via
 * {@link verifyHMAC}) over the `data:iv:salt` envelope **before** decrypting,
 * and throws if it does not match — so a modified envelope or wrong secret is
 * rejected rather than returning corrupted plaintext.
 *
 * @param {string} data - The ciphertext envelope from {@link encryptAES}
 * @param {string} secret - The secret used at encryption time
 * @param {AESOptions} [options] - Optional decryption settings (mode, keyLength, returnBinary)
 * @returns {Promise<string>} A promise that resolves to the decrypted data as a string
 *
 * @throws {Error} When the encryption mode is invalid (must be GCM, CBC, or CTR)
 * @throws {Error} When the key length is not supported (must be 128, 192, or 256)
 * @throws {Error} When the envelope shape is wrong (`data:iv:salt` for GCM,
 *   `data:iv:salt:mac` for CBC/CTR)
 * @throws {Error} When CBC/CTR authentication fails (tampered ciphertext or wrong secret)
 * @throws {Error} When the IV/counter or salt is empty
 *
 * @see {@link encryptAES} for encryption
 * @see {@link AESOptions} for available options
 */
export async function decryptAES(
  data: string,
  secret: string,
  options?: AESOptions,
): Promise<string>;

/**
 * Decrypts data using AES encryption and returns binary data.
 *
 * @param {string} data - The ciphertext envelope from {@link encryptAES}, hex `data:iv:salt`
 * @param {string} secret - The secret used at encryption time
 * @param {AESOptions & { returnBinary: true }} options - Options with returnBinary set to true
 * @returns {Promise<Uint8Array>} A promise that resolves to the decrypted data as Uint8Array
 *
 * @example
 * ```typescript
 * declare const encryptedEnvelope: string;
 *
 * const decryptedBinary = await decryptAES(
 *   encryptedEnvelope,
 *   'secret',
 *   { returnBinary: true }
 * );
 * console.log(decryptedBinary); // Uint8Array([1, 2, 3, 4, 5])
 * ```
 */
export async function decryptAES(
  data: string,
  secret: string,
  options: AESOptions & { returnBinary: true },
): Promise<Uint8Array>;

/**
 * Implementation of decryptAES
 */
export async function decryptAES(
  data: string,
  secret: string,
  options?: AESOptions & { returnBinary?: boolean },
): Promise<string | Uint8Array> {
  const mode = options?.mode ?? 'GCM';
  const keyLength = options?.keyLength ?? 256;
  const returnBinary = options?.returnBinary ?? false;

  if (!['GCM', 'CBC', 'CTR'].includes(mode)) {
    throw new Error(
      'Invalid AES encryption mode. Must be GCM, CBC, or CTR',
    );
  }

  if (![128, 192, 256].includes(keyLength)) {
    throw new Error(
      'Invalid AES key length. Must be 128, 192, or 256',
    );
  }

  const parts = data.split(':');
  // GCM (AEAD) envelopes are 3-part `data:iv:salt`. CBC/CTR carry a 4th
  // encrypt-then-MAC HMAC part: `data:iv:salt:mac`.
  const expectedParts = mode === 'GCM' ? 3 : 4;
  if (parts.length !== expectedParts) {
    throw new Error(
      mode === 'GCM'
        ? 'Invalid encrypted data format. Expected "data:iv:salt"'
        : 'Invalid encrypted data format. Expected "data:iv:salt:mac"',
    );
  }

  // Authenticate CBC/CTR before touching the ciphertext (encrypt-then-MAC,
  // verify-then-decrypt). A failed check means the envelope was tampered with
  // or the secret is wrong — reject rather than return corrupted plaintext.
  if (mode !== 'GCM') {
    const valid = await verifyHMAC(
      parts.slice(0, 3).join(':'),
      parts[3]!,
      deriveMacSecret(secret),
    );
    if (!valid) {
      throw new Error(
        'Authentication failed: ciphertext was tampered with or the secret is incorrect',
      );
    }
  }

  const [encrypted, ivOrCounter, salt] = parts.slice(0, 3).map((x) =>
    decodeHex(x)
  ) as [
    Uint8Array,
    Uint8Array,
    Uint8Array,
  ];

  if (ivOrCounter.length === 0) {
    throw new Error('Initialization vector (IV) or counter is undefined');
  }

  if (salt.length === 0) {
    throw new Error('Salt is missing from encrypted envelope');
  }

  const algorithm: 'AES-GCM' | 'AES-CBC' | 'AES-CTR' = `AES-${mode}`;
  const key = await derivePBKDF2Key(secret, salt, algorithm, keyLength);

  const decryptConfig: AesGcmParams | AesCbcParams | AesCtrParams = mode ===
      'CTR'
    ? {
      name: 'AES-CTR',
      counter: ivOrCounter as BufferSource,
      length: 64,
    }
    : { name: algorithm, iv: ivOrCounter as BufferSource };

  const decrypted = await crypto.subtle.decrypt(
    decryptConfig,
    key,
    encrypted as BufferSource,
  );

  return returnBinary
    ? new Uint8Array(decrypted)
    : new TextDecoder().decode(decrypted);
}

/**
 * Decrypts data produced by {@link encryptRSA} (RSA-OAEP).
 *
 * Uses the Web Crypto API for secure RSA decryption. Expects a PEM-formatted private key
 * and base64-encoded encrypted data. The key size comes from the key itself —
 * only the OAEP hash algorithm (which must match encryption) is configurable.
 *
 * @param {string} data - The encrypted data as a base64-encoded string
 * @param {string} privateKey - The RSA private key in PEM format
 * @param {RSAOptions} [options] - Optional decryption settings (OAEP hash algorithm)
 * @returns {Promise<string>} A promise that resolves to the decrypted data as a string
 *
 * @throws {Error} When the hash algorithm is not supported (must be SHA-1, SHA-256, SHA-384, or SHA-512)
 * @throws {Error} When the private key is in invalid PEM format
 * @throws {Error} When the encrypted data is invalid base64
 * @throws {Error} When the RSA decryption operation fails
 *
 * @example
 * ```typescript
 * const privateKey = `-----BEGIN PRIVATE KEY-----
 * MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC...
 * -----END PRIVATE KEY-----`;
 *
 * // Decrypt with defaults (RSA-OAEP-2048-SHA-256)
 * const decrypted = await decryptRSA('base64EncryptedData==', privateKey);
 * console.log(decrypted); // "my sensitive data"
 * ```
 *
 * @see {@link encryptRSA} for RSA encryption
 * @see {@link RSAOptions} for available options
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt} Web Crypto API decrypt
 */
export async function decryptRSA(
  data: string,
  privateKey: string,
  options?: RSAOptions,
): Promise<string>;

/**
 * Decrypts data using RSA-OAEP encryption and returns binary data.
 *
 * @param {string} data - The encrypted data as a base64-encoded string
 * @param {string} privateKey - The RSA private key in PEM format
 * @param {RSAOptions & { returnBinary: true }} options - Options with returnBinary set to true
 * @returns {Promise<Uint8Array>} A promise that resolves to the decrypted data as Uint8Array
 *
 * @example
 * ```typescript
 * declare const privateKey: string;
 *
 * const binary = await decryptRSA('base64EncryptedData==', privateKey, { returnBinary: true });
 * ```
 */
export async function decryptRSA(
  data: string,
  privateKey: string,
  options: RSAOptions & { returnBinary: true },
): Promise<Uint8Array>;

/**
 * Implementation of decryptRSA
 */
export async function decryptRSA(
  data: string,
  privateKey: string,
  options?: RSAOptions & { returnBinary?: boolean },
): Promise<string | Uint8Array> {
  // Apply defaults
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';
  const returnBinary = options?.returnBinary ?? false;

  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-1, SHA-256, SHA-384, or SHA-512',
    );
  }

  // Parse the PEM private key
  const keyData = parsePEMPrivateKey(privateKey);

  // Import the private key
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyData as BufferSource,
    {
      name: 'RSA-OAEP',
      hash: hashAlgorithm,
    },
    false,
    ['decrypt'],
  );

  // Decode the base64 encrypted data
  let encryptedData: Uint8Array;
  try {
    encryptedData = Uint8Array.from(atob(data), (c) => c.codePointAt(0) ?? 0);
  } catch (error) {
    throw new Error(`Invalid base64 encrypted data: ${error}`);
  }

  // Decrypt the data
  const decryptedData = await crypto.subtle.decrypt(
    'RSA-OAEP',
    cryptoKey,
    encryptedData as BufferSource,
  );

  return returnBinary
    ? new Uint8Array(decryptedData)
    : new TextDecoder().decode(decryptedData);
}
