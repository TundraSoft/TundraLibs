import { encodeHex } from '$encoding';
import type { AESOptions, EncryptionModes, RSAOptions } from './types.ts';

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
 * @param {string | Uint8Array} data - The data to encrypt, either as a string or binary data
 * @param {string} secret - The secret key for encryption (will be derived to match key length)
 * @param {AESOptions} [options] - Optional encryption settings (mode and keyLength)
 * @returns {Promise<string>} A promise that resolves to the encrypted data and IV, separated by a colon
 *
 * @throws {Error} When the encryption mode is invalid (must be GCM, CBC, or CTR)
 * @throws {Error} When the key length is not supported (must be 128, 192, or 256)
 * @throws {Error} When encryption operation fails
 *
 * @example
 * ```typescript
 * // Encrypt a string with AES-GCM-256 (default)
 * const encrypted = await encryptAES('my sensitive data', 'mySecretKey12345');
 * console.log(encrypted); // "a2639836a7b2838889a5e45f4f9fbdb85ca618c8393ae0:c1d2c736adaea88b3d3dd101"
 * ```
 *
 * @example
 * ```typescript
 * // Encrypt binary data with custom options
 * const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
 * const encrypted = await encryptAES(binaryData, 'secret123456789', { mode: 'CTR', keyLength: 192 });
 * console.log(encrypted); // Encrypted data with counter
 * ```
 *
 * @see {@link decryptAES} for decryption
 * @see {@link AESOptions} for available options
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt} Web Crypto API encrypt
 */
export const encryptAES = async (
  data: string | Uint8Array,
  secret: string,
  options?: AESOptions,
): Promise<string> => {
  // Apply defaults
  const mode = options?.mode ?? 'GCM';
  const keyLength = options?.keyLength ?? 256;

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

  // Derive key of correct length
  const keyBytes = deriveKey(secret, keyLength / 8);

  const algorithm = `AES-${mode}`;
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    {
      name: algorithm,
      length: keyLength,
    },
    false,
    ['encrypt'],
  );

  const dataToEncrypt = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Handle different encryption modes
  if (mode === 'CTR') {
    return await encryptAESCTR(key, dataToEncrypt);
  } else {
    return await encryptAESGCMCBC(key, algorithm, dataToEncrypt);
  }
};

/**
 * Encrypts data using RSA-OAEP encryption.
 *
 * Uses the Web Crypto API for secure RSA encryption. The input must be a PEM-formatted
 * public key string.
 *
 * @param {string | Uint8Array} data - The data to encrypt (limited by RSA key size)
 * @param {string} publicKey - The RSA public key in PEM format
 * @param {RSAOptions} [options] - Optional encryption settings (keySize and hash algorithm)
 * @returns {Promise<string>} A promise that resolves to the base64-encoded encrypted data
 *
 * @throws {Error} When the key size or hash algorithm is not supported
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
 * // Encrypt with defaults (RSA-OAEP-2048-SHA-256)
 * const encrypted = await encryptRSA('secret data', publicKeyPEM);
 * console.log(encrypted); // Base64-encoded encrypted data
 *
 * // Encrypt with custom options
 * const encrypted2 = await encryptRSA('secret data', publicKeyPEM, { keySize: 4096, hash: 'SHA-512' });
 * ```
 *
 * @see {@link decryptRSA} for decryption
 * @see {@link RSAOptions} for available options
 */
export const encryptRSA = async (
  data: string | Uint8Array,
  publicKey: string,
  options?: RSAOptions,
): Promise<string> => {
  // Apply defaults
  const keySize = options?.keySize ?? 2048;
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';

  if (![2048, 3072, 4096].includes(keySize)) {
    throw new Error('Invalid RSA key size. Must be 2048, 3072, or 4096');
  }

  if (!['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'].includes(hashAlgorithm)) {
    throw new Error(
      'Invalid hash algorithm. Must be SHA-1, SHA-256, SHA-384, or SHA-512',
    );
  }

  // Remove PEM headers and decode base64
  const pemContents = publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replaceAll(/\s/g, '');

  let keyData: Uint8Array;
  try {
    keyData = Uint8Array.from(
      atob(pemContents),
      (c) => c.codePointAt(0) ?? 0,
    );
  } catch {
    throw new Error('Invalid PEM public key format');
  }

  const cryptoKey = await crypto.subtle.importKey(
    'spki',
    keyData as BufferSource,
    {
      name: 'RSA-OAEP',
      hash: hashAlgorithm,
    },
    false,
    ['encrypt'],
  );

  const dataToEncrypt = typeof data === 'string'
    ? new TextEncoder().encode(data)
    : data;

  // Check data size limit (RSA can only encrypt data smaller than key size minus padding)
  // Determine hash output size based on algorithm
  let hashOutputSize: number;
  if (hashAlgorithm === 'SHA-1') {
    hashOutputSize = 20;
  } else if (hashAlgorithm === 'SHA-256') {
    hashOutputSize = 32;
  } else if (hashAlgorithm === 'SHA-384') {
    hashOutputSize = 48;
  } else {
    hashOutputSize = 64; // SHA-512
  }

  const maxDataSize = Math.floor(keySize / 8) - 2 * hashOutputSize - 2;

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
    dataToEncrypt as BufferSource,
  );

  // Return as base64 for RSA (standard format)
  return btoa(String.fromCodePoint(...new Uint8Array(encrypted)));
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
    data as BufferSource,
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
    data as BufferSource,
  );

  return `${encodeHex(encrypted)}:${encodeHex(iv)}`;
};

/**
 * Encrypts data using the specified encryption mode.
 *
 * @deprecated Use {@link encryptAES} or {@link encryptRSA} with options objects instead
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
 * // AES encryption (deprecated - use encryptAES instead)
 * const encrypted = await encrypt('AES-GCM:256', 'mySecretKey', 'my data');
 *
 * // Preferred:
 * const encrypted = await encryptAES('my data', 'mySecretKey', { mode: 'GCM', keyLength: 256 });
 * ```
 *
 * @see {@link encryptAES} for AES encryption
 * @see {@link encryptRSA} for RSA encryption
 */
export const encrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => {
  // Parse mode string and convert to new API
  if (mode.startsWith('RSA-OAEP:')) {
    const parts = mode.split(':');
    const keySize = Number.parseInt(parts[1] || '2048', 10) as
      | 2048
      | 3072
      | 4096;
    const hashAlgorithm = (parts[2] || 'SHA-256') as
      | 'SHA-1'
      | 'SHA-256'
      | 'SHA-384'
      | 'SHA-512';
    return encryptRSA(data, secret, { keySize, hashAlgorithm });
  } else if (mode.startsWith('AES-')) {
    const [algorithm, lengthStr] = mode.split(':');
    const modeType = algorithm?.replace('AES-', '') as 'GCM' | 'CBC' | 'CTR';
    const keyLength = Number.parseInt(lengthStr || '256', 10) as
      | 128
      | 192
      | 256;
    return encryptAES(data, secret, { mode: modeType, keyLength });
  } else {
    throw new Error('Invalid encryption mode');
  }
};
