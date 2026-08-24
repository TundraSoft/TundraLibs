# pact — Roadmap

Known limitations, planned hardening, and deferred work for
`@tundralibs/pact`. None of these block the current feature set — they
**bound** it.

## Next major feature

- **Passkeys / WebAuthn** (design locked, deliberately not in this cut).
  First-factor login method: `passkeyRegisterOptions` → `registerPasskey`
  and `passkeyLoginOptions` → `login('passkey', assertion)`; single-use
  challenge state via `saveChallenge`/`consumeChallenge` hooks; credential
  store via `getPasskey`/`savePasskey`/`listPasskeys`; `rpId` +
  exact-origin allowlist config; sign-counter clone detection. The gating
  work is a CBOR/COSE decoder — preferred home is `crypt` (reusable
  WebAuthn primitives) rather than pact-internal.

## Security posture

- **Resource-server mode.** `BEARER` verifies pact-issued tokens only.
  Verifying EXTERNAL-IdP access tokens (Auth0/Cognito/Entra) by issuer
  JWKS + `kid` — pointing the existing `IdTokenVerifier` machinery at
  `verify()` via config — is designed and high-value for apps that never
  mint their own tokens.
- **HMAC replay window.** `HMAC` signatures verify forever unless the
  signed payload carries a timestamp/nonce and freshness is checked. The
  framework owns payload canonicalization today; a `maxSkew` convenience
  option could move the freshness check into pact.
- **Single verify key (no keyring).** Zero-downtime rotation of pact's
  own signing secret needs `kid`-based key selection on verify.

## Ergonomics

- **Compile-time hook gating.** The capability→hook table is validated at
  construction (runtime). Lifting it to the type level needs a factory
  function (constructors cannot be generic over their argument).
- **`OPAQUE` sliding expiry.** Opaque sessions have a fixed lifetime;
  sliding renewal on activity is a possible opt-in (it costs a store
  write per request, so it will not be the default).
- **Simple-token / api-key revocation helpers.** Revocation today is an
  app-side write (`revokedAt`); pact could offer `revokeToken`/
  `revokeApiKey` sugar over the existing hooks.

## OAuth completeness

- **Provider-token refresh** — `tokens.refreshToken` is handed back raw;
  there is no `refreshProviderToken()` (refresh_token grant) helper.
- **GitHub null email** — a private primary email needs a second
  `/user/emails` call; not implemented (documented in the preset).
- **Apple client-secret minting** — Apple's client "secret" is a
  short-lived ES256 JWT the consumer mints out-of-band; a helper over
  crypt's ECDSA support is a candidate.
- **More presets** — Twitter/X, LinkedIn, GitLab, Slack are the usual
  asks; the generic `OIDC` discovery preset covers most modern IdPs, so
  the preset list stays deliberately small.
- **M2M flows** — `client_credentials` and the device-authorization grant
  (RFC 8628) pair naturally with api keys and CLIs.

## Deferred

MFA beyond TOTP (recovery codes, SMS/email codes as first-class — both
buildable today as recipes over `issueToken`); SAML (use `OIDC`; XML-DSig
is out of scope); Digest/Kerberos/SCRAM (strategies at best).
