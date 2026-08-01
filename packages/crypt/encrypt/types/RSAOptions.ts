import type { RSAHashAlgorithm } from './RSAHashAlgorithm.ts';

/**
 * Options for RSA encryption/decryption.
 *
 * The RSA key size is not configurable here — it is read from the PEM key
 * supplied to `encryptRSA` / `decryptRSA`.
 */
export type RSAOptions = {
  /**
   * Hash algorithm for OAEP padding.
   * @default 'SHA-256'
   */
  hashAlgorithm?: RSAHashAlgorithm;
};
