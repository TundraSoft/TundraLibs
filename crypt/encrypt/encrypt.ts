import { encodeHex } from '$encoding';
import type { EncryptionModes } from './types.ts';

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
 * Encrypts data using AES encryption with the specified mode and key length.
 *
 * Uses the Web Crypto API for secure encryption. Generates a random IV/counter
 * for each encryption operation. The output format is `{encryptedData}:{iv}` where both
 * components are hex-encoded.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes})
 * @param {string} secret - The secret key for encryption (will be derived to match key length)
 * @param {string | Uint8Array} data - The data to encrypt, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the encrypted data and IV, separated by a colon
 *
 * @throws {Error} When the encryption mode is invalid (must be AES-GCM, AES-CBC, or AES-CTR)
 * @throws {Error} When the key length is not supported (must be 128, 192, 256, 384, or 512)
 * @throws {Error} When encryption operation fails
 *
 * @example
 * ```typescript
 * // Encrypt a string with AES-GCM-256
 * const encrypted = await encryptAES('AES-GCM:256', 'mySecretKey12345', 'my sensitive data');
 * console.log(encrypted); // "a2639836a7b2838889a5e45f4f9fbdb85ca618c8393ae0:c1d2c736adaea88b3d3dd101"
 * ```
 *
 * @example
 * ```typescript
 * // Encrypt binary data with AES-CTR-192
 * const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
 * const encrypted = await encryptAES('AES-CTR:192', 'secret123456789', binaryData);
 * console.log(encrypted); // Encrypted data with counter
 * ```
 *
 * @see {@link decryptAES} for decryption
 * @see {@link EncryptionModes} for supported modes
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt} Web Crypto API encrypt
 */
export const encryptAES = async (
  mode: EncryptionModes,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => {
  const [algorithm, lengthStr] = mode.split(':');
  const length = parseInt(lengthStr || '0', 10);

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

  // Derive key of correct length
  const keyBytes = deriveKey(secret, length / 8);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    {
      name: algorithm!,
      length: length,
    },
    false,
    ['encrypt'],
  );

  const dataToEncrypt = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Handle different encryption modes
  if (algorithm === 'AES-CTR') {
    return await encryptAESCTR(key, dataToEncrypt);
  } else {
    return await encryptAESGCMCBC(key, algorithm!, dataToEncrypt);
  }
};

/**
 * Encrypts data using RSA-OAEP encryption.
 *
 * Uses the Web Crypto API for secure RSA encryption. The input can be either a PEM-formatted
 * public key string or a CryptoKey object. For maximum compatibility and security, provide
 * the public key as a PEM string.
 *
 * @param {EncryptionModes} mode - The RSA encryption mode, key length, and hash algorithm
 * @param {string | CryptoKey} publicKey - The RSA public key in PEM format or as a CryptoKey
 * @param {string | Uint8Array} data - The data to encrypt (limited by RSA key size)
 * @returns {Promise<string>} A promise that resolves to the hex-encoded encrypted data
 *
 * @throws {Error} When the encryption mode is invalid
 * @throws {Error} When the key length or hash algorithm is not supported
 * @throws {Error} When the public key format is invalid
 * @throws {Error} When the data is too large for the RSA key size
 * @throws {Error} When encryption operation fails
 *
 * @example
 * ```typescript
 * const publicKeyPEM = `-----BEGIN PUBLIC KEY-----
 * MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
 * -----END PUBLIC KEY-----`;
 *
 * const encrypted = await encryptRSA('RSA-OAEP:2048:SHA-256', publicKeyPEM, 'secret data');
 * console.log(encrypted); // Hex-encoded encrypted data
 * ```
 */
