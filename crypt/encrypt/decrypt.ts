import { decodeHex } from '$encoding';
import type { EncryptionModes } from './types.ts';

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
    return Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  } catch {
    throw new Error('Invalid PEM private key format');
  }
};

/**
 * Derives a key of the exact required length from a secret string.
 *
 * @param secret - The input secret string
 * @param requiredBytes - The required number of bytes for the key
 * @returns A byte array of exactly the required length
 */
const deriveKey = (secret: string, requiredBytes: number): Uint8Array => {
  const secretBytes = new TextEncoder().encode(secret);
  if (secretBytes.length >= requiredBytes) {
    return secretBytes.slice(0, requiredBytes);
  }

  // If secret is too short, pad with zeros
  const result = new Uint8Array(requiredBytes);
  result.set(secretBytes);
  return result;
};

/**
 * Decrypts data using AES encryption with the specified mode and key length.
 *
 * Uses the Web Crypto API for secure decryption. Expects input in the format
 * `{encryptedData}:{iv}` where both components are hex-encoded strings.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes})
 * @param {string} secret - The secret key for decryption (must match the key used for encryption)
 * @param {string} data - The encrypted data and IV/counter, separated by a colon (hex-encoded)
 * @param {boolean} [returnBinary=false] - Whether to return the decrypted data as binary (Uint8Array)
 * @returns {Promise<string | Uint8Array>} A promise that resolves to the decrypted data
 *
 * @throws {Error} When the encryption mode is invalid (must be AES-GCM, AES-CBC, or AES-CTR)
 * @throws {Error} When the key length is not supported (must be 128, 192, 256, 384, or 512)
 * @throws {Error} When the encrypted data format is invalid (must be "data:iv")
 * @throws {Error} When the initialization vector (IV) is undefined or empty
 * @throws {Error} When decryption operation fails
 *
 * @example
 * ```typescript
 * // Decrypt data to string
 * const decrypted = await decryptAES(
 *   'AES-GCM:256',
 *   'mySecretKey12345',
 *   'a2639836a7b2838889a5e45f4f9fbdb85ca618c8393ae0:c1d2c736adaea88b3d3dd101'
 * );
 * console.log(decrypted); // "my sensitive data"
 * ```
 *
 * @example
 * ```typescript
 * // Decrypt AES-CTR data to binary
 * const decryptedBinary = await decryptAES(
 *   'AES-CTR:192',
 *   'secret123456789',
 *   'encrypted:counter',
 *   true
 * );
 * console.log(decryptedBinary); // Uint8Array([1, 2, 3, 4, 5])
 * ```
 *
 * @see {@link encryptAES} for encryption
 * @see {@link EncryptionModes} for supported modes
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt} Web Crypto API decrypt
 */
export const decryptAES = async (
  mode: EncryptionModes,
  secret: string,
  data: string,
  returnBinary = false,
): Promise<string | Uint8Array> => {
  const [algorithm, lengthStr] = mode.split(':');
  const length = Number.parseInt(lengthStr || '0', 10);

  if (!['AES-GCM', 'AES-CBC', 'AES-CTR'].includes(algorithm!)) {
    throw new Error(
      'Invalid AES encryption mode. Must be AES-GCM, AES-CBC, or AES-CTR',
    );
  }

  if (![128, 192, 256].includes(length)) {
    throw new Error(
      'Invalid AES key length. Must be 128, 192, or 256',
    );
  }

  const parts = data.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format. Expected "data:iv"');
  }

  const [encrypted, ivOrCounter] = parts.map((x) => decodeHex(x));

  if (!ivOrCounter || ivOrCounter.length === 0) {
    throw new Error('Initialization vector (IV) or counter is undefined');
  }

  // Calculate key size in bytes
  const keyLength = Math.min(32, Math.ceil(length / 8)); // Max 32 bytes (256 bits) for AES
  const keyBytes = deriveKey(secret, keyLength);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    {
      name: algorithm!,
      length: keyLength * 8, // Convert back to bits
    },
    false,
    ['decrypt'],
  );

  let decryptConfig: AesGcmParams | AesCbcParams | AesCtrParams;

  if (algorithm === 'AES-CTR') {
    decryptConfig = {
      name: 'AES-CTR',
      counter: ivOrCounter,
      length: 64, // Standard counter length for AES-CTR
    };
  } else {
    // AES-GCM or AES-CBC
    decryptConfig = {
      name: algorithm!,
      iv: ivOrCounter,
    } as AesGcmParams | AesCbcParams;
  }

  const decrypted = await crypto.subtle.decrypt(
    decryptConfig,
    key,
    encrypted!,
  );

  return returnBinary
    ? new Uint8Array(decrypted)
    : new TextDecoder().decode(decrypted);
};

