# Pact

A barebones **authentication & authorization kernel**. Permissions are
**BigInt bitmasks** scoped by module; tokens (JWT + HMAC) are delegated to
[`@tundralibs/crypt`](../crypt/README.md); identity data stays **yours** —
PACT owns no user, group, or session storage. You plug in hooks (a group
resolver, a revocation check, login strategies) and PACT evaluates,
orchestrates, and emits events.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

Built on `crypt`'s Web Crypto primitives and a `fetch`-based OAuth
client, with no filesystem or process assumptions of its own — runs
unchanged on Workers and in the browser.

## Overview

PACT is a **kernel**, not a framework. It owns two things — evaluating
bitmask permissions and orchestrating tokens — and delegates everything
else:

- **Authorization** is coarse-grained `module × action` over unbounded
  BigInt masks. Per-instance / ownership / attribute rules ("edit _this_
  post") are app logic, not PACT.
- **Crypto** (JWT, HMAC, hashing, key derivation) is 100%
  [`@tundralibs/crypt`](../crypt/README.md). PACT just holds the
  secret/algorithm once and binds permissions into tokens.
- **Data** (users, groups, sessions, revocation lists) is yours — supplied
  through hooks. There is no schema, adapter, or migration.

## Documentation

| Topic                                       | Description                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------- |
| [Authorization](docs/Pact-Authorization.md) | BigInt bitmask permissions — modules, grants, `can`/`assert`, mask math |
| [Groups](docs/Pact-Groups.md)               | Group-resolver hook, cache + sync, OR semantics, grants wire codec      |
| [Tokens](docs/Pact-Tokens.md)               | JWT issue/verify/refresh + HMAC request signing (via crypt)             |
| [API Keys](docs/Pact-ApiKeys.md)            | Self-contained key/secret minting + constant-time verify                |
| [Login & OAuth](docs/Pact-OAuth.md)         | Credential strategies + an in-house OAuth2/PKCE client (7 providers)    |
| [Errors & Events](docs/Pact-Errors.md)      | Error classes, stable codes, and the event map                          |

## Installation

**Deno:**

```bash
deno add @tundralibs/pact
```

**Bun:**

```bash
bunx jsr add @tundralibs/pact
```

**Node.js:**

```bash
npx jsr add @tundralibs/pact
```

## Quick Start

```typescript
import { PACT, serializeGrants } from '@tundralibs/pact';
import type { PACTGrants, PACTLoginOutcome } from '@tundralibs/pact/types';

// ── your app's own data layer and helpers ────────────────────────────
declare const myDb: {
  grantsForGroups(ids: string[]): Promise<Record<string, PACTGrants>>;
};
declare const blocklist: Set<string>;
declare const verifyPassword: (creds: unknown) => Promise<PACTLoginOutcome>;
declare const audit: (event: string, ...rest: unknown[]) => void;
declare const user: { id: string; groupIds: string[] };
declare const presented: string;
declare const stored: { secretHash: string };

const pact = new PACT({
  // authorization: the breadth of permissions, and where they apply
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n },
  modules: {
    Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'],
    Billing: ['READ'],
  },
  // groups: PACT resolves + caches; you own the data
  groupResolver: async (ids) => await myDb.grantsForGroups(ids),
  // tokens: configured once, delegated to @tundralibs/crypt
  secret: 'a-256-bit-shared-secret-for-hs256!', // load from your env store
  issuer: 'api.example.com',
  expiry: 3600,
  isRevoked: (claims) => blocklist.has(String(claims.jti)),
  // login: your credential check; PACT orchestrates + auto-issues
  strategies: {
    password: async (creds) => await verifyPassword(creds), // Principal | null
  },
  autoIssue: true,
  // observe everything
  _ondenied: (module, permission) => audit('denied', module, permission),
});

// ── authorize ────────────────────────────────────────────────────────
const grants = await pact.grantsForGroups(user.groupIds);
pact.can('Post', 'EDIT', grants); // boolean
pact.assert('Post', 'DELETE', grants); // throws PactDeniedError

// ── login → token → verify ──────────────────────────────────────────
const session = await pact.login('password', { user: 'a', pass: 'b' });
// session: { principal, isNew, token } — or null for bad credentials
const claims = await pact.verifyJWT(session!.token!);

// embed grants in a token (BigInt masks travel as strings)
const token = await pact.generateJWT({
  sub: user.id,
  grants: serializeGrants(grants),
});

// ── OAuth (built-in strategies) ──────────────────────────────────────
// const { url, state, verifier } = await pact.getAuthorizationUrl('google');
// …redirect, then in the callback route:
// const result = await pact.login('google', { code, verifier });

// ── API keys ─────────────────────────────────────────────────────────
const key = await pact.generateAPIKey({ prefix: 'acme' });
// persist key.id + key.secretHash; show key.secret once
await pact.verifyAPIKey(presented, stored.secretHash); // boolean
```

## Highlights

- **Bitmask authorization** — `module × action` checks over unbounded
  BigInt masks (`can` / `canAny` / `canAll` / `assert`), mask math, and an
  optional module catalog that turns typos into thrown errors. See
  [Authorization](docs/Pact-Authorization.md).
- **Groups without group management** — a `groupResolver` hook feeds a
  cache that ORs a principal's group grants and re-syncs on demand or on a
  timer. See [Groups](docs/Pact-Groups.md).
- **Tokens via crypt** — JWT issue/verify/refresh with the algorithm
  pinned (HS\*/RS\*), `iss`/`aud` enforcement, a verify-time `isRevoked`
  seam, plus HMAC request signing (HKDF-domain-separated from the JWT
  key). See [Tokens](docs/Pact-Tokens.md).
- **Self-contained API keys** — mint `_ak_`/`_sk_` pairs; store only the
  hash; verify in constant time. See [API Keys](docs/Pact-ApiKeys.md).
- **Login seam + OAuth** — named credential strategies plus an in-house
  OAuth2 auth-code + PKCE client with 7 provider presets, zero external
  dependencies. Providers with no userinfo endpoint (Apple, bare `oidc`)
  get their `id_token` signature-checked against the provider's JWKS —
  cached, rotation-aware, algorithm pinned to the key.
  See [Login & OAuth](docs/Pact-OAuth.md).
- **Events everywhere** — `granted`/`denied`, `issue`/`verify`/
  `verifyFailed`/`refresh`/`revoked` (a successful refresh also fires
  `verify`), `sync`/`syncFailed`, `login`/`loginFailed`,
  `idTokenUnverified`, via `_on<Event>` options or `.on()`.
  Listener exceptions are isolated on PACT's own emits — a throwing **or
  async-rejecting** audit hook can't flip a valid `verify`/`login`/`refresh`
  into a failure, replace the typed error on `verifyFailed`/`loginFailed`, or
  escape as an unhandled rejection. Listeners are otherwise untouched: an
  `_on<Event>` option that is not a function (an unset optional hook) is
  ignored instead of registered, and `emitSync()` still awaits listeners in
  turn and surfaces their rejections to its caller.
  See [Errors & Events](docs/Pact-Errors.md).

## Observability

Every decision fires an event, and PACT imports no logging or tracing
package — the `_on<Event>` hooks are the integration seam, wired at your
composition root. Two one-liners make the audit trail _correlated_ in
request-scoped apps:

- After a successful `verify`/`login`, put the principal on the request
  bag — `ambient.set('userId', principal)` — and every subsequent log line
  in that request carries it ([ambient](../ambient/README.md)).
- Give slogger a `contextProvider` so ids arrive on every record
  automatically — the request bag plus live trace identity via
  `tracer.logContext`. See
  [Slogger-Correlation](../slogger/docs/Slogger-Correlation.md).

With both in place, a `denied` event logged from an audit hook already
carries `correlationId`, `userId`, and the active trace — no argument
threading through your auth code.

## Planned hardening (not yet shipped)

Two OIDC/token security-posture items are designed but deliberately deferred —
PACT is safe within its current scope; these extend it. See
[ROADMAP.md](./ROADMAP.md) for the full list.

- **OIDC `nonce` generation.** The callback validates `nonce` fail-closed once
  you pass `expectedNonce`, but `getAuthorizationUrl` does not yet _generate_ or
  thread one for you the way it does `state` and the PKCE verifier. Until it
  does, generate and store the `nonce` yourself (via `params`) to get `id_token`
  replay protection.
- **JWKS in `verifyJWT`.** Inbound provider `id_token`s are already fully
  JWKS-verified (fetch/cache the `jwks_uri`, select by `kid`, algorithm pinned to
  the key), but the general-purpose `verifyJWT` still uses the single configured
  key — verifying external-IdP access tokens by `kid`, and `kid`-based key
  rotation of PACT's own tokens, are not yet wired.

## What PACT deliberately does NOT do

User/group/session **storage** (no schema, no adapters, no migrations);
account management (signup, email verification, password reset); cookies,
CSRF, and transport; per-instance / attribute / relationship authorization
("edit **this** post" is app logic); admin tooling; MFA.

See the topic guides under [Documentation](#documentation) for the full design,
and [ROADMAP.md](./ROADMAP.md) for planned hardening and deferred work.

## License

MIT