export const encryptRSA = async (
  mode: EncryptionModes,
  publicKey: string | CryptoKey,
  data: string | Uint8Array,
): Promise<string> => {
  const parts = mode.split(':');
  if (parts.length !== 3 || parts[0] !== 'RSA-OAEP') {
    throw new Error(
      'Invalid RSA encryption mode. Must be RSA-OAEP:keySize:hashAlgorithm',
    );
  }

  const [, lengthStr, hashAlgorithm] = parts;

  if (!lengthStr || !hashAlgorithm) {
    throw new Error('Invalid RSA encryption mode format');
  }

  const keyLength = parseInt(lengthStr, 10);

  if (![2048, 3072, 4096].includes(keyLength)) {
    throw new Error('Invalid RSA key length. Must be 2048, 3072, or 4096');
  }

  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-1, SHA-256, SHA-384, or SHA-512',
    );
  }

  // Import the public key if it's a string
  let cryptoKey: CryptoKey;
  if (typeof publicKey === 'string') {
    // Remove PEM headers and decode base64
    const pemContents = publicKey
      .replace(/-----BEGIN PUBLIC KEY-----/, '')
      .replace(/-----END PUBLIC KEY-----/, '')
      .replace(/\s/g, '');

    let keyData: Uint8Array;
    try {
      keyData = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
    } catch (_error) {
      throw new Error('Invalid PEM public key format');
    }

    cryptoKey = await crypto.subtle.importKey(
      'spki',
      keyData,
      {
        name: 'RSA-OAEP',
        hash: hashAlgorithm,
      },
      false,
      ['encrypt'],
    );
  } else {
    cryptoKey = publicKey;
  }

  const dataToEncrypt = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Check data size limit (RSA can only encrypt data smaller than key size minus padding)
  const maxDataSize = Math.floor(keyLength / 8) -
    2 *
      (hashAlgorithm === 'SHA-1'
        ? 20
        : hashAlgorithm === 'SHA-256'
        ? 32
        : hashAlgorithm === 'SHA-384'
        ? 48
        : 64) -
    2;

  if (dataToEncrypt.length > maxDataSize) {
    throw new Error(
      `Data too large for RSA key. Maximum size: ${maxDataSize} bytes`,
    );
  }

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'RSA-OAEP',
    },
    cryptoKey,
    dataToEncrypt,
  );

  // Return as base64 for RSA (standard format)
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
};

/**
 * Encrypts data using AES-CTR mode.
 *
 * @param key - The imported crypto key
 * @param data - The data to encrypt
 * @returns Promise resolving to encrypted data and counter, separated by a colon
 */
const encryptAESCTR = async (
  key: CryptoKey,
  data: Uint8Array,
): Promise<string> => {
  // Generate a random 16-byte counter
  const counter = crypto.getRandomValues(new Uint8Array(16));

  const encrypted = await crypto.subtle.encrypt(
    {
      name: 'AES-CTR',
      counter,
      length: 128, // Counter length in bits
    },
    key,
    data,
  );

  return `${encodeHex(encrypted)}:${encodeHex(counter)}`;
};

/**
 * Encrypts data using AES-GCM or AES-CBC mode.
 *
 * @param key - The imported crypto key
 * @param algorithm - The algorithm name (AES-GCM or AES-CBC)
 * @param data - The data to encrypt
 * @returns Promise resolving to encrypted data and IV, separated by a colon
 */
const encryptAESGCMCBC = async (
  key: CryptoKey,
  algorithm: string,
  data: Uint8Array,
): Promise<string> => {
  const iv = crypto.getRandomValues(new Uint8Array(16));

  // Note: AES-CBC uses PKCS#7 padding by default in Web Crypto API
  const encryptConfig: AesGcmParams | AesCbcParams = {
    name: algorithm,
    iv,
  };

  const encrypted = await crypto.subtle.encrypt(
    encryptConfig,
    key,
    data,
  );

  return `${encodeHex(encrypted)}:${encodeHex(iv)}`;
};

/**
 * Encrypts data using the specified encryption mode.
 *
 * Supports both AES and RSA encryption modes. For AES modes, uses the secret as a symmetric key.
 * For RSA modes, the secret parameter should be the public key in PEM format.
 *
 * @param {EncryptionModes} mode - The encryption mode and parameters ({@link EncryptionModes})
 * @param {string} secret - For AES: secret key, For RSA: public key in PEM format
 * @param {string | Uint8Array} data - The data to encrypt, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the encrypted data
 *
 * @throws {Error} When the encryption mode is invalid or encryption fails
 *
 * @example
 * ```typescript
 * // AES encryption
 * const encrypted = await encrypt('AES-GCM:256', 'mySecretKey', 'my data');
 * console.log(encrypted); // Encrypted data with IV
 *
 * // RSA encryption
 * const publicKey = '-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----';
 * const rsaEncrypted = await encrypt('RSA-OAEP:2048:SHA-256', publicKey, 'my data');
 * console.log(rsaEncrypted); // RSA encrypted data
 * ```
 *
 * @see {@link encryptAES} for AES encryption
 * @see {@link encryptRSA} for RSA encryption
 * @see {@link decrypt} for decryption
 * @see {@link EncryptionModes} for supported modes
 */
export const encrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => {
  if (mode.startsWith('RSA-')) {
    return encryptRSA(mode, secret, data);
  } else {
    return encryptAES(mode, secret, data);
  }
};
