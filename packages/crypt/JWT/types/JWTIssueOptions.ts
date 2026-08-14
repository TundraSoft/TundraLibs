/**
 * Options for JWT issuance.
 *
 * Controls the JOSE header fields `issueJWT` stamps on the token it mints.
 * The signing algorithm is a separate positional argument — everything that
 * is *optional* header metadata lives here.
 *
 * @example
 * ```ts
 * import { issueJWT } from '@tundralibs/crypt/JWT';
 *
 * declare const secret: string;
 * declare const privateKey: string;
 *
 * // Key ID for rotation
 * const token = await issueJWT('HS256', { sub: 'u1' }, secret, {
 *   kid: 'key-2024-01',
 * });
 *
 * // RFC 9068 OAuth 2.0 access token
 * const accessToken = await issueJWT('RS256', { sub: 'u1' }, privateKey, {
 *   typ: 'at+jwt',
 * });
 * ```
 *
 * @see {@link https://tools.ietf.org/html/rfc7515#section-4.1} RFC 7515 — JOSE Header
 */
export type JWTIssueOptions = {
  /** Key ID (`kid`) advertised in the header, for key-rotation scenarios. */
  kid?: string;
  /**
   * JOSE `typ` header value (default: `'JWT'`).
   *
   * Set to `'at+jwt'` to mint an RFC 9068 OAuth 2.0 access token; any non-empty
   * media type is accepted here, including a bespoke one.
   *
   * On the verifying side, `verifyJWT` **ignores `typ` by default** (RFC 7519
   * §5.1 makes it OPTIONAL and leaves its interpretation to the application), so
   * a token minted with any `typ` verifies without extra plumbing. `typ` is
   * only enforced when the verifier opts in by passing `options.typ`, and then
   * it is *mandatory*: the header's `typ` must be present and match. So pin
   * `options.typ` on the verifying endpoint if you rely on `typ` to reject a
   * cross-type token replay — that check is not on by default.
   */
  typ?: string;
};
