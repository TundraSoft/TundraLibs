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
 * @param {string} data - The data to encrypt.
 * @param {string} secret - The secret key for encryption.
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
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
  data: string,
): Promise<string> => {
  const [algorithm, length] = mode.split(':');
  if (['AES-GCM', 'AES-CBC'].indexOf(algorithm!) === -1) {
    throw new Error('Invalid AES encryption mode. Must be AES-GCM or AES-CBC');
  }
  if ([128, 256, 384, 512].indexOf(+length!) === -1) {
    throw new Error('Invalid AES key length. Must be 128, 256, 384 or 512');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: algorithm!,
      length: +length!,
    },
    false,
    ['encrypt'],
  );
  const iv = crypto.getRandomValues(new Uint8Array(16));
  const encrypted = await crypto.subtle.encrypt(
    {
      name: algorithm!,
      iv,
    },
    key,
    new TextEncoder().encode(data),
  );
  return `${encodeHex(encrypted)}:${encodeHex(iv)}`;
};

/**
 * Decrypts data using AES encryption.
 *
 * @param {string} data - The encrypted data and IV, separated by a colon.
 * @param {string} secret - The secret key for decryption.
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
 * @returns {Promise<string>} A promise that resolves to the decrypted data.
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
): Promise<string> => {
  const [algorithm, length] = mode.split(':');
  if (['AES-GCM', 'AES-CBC'].indexOf(algorithm!) === -1) {
    throw new Error('Invalid AES encryption mode. Must be AES-GCM or AES-CBC');
  }
  if ([128, 256, 384, 512].indexOf(+length!) === -1) {
    throw new Error('Invalid AES key length. Must be 128, 256, 384 or 512');
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {
      name: algorithm!,
      length: +length!,
    },
    false,
    ['decrypt'],
  );
  const [encrypted, iv] = data.split(':').map((x) => decodeHex(x));
  const decrypted = await crypto.subtle.decrypt(
    {
      name: algorithm!,
      iv,
    },
    key,
    encrypted!,
  );
  return new TextDecoder().decode(decrypted);
};

/**
 * Encrypts data using the specified encryption mode.
 *
 * @param {string} data - The data to encrypt.
 * @param {string} secret - The secret key for encryption.
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
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
  data: string,
): Promise<string> => encryptAES(mode, secret, data);

/**
 * Decrypts data using the specified encryption mode.
 *
 * @param {string} data - The encrypted data and IV, separated by a colon.
 * @param {string} secret - The secret key for decryption.
 * @param {EncryptionModes} mode - The encryption mode and key length ({@link EncryptionModes}).
 * @returns {Promise<string>} A promise that resolves to the decrypted data.
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
): Promise<string> => decryptAES(mode, secret, data);
