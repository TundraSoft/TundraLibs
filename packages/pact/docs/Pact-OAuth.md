# OAuth

Two calls, no framework: `oauthRedirect(name)` builds the authorization
URL (with `state`, PKCE, and a nonce where OIDC applies) and
`oauthLogin(name, params, expected)` verifies the callback, normalizes the
profile, resolves or provisions the user, and mints a session through the
standard pipeline. The app owns routes, redirects, and stashing the
`expected` material between the two calls.

## Table of Contents

- [Configuration](#configuration)
- [Presets](#presets)
- [The flow](#the-flow)
- [Provisioning and linking](#provisioning-and-linking)
- [id_token verification](#id_token-verification)

## Configuration

`options.oauth` is a record of instance name → provider config; the name is
the login-method label, and several instances of one kind can coexist.
Configs are schema-validated at construction (`INVALID_OPTION` on the
first bad field), and each instance builds its client eagerly — a typo
fails at boot, not at first login.

```typescript
import { Pact } from '@tundralibs/pact';

const pact = Pact.create({
  bits: { READ: 1n },
  modulePermissions: { Post: ['READ'] },
  hooks: {},
  options: {
    oauth: {
      google: {
        kind: 'GOOGLE',
        clientId: 'xxx.apps.googleusercontent.com',
        clientSecret: 'secret', // omit for a public client (PKCE-only)
        redirectUri: 'https://app.example.com/auth/google/callback',
        autoProvision: true,
      },
      sso: {
        kind: 'OIDC',
        issuer: 'https://login.example.org', // discovery + id_token anchor
        clientId: 'app',
        redirectUri: 'https://app.example.com/auth/sso/callback',
      },
    },
  },
});
```

## Presets

| Kind        | Notes                                                          |
| ----------- | -------------------------------------------------------------- |
| `GOOGLE`    | OIDC; nonce + id_token verification                            |
| `GITHUB`    | Plain OAuth2; profile from the userinfo API                    |
| `MICROSOFT` | Tenant-scoped endpoints — `tenant` option, default `common`    |
| `APPLE`     | Identity from the id_token; `response_mode=form_post` callback |
| `DISCORD`   | Plain OAuth2                                                   |
| `FACEBOOK`  | Plain OAuth2                                                   |
| `OIDC`      | Generic: endpoint discovery from `issuer`                      |

`scopes` overrides a preset's defaults; `authParams` adds authorization-URL
extras but can never override the generated `state`, PKCE, nonce, or
`redirect_uri`.

## The flow

```ts ignore
// 1. Start: build the URL, stash the secrets, redirect.
router.get('/auth/:name', async (ctx) => {
  const r = await pact.oauthRedirect(ctx.params.name);
  await stash(r.state, r); // cookie or server-side store: state, codeVerifier, nonce
  ctx.response.redirect(r.url);
});

// 2. Callback: verify state, exchange, resolve, mint.
router.get('/auth/:name/callback', async (ctx) => {
  const q = ctx.request.url.searchParams;
  const expected = await unstash(q.get('state') ?? '');
  const result = await pact.oauthLogin(ctx.params.name, {
    code: q.get('code') ?? '',
    state: q.get('state') ?? '',
  }, expected);
  // result: { principal, session: { token, ... }, profile }
});
```

pact holds no state between the calls; `expected` is the app's stash. A
state mismatch throws `OAUTH_STATE_MISMATCH` before any network exchange.
Exchange and userinfo responses are schema-checked; failures map to
`OAUTH_EXCHANGE_FAILED`. The runnable
[oauth-signin example](../examples/oauth-signin/README.md) is this flow end
to end against real Google/GitHub apps.

## Provisioning and linking

`oauthLogin` resolves the user by the link (`getUser({ by: 'OAUTH',
provider, subject })`). When no link exists:

- Without `autoProvision`: `OAUTH_UNLINKED`. Linking a provider to an
  existing signed-in account is an explicit app flow, not a login side
  effect.
- With `autoProvision`: `createUser` runs with the link and normalized
  profile. The provider email becomes the identifier only when the
  provider vouches for it (`email_verified`); otherwise the identifier is
  `provider:subject`. Either way an existing user with that identifier
  makes provisioning throw `USER_EXISTS` — a first OAuth login can never
  claim an established local account.

JIT-provisioned users get empty grants in the `createUser` input; seeding
defaults is the hook's decision.

## id_token verification

Where a preset carries an id_token, its signature is verified against the
provider's JWKS with the algorithm taken from the matched key, never from
the token header. The `idToken` option sets the availability policy:
`'PREFERRED'` (default) degrades to claim-validated decoding when the key
set is unreachable, emitting the `idTokenUnverified` event; `'REQUIRED'`
fails the login instead. Signature and claim failures are fatal under both
policies, and the OIDC nonce is enforced wherever an id_token is present.

---

[← Back to Pact](../README.md)
