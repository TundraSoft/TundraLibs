/**
 * Key material accepted by the signing and verification functions.
 *
 * Three forms, all interchangeable wherever this type appears:
 *
 * - **`string`** — a PEM-armoured asymmetric key (`-----BEGIN PUBLIC KEY-----`,
 *   `-----BEGIN PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`), or, when
 *   the string carries no PEM armour, a raw HMAC secret.
 * - **`CryptoKey`** — an already-imported Web Crypto key, used as-is. Skips the
 *   parse-and-import round trip and is the only form that can carry
 *   non-extractable key material.
 * - **`JsonWebKey`** — a JWK object, typically an entry straight out of a
 *   provider's JWKS document.
 *
 * ## Supplying a key does not mean it will be trusted
 *
 * Whichever form is used, the key is checked against the operation before any
 * cryptography happens: its family must match the algorithm (an EC key cannot
 * serve an `RS*` operation, a public key cannot serve an HMAC one), an EC key's
 * curve must be the one the algorithm binds, and a JWK's own `alg`, `use`,
 * `key_ops` and `kty`/`crv` metadata must not contradict what is being asked of
 * it. A key that fails any of these raises rather than silently degrading to a
 * weaker check — see `describeKey` and the JWT verification docs.
 *
 * @see {@link https://www.rfc-editor.org/rfc/rfc7517} RFC 7517 — JSON Web Key
 */
export type SigningKey = string | CryptoKey | JsonWebKey;
