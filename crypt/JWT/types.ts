/**
 * Supported JWT signing algorithms.
 *
 * All algorithms use HMAC (Hash-based Message Authentication Code) with different hash functions:
 * - HS256: HMAC using SHA-256 (recommended for most use cases)
 * - HS384: HMAC using SHA-384 (stronger security, larger signatures)
 * - HS512: HMAC using SHA-512 (strongest security, largest signatures)
 *
 * @example
 * ```typescript
 * const algorithm: JWTAlgorithm = 'HS256';
 * const token = await issueJWT(algorithm, payload, secret);
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7518#section-3.2} RFC 7518 - HMAC with SHA-2 Functions
 */
export type JWTAlgorithm = 'HS256' | 'HS384' | 'HS512';

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
 *   typ: 'JWT'
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
 *   audience: 'api.example.com',
 *   issuer: 'auth.example.com',
 *   maxAge: 3600, // 1 hour
 *   clockTolerance: 30, // 30 seconds tolerance for clock skew
 *   ignoreExpiration: false
 * };
 *
 * const payload = await verifyJWT(token, secret, options);
 * ```
 */
export type JWTVerifyOptions = {
  /** Expected audience(s) - token must match at least one */
  audience?: string | string[];
  /** Expected issuer(s) - token must match at least one */
  issuer?: string | string[];
  /** Expected subject - token must match exactly */
  subject?: string;
  /** Maximum age in seconds - token must not be older than this */
  maxAge?: number;
  /** Clock skew tolerance in seconds (default: 0) */
  clockTolerance?: number;
  /** Skip expiration time validation */
  ignoreExpiration?: boolean;
  /** Skip not-before time validation */
  ignoreNotBefore?: boolean;
};
