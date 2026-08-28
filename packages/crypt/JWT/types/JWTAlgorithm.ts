/**
 * Supported JWT signing algorithms.
 *
 * HMAC algorithms (symmetric — use shared secret):
 * - `HS256`: HMAC using SHA-256 (recommended for most use cases)
 * - `HS384`: HMAC using SHA-384 (stronger security, larger signatures)
 * - `HS512`: HMAC using SHA-512 (strongest security, largest signatures)
 *
 * RSA PKCS#1 v1.5 algorithms (asymmetric — RFC 7518 `RS*`):
 * - `RS256`: RSASSA-PKCS1-v1_5 using SHA-256 (the most widely-used JWT RSA alg)
 * - `RS384`: RSASSA-PKCS1-v1_5 using SHA-384
 * - `RS512`: RSASSA-PKCS1-v1_5 using SHA-512
 *
 * RSA-PSS algorithms (asymmetric — RFC 7518 `PS*`):
 * - `PS256`: RSASSA-PSS using SHA-256 (modern; preferred for new systems)
 * - `PS384`: RSASSA-PSS using SHA-384
 * - `PS512`: RSASSA-PSS using SHA-512
 *
 * ECDSA algorithms (asymmetric — RFC 7518 `ES*`):
 * - `ES256`: ECDSA on **P-256** using SHA-256 (common in OIDC `id_token`s)
 * - `ES384`: ECDSA on **P-384** using SHA-384
 * - `ES512`: ECDSA on **P-521** using SHA-512
 *
 * EdDSA (asymmetric — RFC 8037):
 * - `EdDSA`: Ed25519 signatures. No hash or curve to choose — both are fixed
 *   by the algorithm — and signing is deterministic. Needs an Ed25519 key
 *   (PKCS#8/SPKI PEM, `Ed25519` `CryptoKey`, or `OKP` JWK).
 *
 * Both RSA families are RFC 7518-compliant and interoperate with standard JWT
 * implementations. `RS*` and `PS*` accept the same RSA key material; pick the
 * scheme the verifying party expects (`RS256` is the common default).
 *
 * ECDSA keys are *not* interchangeable with RSA keys, and each `ES*` algorithm
 * is bound to exactly one curve. Note that **`ES512` uses P-521**, not a
 * nonexistent "P-512" — the algorithm is named for its hash and the curve for
 * its field size. Issuing or verifying with a key on the wrong curve is
 * rejected rather than attempted; see `verifyJWT`'s algorithm-confusion notes.
 *
 * @example
 * ```ts
 * import { issueJWT, type JWTPayload } from '@tundralibs/crypt/JWT';
 *
 * declare const payload: JWTPayload;
 * declare const privateKeyPEM: string;
 * declare const ecPrivateKeyPEM: string;
 *
 * // HMAC
 * const hmacToken = await issueJWT('HS256', payload, 'secret-key');
 *
 * // RSA
 * const rsaToken = await issueJWT('RS256', payload, privateKeyPEM);
 *
 * // ECDSA — the key must be on P-256
 * const ecToken = await issueJWT('ES256', payload, ecPrivateKeyPEM);
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7518#section-3} RFC 7518 — JWT Algorithms
 */
export type JWTAlgorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'EdDSA';
