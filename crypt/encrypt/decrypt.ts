import { decodeHex } from 'jsr:@std/encoding@1.0.8';
import type { AESOptions, EncryptionModes, RSAOptions } from './types.ts';

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
 * @param {string} data - The encrypted data and IV/counter, separated by a colon (hex-encoded)
 * @param {string} secret - The secret key for decryption (must match the key used for encryption)
 * @param {AESOptions} [options] - Optional decryption settings (mode, keyLength, returnBinary)
 * @returns {Promise<string>} A promise that resolves to the decrypted data as a string
 *
 * @throws {Error} When the encryption mode is invalid (must be GCM, CBC, or CTR)
 * @throws {Error} When the key length is not supported (must be 128, 192, or 256)
 * @throws {Error} When the encrypted data format is invalid (must be "data:iv")
 * @throws {Error} When the initialization vector (IV) is undefined or empty
 * @throws {Error} When decryption operation fails
 *
 * @example
 * ```typescript
 * // Decrypt data to string (default)
 * const decrypted = await decryptAES(
 *   'a2639836a7b2838889a5e45f4f9fbdb85ca618c8393ae0:c1d2c736adaea88b3d3dd101',
 *   'mySecretKey12345'
 * );
 * console.log(decrypted); // "my sensitive data"
 * ```
 *
 * @example
 * ```typescript
 * // Decrypt with custom options
 * const decrypted = await decryptAES(
 *   'encrypted:counter',
 *   'secret123456789',
 *   { mode: 'CTR', keyLength: 192 }
 * );
 * ```
 *
 * @see {@link encryptAES} for encryption
 * @see {@link AESOptions} for available options
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/decrypt} Web Crypto API decrypt
 */
export async function decryptAES(
  data: string,
  secret: string,
  options?: AESOptions,
): Promise<string>;

/**
 * Decrypts data using AES encryption and returns binary data.
 *
 * @param {string} data - The encrypted data and IV/counter, separated by a colon (hex-encoded)
 * @param {string} secret - The secret key for decryption
 * @param {AESOptions & { returnBinary: true }} options - Options with returnBinary set to true
 * @returns {Promise<Uint8Array>} A promise that resolves to the decrypted data as Uint8Array
 *
 * @example
 * ```typescript
 * // Decrypt to binary
 * const decryptedBinary = await decryptAES(
 *   'encrypted:counter',
 *   'secret123456789',
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
  // Apply defaults
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
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted data format. Expected "data:iv"');
  }

  const [encrypted, ivOrCounter] = parts.map((x) => decodeHex(x));

  if (!ivOrCounter || ivOrCounter.length === 0) {
    throw new Error('Initialization vector (IV) or counter is undefined');
  }

  // Calculate key size in bytes
  const keySizeBytes = Math.min(32, Math.ceil(keyLength / 8)); // Max 32 bytes (256 bits) for AES
  const keyBytes = deriveKey(secret, keySizeBytes);

  const algorithm = `AES-${mode}`;
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    {
      name: algorithm as 'AES-GCM' | 'AES-CBC' | 'AES-CTR',
      length: keySizeBytes * 8, // Convert back to bits
    },
    false,
    ['decrypt'],
  );

  let decryptConfig: AesGcmParams | AesCbcParams | AesCtrParams;

  if (mode === 'CTR') {
    decryptConfig = {
      name: 'AES-CTR',
      counter: ivOrCounter,
      length: 64, // Standard counter length for AES-CTR
    };
  } else {
    // AES-GCM or AES-CBC
    decryptConfig = {
      name: algorithm as 'AES-GCM' | 'AES-CBC',
      iv: ivOrCounter,
    } as AesGcmParams | AesCbcParams;
  }

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
 * Decrypts data using RSA-OAEP encryption with the specified key size and hash algorithm.
 *
 * Uses the Web Crypto API for secure RSA decryption. Expects a PEM-formatted private key
 * and base64-encoded encrypted data.
 *
 * @param {string} data - The encrypted data as a base64-encoded string
 * @param {string} privateKey - The RSA private key in PEM format
 * @param {RSAOptions} [options] - Optional decryption settings (keySize, hash)
 * @returns {Promise<string>} A promise that resolves to the decrypted data as a string
 *
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
  const keySize = options?.keySize ?? 2048;
  const hashAlgorithm = options?.hashAlgorithm ?? 'SHA-256';
  const returnBinary = options?.returnBinary ?? false;

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

/**
 * Decrypts data using the specified encryption mode.
 *
 * @deprecated Use {@link decryptAES} or {@link decryptRSA} with options objects instead
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
 * // AES decryption (deprecated - use decryptAES instead)
 * const decrypted = await decrypt('AES-GCM:256', 'mySecretKey', 'encrypted:iv');
 *
 * // Preferred:
 * const decrypted = await decryptAES('encrypted:iv', 'mySecretKey');
 * ```
 *
 * @see {@link decryptAES} for AES decryption
 * @see {@link decryptRSA} for RSA decryption
 */
export const decrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string,
  returnBinary = false,
): Promise<string | Uint8Array> => {
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
    return returnBinary
      ? decryptRSA(data, secret, { keySize, hashAlgorithm, returnBinary: true })
      : decryptRSA(data, secret, { keySize, hashAlgorithm });
  } else if (mode.startsWith('AES-')) {
    const [algorithm, lengthStr] = mode.split(':');
    const modeType = algorithm?.replace('AES-', '') as 'GCM' | 'CBC' | 'CTR';
    const keyLength = Number.parseInt(lengthStr || '256', 10) as
      | 128
      | 192
      | 256;
    return returnBinary
      ? decryptAES(data, secret, {
        mode: modeType,
        keyLength,
        returnBinary: true,
      })
      : decryptAES(data, secret, { mode: modeType, keyLength });
  } else {
    throw new Error('Invalid encryption mode');
  }
};
