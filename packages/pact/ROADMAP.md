# pact — Roadmap

Known limitations, planned hardening, and deferred work for
`@tundralibs/pact`. None of these block the current feature set — they
**bound** it.

## Committed follow-ups (additive minors)

Both are **purely additive** — new opt-in capabilities with new hooks, no
breaking change — so they ship as follow-up minors _after_ the overhaul
release rather than gating it. Passkeys first (design settled, crypto
ready), then resource-server mode.

- **Passkeys / WebAuthn** (design settled; gating crypto landed — build-ready).
  A passwordless login method. Config: `rpId` + `rpName` + exact-origin
  allowlist (plus `userVerification`, `algorithms`, `timeout`). Four ceremony
  methods — `begin`/`finishPasskeyRegistration` and
  `begin`/`finishPasskeyAuthentication` (the latter mints a session, like
  `login('password')`). Credential store via `getPasskeyCredential` /
  `savePasskeyCredential` / `updatePasskeyCounter` (plus optional
  `getUserPasskeys` for exclude/allow lists); the public key is stored as a
  JWK. The single-use challenge is **app-owned** — returned by `begin…` and
  passed back as `expectedChallenge`, mirroring OAuth `state`; no challenge
  hooks. ES256 + RS256, full ceremony verification (challenge / origin /
  `rpIdHash` / UP-UV flags), sign-counter clone detection. The gating CBOR/COSE
  decoder and ECDSA DER→raw converter already shipped in `crypt`
  (`crypt/cbor` — `decodeCBOR`/`coseToJwk`; `ecdsaDerToRaw`) as reusable
  WebAuthn primitives.
  - _Deferred within passkeys._ **Ed25519** (`-8`) needs an OKP sign/verify
    path in `crypt/sign` first; added when convenient — ES256 + RS256 already
    cover essentially every authenticator in the wild. **Full
    attestation-statement verification** (`packed`/`tpm`/`android-key`, cert
    chains, FIDO MDS) is built only on a concrete device-allowlist need —
    `none` is the passkey-login norm; the registration path is structured so a
    verifier slots in later without rework.

- **Resource-server mode** (design in progress). Today `BEARER` verifies
  pact-ISSUED tokens only; this adds verifying EXTERNAL-IdP access tokens
  (Auth0/Cognito/Entra) by issuer JWKS + `kid`, reusing the `IdTokenVerifier`
  JWKS engine — routed in `authenticate()` by the token's `iss` (so `verify()`
  stays pact-issued-only), fail-closed on an unreachable key set. Config:
  `resourceServer: [{ issuer, jwksUri, audience, algorithms? }]`. **Open
  question:** how a verified external token becomes a principal — store-mapped
  (`getUser({by:'ID'})`, pact still authorizes) vs. claims-derived (a
  `principalFromClaims` mapper, for apps with no user store) vs. both.

## Security posture

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
