/**
 * @fileoverview Result of converting a COSE key to a JWK for
 * `@tundralibs/crypt/cbor`.
 *
 * @module
 */

/** The JWS/COSE algorithm a converted key is bound to. */
export type CoseAlgorithm =
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'RS256'
  | 'RS384'
  | 'RS512';

/**
 * A COSE key converted to a Web-Crypto-importable JWK plus the algorithm it
 * is bound to. Import `jwk` with `crypto.subtle.importKey('jwk', jwk, …)`;
 * `algorithm` tells you which primitive/hash to verify with (`ES256` →
 * ECDSA P-256 / SHA-256, `RS256` → RSASSA-PKCS1-v1_5 / SHA-256, …).
 */
export type CoseKeyResult = {
  jwk: JsonWebKey;
  algorithm: CoseAlgorithm;
};
