import type { RSAHashAlgorithm } from './RSAHashAlgorithm.ts';

/**
 * Options for RSA signing and verification.
 *
 * The RSA key size is not configurable here — it is read from the PEM key
 * supplied to `signRSA` / `verifyRSA`.
 */
export type RSAOptions = {
  /**
   * Hash algorithm to use.
   * @default 'SHA-256'
   */
  hashAlgorithm?: RSAHashAlgorithm;

  /**
   * RSA signature scheme.
   *
   * - `'PSS'` — RSASSA-PSS (the default; RFC 7518 `PS*`).
   * - `'PKCS1'` — RSASSA-PKCS1-v1_5 (RFC 7518 `RS*`).
   *
   * Both ends (sign + verify) must use the same scheme; a PSS signature does
   * not verify under PKCS#1 v1.5 and vice versa.
   *
   * @default 'PSS'
   */
  scheme?: 'PSS' | 'PKCS1';
};
