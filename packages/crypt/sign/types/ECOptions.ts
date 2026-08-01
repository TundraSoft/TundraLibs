import type { ECCurve } from './ECCurve.ts';
import type { ECHashAlgorithm } from './ECHashAlgorithm.ts';

/**
 * Options for ECDSA signing and verification.
 *
 * Both settings default to whatever the supplied key already commits to, so the
 * common case needs no options at all: the curve is read from the key material
 * and the hash follows the RFC 7518 §3.4 pairing for that curve.
 */
export type ECOptions = {
  /**
   * Hash algorithm to use.
   *
   * Defaults to the {@link ECCurve}'s JOSE pairing — SHA-256 for P-256,
   * SHA-384 for P-384, SHA-512 for P-521 — which is what any `ES*` verifier
   * will expect. Override it only for a non-JOSE protocol that pairs curve and
   * hash differently; ECDSA itself imposes no such binding.
   *
   * @default the curve's RFC 7518 pairing
   */
  hashAlgorithm?: ECHashAlgorithm;

  /**
   * Curve the key lies on.
   *
   * Normally omitted: the curve is read from the key material (the OID inside a
   * PEM, `algorithm.namedCurve` on a `CryptoKey`, `crv` on a JWK). Supply it to
   * *pin* the expectation — a key on any other curve is then rejected rather
   * than used, which is how the JWT layer binds `ES256` to P-256.
   *
   * @default read from the supplied key
   */
  curve?: ECCurve;
};
