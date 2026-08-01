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
 * ```ts
 * const payload: JWTPayload = {
 *   sub: 'user123',
 *   iss: 'auth.example.com',
 *   aud: ['api.example.com', 'web.example.com'],
 *   exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
 *   role: 'admin',
 *   permissions: ['read', 'write'],
 * };
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7519#section-4} RFC 7519 — JWT Claims
 */
export type JWTPayload = {
  /** Issued at timestamp (seconds since epoch). */
  iat?: number;
  /** Expiration timestamp (seconds since epoch). */
  exp?: number;
  /** Not before timestamp (seconds since epoch). */
  nbf?: number;
  /** JWT unique identifier. */
  jti?: string;
  /** Subject (typically user ID). */
  sub?: string;
  /** Issuer of the token. */
  iss?: string;
  /** Audience(s) that the token is intended for. */
  aud?: string | string[];
  /** Custom claims — any additional key-value pairs. */
  [key: string]: unknown;
};
