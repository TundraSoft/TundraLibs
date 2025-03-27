import { decodeHex, encodeHex } from '$encoding';

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
 * Encrypts data using AES encryption.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
 * @param {string} secret - The secret key for encryption.
 * @param {string | Uint8Array} data - The data to encrypt.
 * @returns {Promise<string>} A promise that resolves to the encrypted data and IV, separated by a colon.
 *
 * @example
 * ```ts
 * const encrypted = await encryptAES('AES-GCM:256', 'abcdefghijklmnopqrstuvwx', 'my data');
 * console.log(encrypted); // Logs the encrypted data and IV
 * ```
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
 * Decrypts data using AES encryption.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
 * @param {string} secret - The secret key for decryption.
 * @param {string} data - The encrypted data and IV, separated by a colon.
 * @param {boolean} [returnBinary=false] - Whether to return the decrypted data as binary (Uint8Array).
 * @returns {Promise<string | Uint8Array>} A promise that resolves to the decrypted data.
 *
 * @example
 * ```ts
 * const decrypted = await decryptAES('AES-GCM:256', 'abcdefghijklmnopqrstuvwx', 'a2639836a7b2838889a5e45f4f9fbdb85ca618c8393ae0:c1d2c736adaea88b3d3dd101');
 * console.log(decrypted); // Logs the decrypted data
 * ```
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
    if (!iv) {
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
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
 * @param {string} secret - The secret key for encryption.
 * @param {string | Uint8Array} data - The data to encrypt.
 * @returns {Promise<string>} A promise that resolves to the encrypted data and IV, separated by a colon.
 *
 * @example
 * ```ts
 * const encrypted = await encrypt('AES-GCM:256', 'abcdefghijklmnopqrstuvwx', 'my data');
 * console.log(encrypted); // Logs the encrypted data and IV
 * ```
 */
export const encrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string | Uint8Array,
): Promise<string> => encryptAES(mode, secret, data);

/**
 * Decrypts data using the specified encryption mode.
 *
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
 * @param {string} secret - The secret key for decryption.
 * @param {string} data - The encrypted data and IV, separated by a colon.
 * @param {boolean} [returnBinary=false] - Whether to return the decrypted data as binary (Uint8Array).
 * @returns {Promise<string | Uint8Array>} A promise that resolves to the decrypted data.
 *
 * @example
 * ```ts
 * const decrypted = await decrypt('AES-GCM:256', 'abcdefghijklmnopqrstuvwx', 'a2639836a7b2838889a5e45f4f9fbdb85ca618c8393ae0:c1d2c736adaea88b3d3dd101');
 * console.log(decrypted); // Logs the decrypted data
 * ```
 */
export const decrypt = (
  mode: EncryptionModes,
  secret: string,
  data: string,
  returnBinary = false,
): Promise<string | Uint8Array> => decryptAES(mode, secret, data, returnBinary);