/**
 * Decrypts data using RSA-OAEP encryption with the specified key size and hash algorithm.
 *
 * Uses the Web Crypto API for secure RSA decryption. Expects a PEM-formatted private key
 * and base64-encoded encrypted data.
 *
 * @param {EncryptionModes} mode - The RSA encryption mode (e.g., 'RSA-OAEP:2048:SHA-256')
 * @param {string} privateKey - The RSA private key in PEM format
 * @param {string} data - The encrypted data as a base64-encoded string
 * @param {boolean} [returnBinary=false] - Whether to return the decrypted data as binary (Uint8Array)
 * @returns {Promise<string | Uint8Array>} A promise that resolves to the decrypted data
 *
 * @throws {Error} When the RSA mode format is invalid (must be 'RSA-OAEP:keySize:hashAlgorithm')
 * @throws {Error} When the key size is not supported (must be 2048, 3072, or 4096)
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
 * const decrypted = await decryptRSA(
 *   'RSA-OAEP:2048:SHA-256',
 *   privateKey,
 *   'base64EncryptedData=='
 * );
 * console.log(decrypted); // "my sensitive data"
 * ```
 *
 * @see {@link encryptRSA} for RSA encryption
 * @see {@link EncryptionModes} for supported modes
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt} Web Crypto API decrypt
 */
export const decryptRSA = async (
  mode: EncryptionModes,
  privateKey: string,
  data: string,
  returnBinary = false,
): Promise<string | Uint8Array> => {
  const parts = mode.split(':');
  if (parts.length !== 3 || parts[0] !== 'RSA-OAEP') {
    throw new Error(
      'Invalid RSA mode format. Expected "RSA-OAEP:keySize:hashAlgorithm"',
    );
  }

  const [, lengthStr, hashAlgorithm] = parts;

  if (!lengthStr || !hashAlgorithm) {
    throw new Error(
      'Invalid RSA mode format. Expected "RSA-OAEP:keySize:hashAlgorithm"',
    );
  }

  const keySize = parseInt(lengthStr, 10);
  if (![2048, 3072, 4096].includes(keySize)) {
    throw new Error(
      'Invalid RSA key size. Must be 2048, 3072, or 4096',
    );
  }

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
      hash: 'SHA-256',
    },
    false,
    ['decrypt'],
  );

  // Decode the base64 encrypted data
  let encryptedData: Uint8Array;
  try {
    encryptedData = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  } catch (_error) {
    throw new Error('Invalid base64 encrypted data');
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
};

/**
 * Decrypts data using the specified encryption mode.
 *
 * Supports both AES and RSA decryption modes. For AES modes, uses the secret as a symmetric key.
 * For RSA modes, the secret parameter should be the private key in PEM format.
 *
 * @param {EncryptionModes} mode - The encryption mode and parameters ({@link EncryptionModes})
 * @param {string} secret - For AES: secret key, For RSA: private key in PEM format
 * @param {string} data - The encrypted data to decrypt
 * @param {boolean} [returnBinary=false] - Whether to return the decrypted data as binary (Uint8Array)
 * @returns {Promise<string | Uint8Array>} A promise that resolves to the decrypted data
 *
 * @throws {Error} When the encryption mode is invalid or decryption fails
 *
 * @example
 * ```typescript
 * // AES decryption
 * const decrypted = await decrypt('AES-GCM:256', 'mySecretKey', 'encrypted:iv');
 * console.log(decrypted); // Decrypted data
 *
 * // RSA decryption
 * const privateKey = '-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----';
 * const rsaDecrypted = await decrypt('RSA-OAEP:2048:SHA-256', privateKey, 'base64EncryptedData');
 * console.log(rsaDecrypted); // RSA decrypted data
 * ```
 *
 * @see {@link decryptAES} for AES decryption
 * @see {@link decryptRSA} for RSA decryption
 * @see {@link encrypt} for encryption
 * @see {@link EncryptionModes} for supported modes
 */
export const decrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string,
  returnBinary = false,
): Promise<string | Uint8Array> => {
  if (mode.startsWith('RSA-')) {
    return decryptRSA(mode, secret, data, returnBinary);
  } else {
    return decryptAES(mode, secret, data, returnBinary);
  }
};
