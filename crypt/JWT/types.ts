/**
 * Supported JWT signing algorithms.
 *
 * HMAC algorithms (symmetric - use shared secret):
 * - HS256: HMAC using SHA-256 (recommended for most use cases)
 * - HS384: HMAC using SHA-384 (stronger security, larger signatures)
 * - HS512: HMAC using SHA-512 (strongest security, largest signatures)
 *
 * RSA algorithms (asymmetric - use public/private key pairs):
 * - RS256: RSA-PSS using SHA-256 (recommended for public key scenarios)
 * - RS384: RSA-PSS using SHA-384 (stronger security)
 * - RS512: RSA-PSS using SHA-512 (strongest security)
 *
 * @example
 * ```typescript
 * // HMAC
 * const token = await issueJWT('HS256', payload, 'secret-key');
 *
 * // RSA
 * const token = await issueJWT('RS256', payload, privateKeyPEM);
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7518#section-3} RFC 7518 - JWT Algorithms
 */
export type JWTAlgorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512';

/**
 * JWT payload structure containing standard and custom claims.
 *
 * Standard claims (optional):
 * - `iat` (Issued At): Timestamp when the token was issued
 * - `exp` (Expiration Time): Timestamp when the token expires
 * - `nbf` (Not Before): Timestamp before which the token is invalid
 * - `jti` (JWT ID): Unique identifier for the token
 * - `sub` (Subject): Principal that is the subject of the JWT (typically user ID)
 * - `iss` (Issuer): Principal that issued the JWT
 * - `aud` (Audience): Recipients that the JWT is intended for
 *
 * Custom claims can be added using any key-value pairs.
 *
 * @example
 * ```typescript
 * const payload: JWTPayload = {
 *   sub: 'user123',
 *   iss: 'auth.example.com',
 *   aud: ['api.example.com', 'web.example.com'],
 *   exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
 *   role: 'admin',
 *   permissions: ['read', 'write']
 * };
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7519#section-4} RFC 7519 - JWT Claims
 */
export type JWTPayload = {
  /** Issued at timestamp (seconds since epoch) */
  iat?: number;
  /** Expiration timestamp (seconds since epoch) */
  exp?: number;
  /** Not before timestamp (seconds since epoch) */
  nbf?: number;
  /** JWT unique identifier */
  jti?: string;
  /** Subject (typically user ID) */
  sub?: string;
  /** Issuer of the token */
  iss?: string;
  /** Audience(s) that the token is intended for */
  aud?: string | string[];
  /** Custom claims - any additional key-value pairs */
  [key: string]: unknown;
};

/**
 * JWT header structure.
 *
 * Contains metadata about the token including the signing algorithm and token type.
 *
 * @example
 * ```typescript
 * const header: JWTHeader = {
 *   alg: 'HS256',
 *   typ: 'JWT',
 *   kid: 'key-2024-01' // Optional key ID for key rotation
 * };
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7519#section-5} RFC 7519 - JWT Header
 */
export type JWTHeader = {
  /** Signing algorithm used */
  alg: JWTAlgorithm;
  /** Token type (always 'JWT') */
  typ: 'JWT';
  /** Optional key ID for key rotation scenarios */
  kid?: string;
};

/**
 * Options for JWT verification and claim validation.
 *
 * Provides fine-grained control over how JWTs are validated, including
 * time-based checks, claim validation, and security options.
 *
 * @example
 * ```typescript
 * const options: JWTVerifyOptions = {
 *   aud: 'api.example.com',
 *   iss: 'auth.example.com',
 *   maxAge: 3600, // 1 hour
 *   clockTolerance: 30, // 30 seconds tolerance for clock skew
 *   ignoreExpiration: false,
 *   requiredClaims: ['sub', 'iat']
 * };
 *
 * const payload = await verifyJWT(token, secret, options);
 * ```
 */
export type JWTVerifyOptions = {
  /** Expected algorithm - if specified, token algorithm must match */
  algorithm?: JWTAlgorithm;
  /** Expected audience(s) - token must match at least one */
  aud?: string | string[];
  /** Expected issuer(s) - token must match at least one */
  iss?: string | string[];
  /** Expected subject - token must match exactly */
  sub?: string;
  /** Expected JWT ID - useful for token revocation checks */
  jti?: string;
  /** List of claims that must be present in the token */
  requiredClaims?: string[];
  /** Maximum age in seconds - token must not be older than this */
  maxAge?: number;
  /** Clock skew tolerance in seconds (default: 0) */
  clockTolerance?: number;
  /** Skip expiration time validation */
  ignoreExpiration?: boolean;
  /** Skip not-before time validation */
  ignoreNotBefore?: boolean;
};
