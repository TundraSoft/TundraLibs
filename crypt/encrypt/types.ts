/**
 * AES encryption mode
 * - GCM: Galois/Counter Mode (recommended - authenticated encryption)
 * - CBC: Cipher Block Chaining
 * - CTR: Counter Mode
 */
export type AESMode = 'GCM' | 'CBC' | 'CTR';

/**
 * AES key length in bits
 */
export type AESKeyLength = 128 | 192 | 256;

/**
 * RSA key size in bits
 */
export type RSAKeySize = 2048 | 3072 | 4096;

/**
 * Hash algorithm for RSA operations
 */
export type RSAHashAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/**
 * Options for AES encryption/decryption
 */
export type AESOptions = {
  /**
   * Encryption mode
   * @default 'GCM'
   */
  mode?: AESMode;

  /**
   * Key length in bits
   * @default 256
   */
  keyLength?: AESKeyLength;
};

/**
 * Options for RSA encryption/decryption
 */
export type RSAOptions = {
  /**
   * RSA key size in bits
   * @default 2048
   */
  keySize?: RSAKeySize;

  /**
   * Hash algorithm for OAEP padding
   * @default 'SHA-256'
   */
  hashAlgorithm?: RSAHashAlgorithm;
};

/**
 * @deprecated Use AESOptions and RSAOptions instead
 * Supported encryption modes combining algorithm, key lengths, and hash functions.
 */
export type EncryptionModes =
  | 'AES-GCM:128'
  | 'AES-GCM:192'
  | 'AES-GCM:256'
  | 'AES-CBC:128'
  | 'AES-CBC:192'
  | 'AES-CBC:256'
  | 'AES-CTR:128'
  | 'AES-CTR:192'
  | 'AES-CTR:256'
  | 'RSA-OAEP:2048:SHA-1'
  | 'RSA-OAEP:2048:SHA-256'
  | 'RSA-OAEP:2048:SHA-384'
  | 'RSA-OAEP:2048:SHA-512'
  | 'RSA-OAEP:3072:SHA-1'
  | 'RSA-OAEP:3072:SHA-256'
  | 'RSA-OAEP:3072:SHA-384'
  | 'RSA-OAEP:3072:SHA-512'
  | 'RSA-OAEP:4096:SHA-1'
  | 'RSA-OAEP:4096:SHA-256'
  | 'RSA-OAEP:4096:SHA-384'
  | 'RSA-OAEP:4096:SHA-512';
