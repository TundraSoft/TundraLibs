# pact — Roadmap

Known limitations, planned hardening, and deferred work for
`@tundralibs/pact`. None of these block the current feature set — they
**bound** it.

## Committed follow-ups (additive minors)

Everything here is **purely additive** — new opt-in capabilities, options, or
methods with no breaking change — so these ship as follow-up minors _after_
the overhaul release rather than gating it. Rough order: passkeys first (design
settled, crypto ready); the hardening/ergonomics items are small and can batch;
resource-server once its principal-model design is settled.

### Features

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

### Hardening & ergonomics

- **HMAC replay window (skew-bounding).** A captured `(payload, signature)`
  pair verifies forever today. Add an optional `timestamp` to the `HMAC`
  credential (framework-extracted) plus a `maxSkew` option; reject outside the
  window. True single-use (a `nonce` + a seen-nonce store) stays a documented
  `@tundralibs/cacher` recipe rather than built-in — pact keeps the `HMAC`
  path stateless.
- **Signing keyring (`kid` rotation).** Today's single `secret`/key pair means
  rotating it logs everyone out. Add an optional
  `keys: [{ kid, secret | keyPair, active }]` beside `secret`; sign with the
  active key and stamp its `kid` (crypt's `issueJWT` already carries one),
  select by `header.kid` on verify, and keep retiring keys verify-only until
  old tokens expire. Zero-downtime signing-key rotation; shares the
  `kid`-select path with resource-server mode, and matters most for `RS*`.
- **Revocation helpers.** Revocation is an app-side `revokedAt` write today.
  Add `revokeApiKey(keyId)` (wires the already-defined hook) and
  `revokeToken(token)` (a new `revokeToken(tokenHash)` hook, symmetric with
  `revokeApiKey`).
- **Compile-time hook gating.** `Pact.create(options)` is already the sole
  entry point (the constructor is private) — that landed in the overhaul so the
  construction API is final from the first release. What remains is lifting the
  capability→hook table from a runtime `PactDefinitionError` to a _compile_
  error on `create`'s signature (e.g. `password` on ⇒ `getUser` required in
  `hooks`) via conditional types — pure type-tightening on the settled entry
  point, no runtime or API change.

## Security-review hardening backlog (2026-08)

From a two-pass adversarial audit — no critical/high issues; the kernel's core
defenses (alg-pinning, reuse detection, prototype-pollution, status gate) are
solid. These are the actionable hardening/robustness/doc items it surfaced,
**for triage** (grouped, not yet committed):

- **Uniform `null` on bad input across `authenticate`.** The `HMAC` branch
  passes an attacker-supplied signature straight to `verifyHMAC`, which _throws_
  on a malformed signature → a 500 instead of the documented `null` (its sibling
  `verifySignature` already guards this). Wrap it — and ideally the whole
  `authenticate` switch — so a throwing verify / a malformed stored `grants` /
  a throwing hook resolves to `null`, and add a `default: return null` for an
  unrecognized scheme.
- **Keep the signing secret off introspection surfaces.** The secret / private
  key is an own-**enumerable** field, so `console.log(pact)` / `util.inspect` /
  spread expose it. Make it (and `hooks`/`oauth`) non-enumerable or hold it in a
  `WeakMap`; consider a `toJSON`/inspect guard.
- **Bound the JWKS fetch.** It bypasses RESTler's timeout and has no
  response-size / key-count cap → a stalling `jwks_uri` hangs login. Add an
  `AbortSignal` timeout (via compat) + size/key caps; optionally constrain a
  discovery-supplied `jwks_uri` to the issuer host.
- **Hash opaque session ids at rest** (or document them as bearer-equivalent):
  today the `OPAQUE` token _is_ the stored key in plaintext, while the `TOKEN`
  scheme stores only a sha-256 — an asymmetric store-leak exposure.
- **Defensive store-data handling.** Treat a non-numeric `expiresAt` as expired
  (fail closed), and validate/normalise `grants` at the write boundary so a
  corrupt row can't 500 the read path.
- **Authz degenerate-input safety.** Decide whether an empty/`0n` required
  permission (`has(m,0n,·)`, `all(m,[],·)`, `toMask(m,[])`) should fail closed
  rather than be vacuously satisfied; `Number.isSafeInteger` guard on
  `deserializeGrants`' number branch; validate grant _values_ are `bigint` on
  the `authz` API.
- **Revocation reach + telemetry.** Consult `isRevoked` in `refresh` (or
  document that it governs only the access path); redact the raw token from the
  `verifyFailed` event.
- **OIDC completeness.** TTL the discovery document; require `azp` when `aud` is
  multi-valued; spread app `authParams` _before_ the generated `state`/PKCE so
  they can't override them.
- **Doc-accuracy / footguns to document.** Fix the `verify`/`refresh`
  `@throws MISSING_OPTION` claim (it resolves `null`); note TOTP codes are
  replayable within the verification window; note `setPassword` does not
  invalidate existing sessions (point at `logoutAll`); note `embedGrants`
  freezes `status: 'ACTIVE'` + empties `metadata`; note scoped api-key/token
  `grants` _replace_ (not intersect) the user's and outlive a grant downgrade.
- **Password KDF strength.** `register`/`setPassword` use crypt's default
  210 000 PBKDF2-SHA256 iterations (OWASP's SHA-256 figure is 600 000); expose
  an override or raise the crypt default.

## Backlog — bounds the feature set, not yet committed

- **`OPAQUE` sliding expiry.** Opaque sessions have a fixed lifetime; sliding
  renewal on activity is a possible opt-in (it costs a store write per request,
  throttled, so it will not be the default).

### OAuth completeness

- **Provider-token refresh** — `tokens.refreshToken` is handed back raw; there
  is no `refreshProviderToken()` (refresh_token grant) helper. Worth it only
  for apps that call provider APIs after login.
- **GitHub null email** — a private primary email needs a second
  `/user/emails` call; not implemented (documented in the preset).
- **Apple client-secret minting** — Apple's client "secret" is a short-lived
  ES256 JWT the consumer mints out-of-band; a helper over crypt's ECDSA support
  is a candidate.
- **More presets** — Twitter/X, LinkedIn, GitLab, Slack are the usual asks; the
  generic `OIDC` discovery preset covers most modern IdPs, so the preset list
  stays deliberately small.
- **M2M flows** — `client_credentials` and the device-authorization grant
  (RFC 8628) pair naturally with api keys and CLIs.

## Deferred

MFA beyond TOTP (recovery codes, SMS/email codes as first-class — both
buildable today as recipes over `issueToken`); SAML (use `OIDC`; XML-DSig
is out of scope); Digest/Kerberos/SCRAM (strategies at best).
