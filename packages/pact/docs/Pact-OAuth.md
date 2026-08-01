# Login and OAuth

PACT's pluggable authentication seam: named credential **strategies** and an
in-house OAuth2 authorization-code + PKCE client (zero external dependencies).
Both funnel through one `login()` pipeline that resolves a principal, emits
events, and optionally mints a JWT — while your application keeps sole
ownership of user storage.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Login Strategies](#login-strategies)
- [OAuth Providers](#oauth-providers)
- [The OAuth Round-Trip](#the-oauth-round-trip)
- [OAuth as a Login Strategy](#oauth-as-a-login-strategy)
- [id_token Verification](#id_token-verification)
- [Provider Notes](#provider-notes)
- [Errors](#errors)
- [Related](#related)

## Login Strategies

A strategy is a function you register under a name — `(credentials) =>
Principal | null` (async allowed). PACT treats `credentials` as opaque: the
strategy decides what shape it expects and how to check it.

`login(name, credentials)` runs the matching strategy and:

- returns `{ principal, isNew, token? }` on success (emits `login`),
- returns `null` for **bad credentials** (the strategy returned `null`; emits
  `loginFailed` with no error),
- **rethrows** when the strategy throws — an _operational_ failure such as an
  unreachable store — after emitting `loginFailed` with the error.

A strategy signals a freshly provisioned account by returning
`{ principal, isNew: true }` instead of the bare principal; `isNew` defaults to
`false`. The resolved principal must carry a string `id` (it becomes the JWT
`sub`); a return that lacks one fails closed as bad credentials.

With `autoIssue: true`, a successful login also mints a JWT with
`sub = principal.id` and returns it as `result.token` (requires `secret`).

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n, WRITE: 2n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
  autoIssue: true, // mint a JWT (sub = principal.id) on success
  strategies: {
    // Return the principal on success, null for bad credentials.
    // Throw only for operational failures (store unreachable).
    password: async (creds) => {
      const { email, password } = creds as { email: string; password: string };
      const user = await db.findByEmail(email);
      if (!user || !(await verifyHash(password, user.hash))) return null;
      return { id: user.id, email: user.email };
    },
  },
  _onlogin: (strategy, principal, isNew) =>
    audit(strategy, principal.id, isNew),
});

const result = await pact.login('password', {
  email: 'a@b.com',
  password: '…',
});
if (result === null) {
  // bad credentials — `loginFailed` already emitted
} else {
  result.principal; // { id, email, … }
  result.isNew; // boolean
  result.token; // JWT (present because autoIssue is on)
}
```

Calling `login()` with a name that matches no strategy (and no OAuth instance)
throws `PactDefinitionError` (`UNKNOWN_STRATEGY`).

## OAuth Providers

OAuth instances are configured under the `oauth` option (instance name →
config) and double as built-in login strategies. Each references one of seven
presets that fix the endpoints, default scopes, and profile normalization:

| `provider`  | Default scopes         | Identity source            | Notable quirks                                                                                         |
| ----------- | ---------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `google`    | `openid email profile` | userinfo                   | —                                                                                                      |
| `github`    | `read:user user:email` | userinfo                   | Token exchange forced to JSON (`Accept: application/json`); `email` may be `null`; no `emailVerified`. |
| `microsoft` | `openid email profile` | userinfo                   | Tenant-scoped endpoints — set `tenant` (defaults to `common`).                                         |
| `discord`   | `identify email`       | userinfo                   | `avatar` is assembled into a CDN URL.                                                                  |
| `facebook`  | `email public_profile` | userinfo                   | —                                                                                                      |
| `apple`     | `name email`           | **id_token** (no userinfo) | `clientSecret` must be an ES256 JWT minted out-of-band; sends `response_mode=form_post`.               |
| `oidc`      | `openid email profile` | userinfo (discovered)      | Requires an `https://` `issuer`; endpoints discovered from `.well-known/openid-configuration`.         |

Whenever identity comes from the **id_token** rather than a userinfo fetch,
the token's signature is checked against the provider's JWKS — see
[id_token Verification](#id_token-verification).

Every preset normalizes the provider payload to the same `OAuthProfile`:
`{ provider, id, email?, emailVerified?, name?, avatar?, raw, tokens }`. `id`
is the provider's stable subject and is **required**: if the userinfo /
`id_token` payload carries no subject claim (a misconfigured or nonconforming
IdP, or a 200 error body), the callback fails closed with `OAUTH_PROFILE_FAILED`
rather than fabricate a placeholder id like `provider:undefined` that would
silently merge distinct users into one account. `raw` and `tokens` are passed
through untouched (PACT stores neither).

## The OAuth Round-Trip

The flow is two calls with a redirect in between. PACT is **stateless** — it
hands you the `state` and PKCE `verifier`, and you hold them (session, signed
cookie, …) until the callback.

1. `getAuthorizationUrl(provider, options?)` → `{ url, state, verifier }`.
   Redirect the user to `url`. Options may override `state`, override `scopes`,
   or add extra query `params`.
2. The provider redirects back with `code` (and `state`).
3. `handleCallback(provider, { code, verifier, state?, expectedState? })` → a
   normalized `OAuthProfile`.

The state check is **fail-closed on `expectedState`**: when you pass
`expectedState`, a callback `state` that is missing or unequal throws
`OAUTH_STATE_MISMATCH` — an attacker cannot bypass the check by dropping the
parameter. Omitting `expectedState` skips the check, so always pass it.

For id_token providers you can add a replay guard the same way: send a
`nonce` on the authorization request (`getAuthorizationUrl(provider, { params:
{ nonce } })`), stash it next to `state`, and pass it back as
`expectedNonce`. It is fail-closed once supplied — see
[id_token Verification](#id_token-verification).

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n },
  oauth: {
    google: {
      provider: 'google',
      clientId: '<your-google-client-id>',
      clientSecret: '<your-google-client-secret>',
      redirectUri: 'https://api.example.com/auth/google/callback',
    },
  },
});

// 1. Redirect route — start the flow, stash state + verifier (you own this).
const { url, state, verifier } = await pact.getAuthorizationUrl('google');
await session.set('google', { state, verifier });
// …redirect the user agent to `url`…

// 2. Callback route — provider returned ?code=…&state=…
const stashed = await session.get('google');
const profile = await pact.handleCallback('google', {
  code: query.get('code')!,
  verifier: stashed.verifier,
  state: query.get('state') ?? undefined,
  expectedState: stashed.state, // fail-closed CSRF guard
});
// profile.id, profile.email, profile.tokens, …
```

Use `handleCallback` when you want the raw `OAuthProfile`; use
`login(provider, …)` (below) to run the same exchange through the login
pipeline — mapping, events, and `autoIssue`.

## OAuth as a Login Strategy

Because each OAuth instance is a login strategy, `login(provider, params)` runs
the same callback exchange and then feeds the profile through the login
pipeline. `params` is the same `CallbackParams` as `handleCallback` — `code`,
`verifier`, and optionally `state` / `expectedState`.

PACT owns no user records, so **find-or-create is your `map`**:
`map(profile) => Principal | { principal, isNew } | null`. Return
`{ principal, isNew: true }` for a just-provisioned account. Without a `map`,
the default outcome is `{ id: '<instance>:<profile.id>', profile }` with
`isNew: false`.

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({
  bits: { READ: 1n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
  autoIssue: true,
  oauth: {
    google: {
      provider: 'google',
      clientId: '<your-google-client-id>',
      clientSecret: '<your-google-client-secret>',
      redirectUri: 'https://api.example.com/auth/google/callback',
      // Find-or-create against YOUR store; PACT keeps no user data.
      map: async (profile) => {
        const found = await db.findByOAuth(profile.provider, profile.id);
        if (found) return { principal: { id: found.id }, isNew: false };
        const created = await db.createUser({
          email: profile.email,
          name: profile.name,
        });
        return { principal: { id: created.id }, isNew: true };
      },
    },
  },
});

// Callback route — verifier + state from your session (see round-trip above).
const result = await pact.login('google', {
  code: query.get('code')!,
  verifier: stashed.verifier,
  state: query.get('state') ?? undefined,
  expectedState: stashed.state,
});
// result: { principal, isNew, token? } — or null
```

## id_token Verification

Providers with **no userinfo endpoint** — `apple`, and any `oidc` issuer whose
discovery document omits `userinfo_endpoint` — deliver the user's identity
inside the `id_token` from the code→token exchange. PACT verifies that token's
signature against the provider's published JWKS (`https://appleid.apple.com/auth/keys`
for Apple; the discovered `jwks_uri` for `oidc`) before trusting a single
claim.

This is **defense in depth**. The token already arrives over a direct
server-to-server TLS POST, so OIDC Core §3.1.3.7 permits skipping the check;
verifying it anyway removes the token endpoint's response body from the trusted
computing base (a misbehaving proxy, a mis-issued certificate, a redirected
egress path).

### What is checked

- **Signature**, using the algorithm declared by the **JWKS key** — never the
  one asserted by the token header. If the JWK pins `alg`, a header that
  disagrees is rejected; if it doesn't, the header may only choose an
  allow-listed asymmetric algorithm (`RS*`, `PS*`, `ES*`) that the key's
  `kty`/`crv` can actually carry. `HS*` and `none` can never be selected — a
  JWKS key is public, so an HMAC "signature" over it is a forgery by
  construction.

  The cryptography itself is `@tundralibs/crypt`'s `verifyJWT`, which takes the
  JWKS entry as a JWK directly: PACT resolves the key and pins the algorithm,
  crypt validates that key against the operation (family, curve, hash,
  public-vs-private, `use`/`key_ops`/`alg`), binds the primitive to the key's
  shape rather than the header, and checks the signature. A key the provider
  published but crypt will not use is treated exactly like a bad signature —
  fatal — because the key set was reachable, so it is not an outage.
- **`iss`** — Apple's fixed issuer, or (for `oidc`) your _configured_ `issuer`.
  Deliberately not the issuer echoed by the discovery document, which would be
  circular.
- **`aud`** — must contain your `clientId`; with multiple audiences, `azp`
  must be you when present.
- **`exp`** / **`nbf`** — 60s of clock tolerance.
- **`nonce`** — only when you pass `expectedNonce` to the callback, and then
  fail-closed exactly like `expectedState`.

### Failure-mode policy

The two failure kinds are treated very differently, because they mean very
different things:

| Situation                                                                                | Behaviour                                                                 |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Signature mismatch, disallowed/mismatched `alg`, an unusable JWKS key, or a failed claim | **Always rejected** (`OAUTH_IDTOKEN_INVALID`) — no policy downgrades this |
| JWKS unreachable, non-2xx, malformed, or `kid` unresolved after a refresh                | Governed by `idTokenVerification` (below)                                 |

`idTokenVerification` defaults to **`'preferred'`**: an unobtainable key set
degrades to decoding the token, _with the standard claims still validated_,
and emits `idTokenUnverified`. The reasoning:

- A signature mismatch is an **attack**; an unreachable JWKS is an **outage**.
  Conflating them lets a network-level attacker who can merely block one
  endpoint take down every login — a denial-of-service lever they should not
  get for free.
- The fallback is not a regression: it is what shipped before this check
  existed, _plus_ full claim validation. An attacker who blocks the JWKS still
  cannot forge the token, because it came over TLS from the token endpoint.
- Fail-closed would make every login depend on a second network call to the
  provider.

Choose `'required'` when you would rather fail a login than accept an
unverified token (`OAUTH_JWKS_UNAVAILABLE`). Recommended for high-assurance
deployments that can absorb the availability coupling.

```typescript
oauth: {
  apple: {
    provider: 'apple',
    clientId: '<services-id>',
    clientSecret: appleClientSecretJWT,
    redirectUri: 'https://api.example.com/auth/apple/callback',
    idTokenVerification: 'required', // default: 'preferred'
    jwksCacheTtl: 3_600_000,         // default: 1 hour
  },
},
// Alert on downgrades — a signature failure throws and never lands here.
_onidTokenUnverified: (provider, reason) => alerting.warn(provider, reason),
```

### Caching and key rotation

The JWKS is fetched once and cached for `jwksCacheTtl` (default one hour), so
logins do not each incur a key fetch, and concurrent logins coalesce onto a
single request. Providers rotate keys, so a token whose `kid` is not in the
cached set forces one refresh even when the cache is still within its TTL —
rotation is picked up immediately rather than after the TTL expires. Those
forced refreshes are rate-limited to one per 30 seconds so a flood of tokens
carrying made-up `kid`s cannot turn PACT into an amplifier against the
provider's key endpoint. A `kid` that still does not resolve after the refresh
counts as _unavailability_, not forgery: it is indistinguishable from a
mid-rotation token, and a fabricated `kid` cannot produce a valid signature
under any key anyway.

## Provider Notes

**Microsoft (tenant-aware).** The authorize/token endpoints are tenant-scoped.
Set `tenant` for a single-tenant app; it defaults to `common`.

```typescript
oauth: {
  entra: {
    provider: 'microsoft',
    tenant: '<your-tenant-id>', // defaults to 'common'
    clientId: '<client-id>',
    clientSecret: '<client-secret>',
    redirectUri: 'https://api.example.com/auth/ms/callback',
  },
}
```

**Apple.** Apple has no userinfo endpoint — identity comes from the `id_token`
in the (server-to-server, TLS) token response, not a fetch, and its signature
is checked against `https://appleid.apple.com/auth/keys` (see
[id_token Verification](#id_token-verification)). Its `clientSecret` is itself
a short-lived **ES256 JWT** you must mint out-of-band (PACT does not mint
provider client secrets) and pass in. The preset sends `response_mode=form_post`, so the callback
arrives as a POST body.

```typescript
oauth: {
  apple: {
    provider: 'apple',
    clientId: '<services-id>',
    clientSecret: appleClientSecretJWT, // ES256 JWT minted out-of-band
    redirectUri: 'https://api.example.com/auth/apple/callback',
  },
}
```

**OIDC (generic).** Set `issuer`; endpoints — including `jwks_uri` — are
discovered from `<issuer>/.well-known/openid-configuration` (fetched once,
cached). The issuer **must be `https://`** — a missing issuer throws
`MISSING_OPTION` and a non-https issuer throws `INVALID_OPTION` (both
`PactDefinitionError`, at construction). It is also the trust anchor for the
`id_token`'s `iss` when the issuer publishes no userinfo endpoint.

```typescript
oauth: {
  corp: {
    provider: 'oidc',
    issuer: 'https://id.example.com', // https required; discovery endpoint derived
    clientId: '<client-id>',
    clientSecret: '<client-secret>',
    redirectUri: 'https://api.example.com/auth/corp/callback',
  },
}
```

**GitHub.** The primary `email` may be `null` unless the `user:email` scope is
granted (the default scopes include it); GitHub profiles carry no
`emailVerified`.

## Errors

Bad credentials are **not** errors: a strategy (or `map`) that returns `null`
yields a `null` login result and a `loginFailed` event, never a throw.

| Error                 | Code                                | When                                                                                                                                       |
| --------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PactDefinitionError` | `UNKNOWN_STRATEGY`                  | `login` / `getAuthorizationUrl` / `handleCallback` named an instance no strategy or OAuth provider owns                                    |
| `PactDefinitionError` | `UNKNOWN_PROVIDER`                  | an `oauth` entry references an unknown preset (thrown at construction)                                                                     |
| `PactDefinitionError` | `MISSING_OPTION` / `INVALID_OPTION` | an `oidc` instance has no `issuer`, or a non-`https://` one (thrown at construction)                                                       |
| `PactOAuthError`      | `OAUTH_STATE_MISMATCH`              | `expectedState` was supplied and the callback `state` was missing or unequal                                                               |
| `PactOAuthError`      | `OAUTH_EXCHANGE_FAILED`             | the code → token exchange (or OIDC discovery) failed                                                                                       |
| `PactOAuthError`      | `OAUTH_PROFILE_FAILED`              | the userinfo fetch failed, the provider returned no / an undecodable `id_token`, or the normalized profile carried no subject (`id`) claim |
| `PactOAuthError`      | `OAUTH_IDTOKEN_INVALID`             | the `id_token` failed signature, algorithm, or claim (`iss`/`aud`/`exp`/`nbf`/`nonce`) validation                                          |
| `PactOAuthError`      | `OAUTH_JWKS_UNAVAILABLE`            | the JWKS could not be obtained and `idTokenVerification` is `'required'`                                                                   |

Both error types carry a stable `code`; branch on `err.code` rather than
message text.

## Related

- [Tokens](./Pact-Tokens.md) — JWT issue/verify/refresh and HMAC request
  signing (what `autoIssue` mints).
- [Authorization](./Pact-Authorization.md) — bitmask permissions, modules, and
  group-aware checks for the principal you just logged in.

---

[← Back to Pact](../README.md)
