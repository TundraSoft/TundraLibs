/**
 * @fileoverview Encrypt module exports.
 *
 * Re-exports encryption and decryption functions with types for
 * AES and RSA algorithms.
 *
 * @module
 *
 * @example
 * ```typescript
 * import { encryptAES, decryptAES } from '@tundralibs/crypt/encrypt';
 *
 * const encrypted = await encryptAES('data', 'password');
 * const decrypted = await decryptAES(encrypted, 'password');
 * ```
 */

export { decryptAES, decryptRSA } from './decrypt.ts';
export { encryptAES, encryptRSA } from './encrypt.ts';
export type {
  AESKeyLength,
  AESMode,
  AESOptions,
  RSAHashAlgorithm,
  RSAOptions,
} from './types/mod.ts';
