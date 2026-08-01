/**
 * @fileoverview RSA key-pair type for `@tundralibs/pact` (RS* JWT families).
 * @module
 */

/**
 * PEM key pair for the asymmetric JWT families (`RS*`). The private key
 * signs, the public key verifies.
 */
export type PACTKeyPair = {
  /** PEM private key — used to sign (issue/refresh). */
  privateKey: string;
  /** PEM public key — used to verify. */
  publicKey: string;
};
