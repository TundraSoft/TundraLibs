import type { JWTAlgorithm } from './JWTAlgorithm.ts';

/**
 * Options for JWT verification and claim validation.
 *
 * Provides fine-grained control over how JWTs are validated,
 * including time-based checks, claim validation, and security
 * options.
 *
 * @example
 * ```ts
 * import { verifyJWT } from '@tundralibs/crypt/JWT';
 *
 * declare const token: string;
 * declare const secret: string;
 *
 * const options: JWTVerifyOptions = {
 *   aud: 'api.example.com',
 *   iss: 'auth.example.com',
 *   maxAge: 3600, // 1 hour
 *   clockTolerance: 30, // 30 seconds tolerance for clock skew
 *   ignoreExpiration: false,
 *   requiredClaims: ['sub', 'iat'],
 * };
 *
 * const payload = await verifyJWT(token, secret, options);
 * ```
 */
export type JWTVerifyOptions = {
  /**
   * Expected algorithm(s) — the token's `alg` must be one of these.
   *
   * Accepts a single algorithm or an allow-list. Pinning the algorithm is the
   * first line of defense against algorithm-confusion attacks and is strongly
   * recommended. Even when omitted, `verifyJWT` still binds the verification
   * primitive to the *shape* of the supplied key (a PEM key only verifies
   * `RS*` tokens; a raw secret only verifies `HS*` tokens), so a public key can
   * never be abused as an HMAC secret.
   */
  algorithm?: JWTAlgorithm | JWTAlgorithm[];
  /**
   * Require the JOSE `typ` header to be one of these values.
   *
   * **Omit this and `typ` is not checked at all.** RFC 7519 §5.1 makes `typ`
   * OPTIONAL and states it "is ignored by JWT implementations; any processing
   * of this parameter is performed by the JWT application" — and real tokens
   * rely on that (Apple's OIDC `id_token` header carries only `kid`/`alg`,
   * while `secevent+jwt`, `dpop+jwt` and `logout+jwt` are all legitimate types
   * no general verifier can enumerate). So the default is to ignore it.
   *
   * **Setting it makes `typ` mandatory**: the header must carry a `typ` *and*
   * it must match, so a token cannot slip past a pin by simply omitting the
   * header. This is the opt-in a profile-specific verifier wants — an RFC 9068
   * resource server pins `'at+jwt'` and thereby refuses an `id_token` minted by
   * the same issuer with the same key.
   *
   * Cross-type confusion is *primarily* defended by `aud`/`iss` and algorithm
   * pinning; `typ` is a supplementary signal, which is why it is opt-in rather
   * than on by default.
   *
   * Values are compared per RFC 7515 §4.1.9 / RFC 7519 §5.1: `typ` carries a
   * media type, so matching is **case-insensitive** and an omitted
   * `application/` prefix is implied for any value containing no `/`. Both
   * this list and the token's `typ` are normalised the same way, so
   * `'at+jwt'`, `'AT+JWT'` and `'application/at+jwt'` are interchangeable on
   * either side.
   *
   * ```ts
   * import { JWT_DEFAULT_TYPES, verifyJWT } from '@tundralibs/crypt/JWT';
   *
   * declare const token: string;
   * declare const key: string;
   *
   * // Not checked — a token with any typ, or none, verifies.
   * await verifyJWT(token, key);
   *
   * // Access tokens only: `typ: 'JWT'` and typ-less tokens are both rejected.
   * await verifyJWT(token, key, { typ: 'at+jwt' });
   *
   * // Conventional values plus a bespoke type.
   * await verifyJWT(token, key, { typ: [...JWT_DEFAULT_TYPES, 'my+jwt'] });
   * ```
   *
   * An empty array is taken literally and rejects every token.
   */
  typ?: string | readonly string[];
  /** Expected audience(s) — token must match at least one. */
  aud?: string | string[];
  /** Expected issuer(s) — token must match at least one. */
  iss?: string | string[];
  /** Expected subject — token must match exactly. */
  sub?: string;
  /** Expected JWT ID — useful for token revocation checks. */
  jti?: string;
  /** List of claims that must be present in the token. */
  requiredClaims?: string[];
  /**
   * Maximum age in seconds — the token must not be older than this, measured
   * from its `iat` claim.
   *
   * Because the age is derived from `iat`, this bound requires one: a token with
   * no `iat` cannot be aged, so it is **rejected** (`INVALID_CLAIMS`) rather
   * than silently passing. `iat` is OPTIONAL in RFC 7519, so foreign tokens may
   * omit it — set `maxAge` only against issuers that stamp `iat`.
   */
  maxAge?: number;
  /** Clock skew tolerance in seconds (default: 0). */
  clockTolerance?: number;
  /** Skip expiration time validation. */
  ignoreExpiration?: boolean;
  /** Skip not-before time validation. */
  ignoreNotBefore?: boolean;
};
