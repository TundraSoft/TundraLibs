import type { JWTAlgorithm } from './JWTAlgorithm.ts';

/**
 * JWT header structure.
 *
 * Contains metadata about the token including the signing
 * algorithm and token type.
 *
 * @example
 * ```ts
 * const header: JWTHeader = {
 *   alg: 'HS256',
 *   typ: 'JWT',
 *   kid: 'key-2024-01', // Optional key ID for key rotation
 * };
 *
 * // RFC 9068 OAuth 2.0 access token
 * const accessTokenHeader: JWTHeader = { alg: 'RS256', typ: 'at+jwt' };
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7519#section-5} RFC 7519 — JWT Header
 */
export type JWTHeader = {
  /** Signing algorithm used. */
  alg: JWTAlgorithm;
  /**
   * Token type — a media type, so any string is structurally legal.
   *
   * `'JWT'` is the conventional value; RFC 9068 OAuth 2.0 access tokens use
   * `'at+jwt'`. Per RFC 7515 §4.1.9 an `application/` prefix may be omitted
   * when the remainder contains no `/`, and comparison is case-insensitive —
   * `'JWT'`, `'jwt'` and `'application/JWT'` all denote the same type.
   * `verifyJWT` only *accepts* a token whose `typ` is in its allow-list.
   */
  typ: string;
  /** Optional key ID for key rotation scenarios. */
  kid?: string;
};
