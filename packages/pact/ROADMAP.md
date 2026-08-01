# PACT — Roadmap

Known limitations, planned hardening, and deferred work for `@tundralibs/pact`.
None of these block the current feature set — they **bound** it. Security-posture
items marked 🔒 are the intended fast-follow.

For how PACT works today, see the topic guides in [`docs/`](./docs/) (start with
[Authorization](docs/Pact-Authorization.md) and [Login & OAuth](docs/Pact-OAuth.md)).

---

## Security posture (fast-follow)

- ✅ **JWKS for `id_token`s — done.** `IdTokenVerifier` fetches and caches a
  remote `jwks_uri`, selects by `kid`, refreshes on rotation, and pins the
  algorithm the **JWKS key** declares (not the token header — closing
  algorithm-confusion). The cryptography is delegated to crypt's `verifyJWT`,
  which accepts the JWKS entry as a JWK and validates it against the operation.
  Applies to the `id_token` identity path (Apple, userinfo-less `oidc`).
  Availability failures follow the documented `idTokenVerification` policy;
  signature, key, algorithm, and claim failures are always fatal.
- 🔒 **JWKS not wired into `verifyJWT`.** PACT's _own_ token verification still
  uses the configured `secret`/key — the JWKS path covers inbound provider
  `id_token`s only. Verifying arbitrary external-IdP access tokens by `kid`
  remains open.
- 🔒 **OIDC `nonce` is validate-only.** `expectedNonce` on the callback enforces
  the claim fail-closed, but PACT does not _generate_ or thread the nonce through
  `getAuthorizationUrl` — the consumer supplies it via `params` and stores it
  alongside `state`.
- 🔒 **Single verify key (no keyring).** `keyId` is stamped on issued tokens, but
  `verifyJWT` cannot select a secret by `kid` for zero-downtime rotation. Mirror
  norm's `rotateKey`/keyring pattern.
- **Apple client secrets are not minted for you.** Apple's client "secret" is
  itself a short-lived ES256 JWT. crypt can issue one (ES\* landed with ECDSA
  support), but PACT has no provider-client-secret minting helper, so the
  consumer mints it out-of-band and passes it via `clientSecret`.

## OAuth completeness

- **GitHub null email** — a private primary email needs a second `/user/emails`
  call; not implemented (documented in the preset).
- **No provider-token refresh** — `tokens.refreshToken` is handed back raw;
  there's no `refreshProviderToken()` (refresh_token grant) helper.
- **7 providers + generic OIDC** — adding presets is cheap (endpoints + scopes +
  normalizer); Twitter/X, LinkedIn, GitLab, Slack, Spotify are the usual next
  asks.

## Group cache (deferred hardening)

- **No single-flight on cold cache.** N concurrent misses for the same id each
  call the resolver before the first write lands — backend load amplification
  only (the cache converges correctly). Add a per-id in-flight promise if it
  matters.
- **Unbounded cache, no TTL/eviction.** Every requested id — including ones the
  resolver never returns (`{}`) — is cached forever, and default `sync()`
  re-resolves them each tick. Authz stays fail-closed; it's a memory/load concern
  only if a consumer feeds request-influenced ids. Add TTL/LRU if so.

## Residual secret exposure

- **OAuth `clientSecret` still lives in the option store.** The JWT/HMAC/RSA
  `secret` is held privately (out of `getOptions()`), but per-provider
  `oauth[*].clientSecret` values remain in the options bag, so an inspect-style
  logger dumping `getOptions()` could surface them. Redacting them (or holding
  them beside the `OAuthClient` instances) is a follow-up.

## Ergonomics (not yet designed)

- **Grants-in-JWT sugar** — today `serializeGrants` in / `deserializeGrants` out
  is manual; could be `generateJWT(claims, { grants })` + auto-decode, or a
  `canFromToken(token, module, perm)` convenience.
- **`assertForGroups`** — throwing twin of `hasPermissionForGroups`.
- **Scoped API keys** — attach a grants mask to a key at mint time and return it
  on verify (very on-brand for a bitmask kernel).
- **`client_credentials` / device-authorization flows** — M2M OAuth, pairs with
  API keys.
- **Framework guards** — `requirePermission(...)` middleware likely belongs in
  `radrouter`/the HTTP layer, not this kernel.

## Deferred (post-v1)

Group hierarchy/inheritance (Casbin RBAC1); per-scope allow/deny overwrites
(Discord-style two-mask layering); more OAuth providers; MFA/TOTP (crypt already
ships an `OTP` module, so an integration recipe is cheap when wanted).
