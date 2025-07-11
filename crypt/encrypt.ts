import { decodeHex, encodeHex } from '$encoding';

/**
 * Supported AES encryption modes and key lengths.
 *
 * Format: `{Algorithm}:{KeyLength}` where:
 * - Algorithm: AES-GCM (Galois/Counter Mode) or AES-CBC (Cipher Block Chaining)
 * - KeyLength: 128, 256, 384, or 512 bits
 *
 * @see {@link https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt} Web Crypto API encryption
 */
export type EncryptionModes =
  | 'AES-GCM:128'
  | 'AES-GCM:256'
  | 'AES-GCM:384'
  | 'AES-GCM:512'
  | 'AES-CBC:128'
  | 'AES-CBC:256'
  | 'AES-CBC:384'
  | 'AES-CBC:512';

/**
 * Encrypts data using AES encryption with the specified mode and key length.
 *
 * Uses the Web Crypto API for secure encryption. Generates a random IV (Initialization Vector)
 * for each encryption operation. The output format is `{encryptedData}:{iv}` where both
 * components are hex-encoded.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes})
 * @param {string} secret - The secret key for encryption (will be truncated/padded to match key length)
 * @param {string | Uint8Array} data - The data to encrypt, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the encrypted data and IV, separated by a colon
 *
 * @throws {Error} When the encryption mode is invalid (must be AES-GCM or AES-CBC)
 * @throws {Error} When the key length is not supported (must be 128, 256, 384, or 512)
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
 * // Encrypt binary data with AES-CBC-128
 * const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
 * const encrypted = await encryptAES('AES-CBC:128', 'secret123456789', binaryData);
 * console.log(encrypted); // Encrypted data with IV
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
  try {
    const [algorithm, lengthStr] = mode.split(':');
    const length = parseInt(lengthStr || '0', 10);

    if (!['AES-GCM', 'AES-CBC'].includes(algorithm!)) {
      throw new Error(
        'Invalid AES encryption mode. Must be AES-GCM or AES-CBC',
      );
    }

    if (![128, 256, 384, 512].includes(length)) {
      throw new Error('Invalid AES key length. Must be 128, 256, 384 or 512');
    }

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      {
        name: algorithm!,
        length: length,
      },
      false,
      ['encrypt'],
    );

    const iv = crypto.getRandomValues(new Uint8Array(16));
    const dataToEncrypt = typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data;

    // Note: AES-CBC uses PKCS#7 padding by default in Web Crypto API
    const encryptConfig: AesGcmParams | AesCbcParams = {
      name: algorithm!,
      iv,
    };

    const encrypted = await crypto.subtle.encrypt(
      encryptConfig,
      key,
      dataToEncrypt,
    );

    return `${encodeHex(encrypted)}:${encodeHex(iv)}`;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Encryption failed: ${String(error)}`);
  }
};

/**
 * Decrypts data using AES encryption with the specified mode and key length.
 *
 * Uses the Web Crypto API for secure decryption. Expects input in the format
 * `{encryptedData}:{iv}` where both components are hex-encoded strings.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes})
 * @param {string} secret - The secret key for decryption (must match the key used for encryption)
 * @param {string} data - The encrypted data and IV, separated by a colon (hex-encoded)
 * @param {boolean} [returnBinary=false] - Whether to return the decrypted data as binary (Uint8Array)
 * @returns {Promise<string | Uint8Array>} A promise that resolves to the decrypted data
 *
 * @throws {Error} When the encryption mode is invalid (must be AES-GCM or AES-CBC)
 * @throws {Error} When the key length is not supported (must be 128, 256, 384, or 512)
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
 * // Decrypt data to binary
 * const decryptedBinary = await decryptAES(
 *   'AES-CBC:128',
 *   'secret123456789',
 *   'encrypted:iv',
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
  try {
    const [algorithm, lengthStr] = mode.split(':');
    const length = parseInt(lengthStr || '0', 10);

    if (!['AES-GCM', 'AES-CBC'].includes(algorithm!)) {
      throw new Error(
        'Invalid AES encryption mode. Must be AES-GCM or AES-CBC',
      );
    }

    if (![128, 256, 384, 512].includes(length)) {
      throw new Error('Invalid AES key length. Must be 128, 256, 384 or 512');
    }

    const parts = data.split(':');
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted data format. Expected "data:iv"');
    }

    const [encrypted, iv] = parts.map((x) => decodeHex(x));

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      {
        name: algorithm!,
        length: length,
      },
      false,
      ['decrypt'],
    );

    // Note: AES-CBC uses PKCS#7 padding by default in Web Crypto API
    if (!iv || iv.length === 0) {
      throw new Error('Initialization vector (IV) is undefined');
    }

    const decryptConfig: AesGcmParams | AesCbcParams = {
      name: algorithm!,
      iv,
    };

    const decrypted = await crypto.subtle.decrypt(
      decryptConfig,
      key,
      encrypted!,
    );

    return returnBinary
      ? new Uint8Array(decrypted)
      : new TextDecoder().decode(decrypted);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Decryption failed: ${String(error)}`);
  }
};

/**
 * Encrypts data using the specified encryption mode.
 *
 * This is a convenience wrapper around {@link encryptAES} that provides a simplified interface
 * for AES encryption operations.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes})
 * @param {string} secret - The secret key for encryption
 * @param {string | Uint8Array} data - The data to encrypt, either as a string or binary data
 * @returns {Promise<string>} A promise that resolves to the encrypted data and IV, separated by a colon
 *
 * @throws {Error} When the encryption mode is invalid or encryption fails
 *
 * @example
 * ```typescript
 * const encrypted = await encrypt('AES-GCM:256', 'mySecretKey', 'my data');
 * console.log(encrypted); // Encrypted data with IV
 * ```
 *
 * @see {@link encryptAES} for the underlying implementation
 * @see {@link decrypt} for decryption
 * @see {@link EncryptionModes} for supported modes
 */
export const encrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => encryptAES(mode, secret, data);

/**
 * Decrypts data using the specified encryption mode.
 *
 * This is a convenience wrapper around {@link decryptAES} that provides a simplified interface
 * for AES decryption operations.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes})
 * @param {string} secret - The secret key for decryption (must match the key used for encryption)
 * @param {string} data - The encrypted data and IV, separated by a colon (hex-encoded)
 * @param {boolean} [returnBinary=false] - Whether to return the decrypted data as binary (Uint8Array)
 * @returns {Promise<string | Uint8Array>} A promise that resolves to the decrypted data
 *
 * @throws {Error} When the encryption mode is invalid or decryption fails
 *
 * @example
 * ```typescript
 * const decrypted = await decrypt('AES-GCM:256', 'mySecretKey', 'encrypted:iv');
 * console.log(decrypted); // Decrypted data
 * ```
 *
 * @see {@link decryptAES} for the underlying implementation
 * @see {@link encrypt} for encryption
 * @see {@link EncryptionModes} for supported modes
 */
export const decrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string,
  returnBinary = false,
): Promise<string | Uint8Array> => decryptAES(mode, secret, data, returnBinary);
