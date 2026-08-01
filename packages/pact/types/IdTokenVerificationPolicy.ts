/**
 * @fileoverview `id_token` signature-verification policy for
 * `@tundralibs/pact` OAuth instances.
 * @module
 */

/**
 * How strictly an OAuth instance treats JWKS-backed `id_token` signature
 * verification when the key set cannot be obtained.
 *
 * This *only* governs the **availability** axis — a token whose signature or
 * claims are actually wrong is rejected under either policy. See
 * `docs/Pact-OAuth.md` for the full failure-mode table.
 *
 * - `'preferred'` (default) — verify the signature whenever the JWKS is
 *   reachable and the token's `kid` resolves; if the key set cannot be
 *   obtained (network failure, non-2xx, malformed document, or a `kid` that
 *   is still unknown after a forced refresh), fall back to decoding the
 *   token. Standard claims (`iss`/`aud`/`exp`/`nbf`/`nonce`) are validated
 *   either way. This keeps a provider-side JWKS outage from taking down all
 *   logins, and matches the pre-existing (decode-only) behaviour as the floor
 *   rather than the ceiling.
 * - `'required'` — a key set that cannot be obtained is a hard failure
 *   (`OAUTH_JWKS_UNAVAILABLE`). Strictly safer, at the cost of making every
 *   login depend on a second network call to the provider.
 */
export type IdTokenVerificationPolicy = 'required' | 'preferred';
