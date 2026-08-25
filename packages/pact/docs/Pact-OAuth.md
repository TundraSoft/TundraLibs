# OAuth — helpers, not a framework

pact's OAuth is two helpers feeding the standard login pipeline:

1. **`oauthRedirect(instance)`** — builds the authorization URL and
   generates the `state` (CSRF), PKCE `verifier`, and OIDC `nonce` the
   app must hold until the callback.
2. **`login(instance, callbackParams)`** — verifies the callback (state
   check, code exchange, profile/id_token verification), maps the
   federated identity through `getUser({ by: 'OAUTH' })` /
   `createUser`, and mints a normal pact session.

No redirects are performed, no cookies set, no state held — the
transport boundary applies to OAuth like everything else.

## Configuration

Every key of the `oauth` option is an **instance** (and a login method);
the `provider` field picks the preset. Multiple instances of the same
kind are fine (`googleWeb`, `googleMobile`).

```typescript
import { Pact } from '@tundralibs/pact';
import type { PactStoredUser } from '@tundralibs/pact/types';

declare const db: {
  byOAuth(provider: string, subject: string): Promise<PactStoredUser | null>;
  insert(draft: unknown): Promise<PactStoredUser>;
  byId(id: string): Promise<PactStoredUser | null>;
};

const pact = Pact.create({
  bits: { READ: 1n },
  secret: 'a-256-bit-shared-secret-for-hs256!',
  oauth: {
    google: {
      provider: 'GOOGLE',
      clientId: 'cid',
      clientSecret: 'cs',
      redirectUri: 'https://app.example.com/cb',
      claims: { birthdate: { from: 'birthdate', type: 'DATE' } },
    },
    okta: {
      provider: 'OIDC', // generic: endpoints via issuer discovery
      issuer: 'https://acme.okta.com',
      clientId: 'cid2',
      redirectUri: 'https://app.example.com/cb2',
    },
  },
  hooks: {
    getUser: (q) =>
      q.by === 'OAUTH' ? db.byOAuth(q.provider, q.subject) : db.byId(
        q.by === 'ID' ? q.id : '',
      ),
    createUser: (draft) => db.insert(draft),
  },
});

// start: hold state/verifier/nonce (session/cookie — the app's job)
const { url, state, verifier, nonce } = await pact.oauthRedirect('google');

// finish (in the callback route):
declare const cb: { code: string; state?: string };
const result = await pact.login('google', {
  code: cb.code,
  verifier,
  state: cb.state,
  expectedState: state, // fail-closed CSRF guard once supplied
  expectedNonce: nonce, // fail-closed id_token replay guard
});
result?.profile; // the FRESH verified profile — on EVERY login
```

**`state`, PKCE, and `nonce` are not optional for browser flows.** Omitting
`expectedState` disables CSRF protection (an attacker completes _their_ login
in the victim's browser); dropping the PKCE `verifier` loses code-interception
protection; omitting `expectedNonce` (OIDC) disables id_token replay
protection. Supply all three for any user-facing flow. They are also
**single-use, per-session** secrets: persist `state`/`verifier`/`nonce` bound
to _this_ user's session (a signed cookie or a short-lived record keyed to the
session — never a shared/global variable), and delete them the instant the
callback consumes them.

**The redirect URI must match exactly.** `redirectUri` has to be identical to
the value registered at the provider — exact scheme, host, port, and path, no
wildcards — and should point at an origin you control. A loose or
attacker-influenced redirect target is how authorization codes get stolen.

## Presets

`GOOGLE`, `GITHUB`, `MICROSOFT` (tenant-scoped, default `common`),
`DISCORD`, `FACEBOOK`, `APPLE`, and generic `OIDC` (endpoints + `jwks_uri`
discovered from `<issuer>/.well-known/openid-configuration`; the issuer
must be `https` — it is the id_token trust anchor). The preset list stays
deliberately small: `OIDC` covers most modern IdPs
(Okta/Auth0/Keycloak/Entra); truly nonstandard providers fit the
`strategies` escape hatch.

**Apple**: no userinfo endpoint — identity comes from the `id_token`
(JWKS-verified, below); requires `response_mode=form_post` (preset sets
it); its client "secret" is an ES256 JWT you mint out-of-band.

## Declared claims (dynamic data like DOB)

Providers return scope-dependent claims — `birthdate` exists only if you
asked and the user consented. Declare what you want once:

- the names are merged into the OIDC `claims` request parameter (on
  OIDC-speaking presets), and
- on callback the values are extracted from the raw payload into
  `profile.claims`, sanitized by a deliberately **closed** cast set —
  `'STRING'` (trimmed) | `'NUMBER'` | `'BOOLEAN'` | `'DATE'` — fail-soft:
  a missing or uncastable claim is simply absent.

`profile.raw` always carries the complete payload, and the fresh profile
rides `result.profile` on **every** OAuth login (not just the first), so
apps can sync updated claims. Richer validation belongs to
`@tundralibs/guardian` at the app boundary — pact will not grow a DSL.

**Trust boundary.** `profile.claims` and `profile.raw` are values the
_provider asserted_; pact casts their type but does not vouch for their truth.
Treat everything outside the id_token's signed, verified core (and
`emailVerified`) as untrusted input — do not authorize on, or link accounts
by, a raw claim like `email` or `groups` unless the provider verified it. That
untrusted-by-default stance is exactly why OAuth first-login linking is left to
your policy (see [Hooks](Pact-Hooks.md)).

## id_token verification

Where identity comes from an `id_token` (Apple, userinfo-less `OIDC`
issuers), pact verifies its signature against the provider's **JWKS**:
keys cached with TTL, refreshed on unknown-`kid` (rate-limited), and the
algorithm pinned to **the key** — never the token header — with `HS*`
and `none` structurally excluded (algorithm-confusion hardening). Claims
(`iss`, `aud`, `exp` mandatory, `nbf`, `azp`, `nonce`) are validated on
every path.

`idTokenVerification` policy per instance:

- `'PREFERRED'` (default) — an **unobtainable** key set degrades to
  claim-validated decoding and fires the `idTokenUnverified` event
  (alert on it). A bad signature or claim is ALWAYS fatal.
- `'REQUIRED'` — an unobtainable key set fails the login
  (`OAUTH_JWKS_UNAVAILABLE`).

Prefer `'REQUIRED'` whenever the `id_token` is the _sole_ proof of identity
(Apple, any userinfo-less `OIDC` issuer): under `'PREFERRED'`, an attacker who
can block your server's JWKS fetch downgrades verification to decode-only, so
the one signature that matters goes unchecked. Reserve `'PREFERRED'` for flows
where a second, independently-verified source (a userinfo call) backs the
identity up.

## Standalone use

`@tundralibs/pact/oauth` exports `OAuthClient`, `IdTokenVerifier`, and
the `PROVIDERS` presets for use without the engine — the client returns
verified, normalized profiles and leaves everything else to you.
