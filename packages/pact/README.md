# Pact

**Permissions, Authentication, Control & Tokens** — a transport-agnostic
**authentication and authorization toolkit** for Deno, Bun, Node, Cloudflare
Workers, and the browser. It covers **RBAC** authorization over unbounded
**BigInt bitmask** permissions; four credential schemes — password (**Basic**,
PBKDF2), **Bearer** sessions, **API keys**, and **HMAC** request signatures;
**JWT** and opaque **sessions** with **refresh-token rotation** and reuse
detection; **TOTP** as a second factor (**MFA / 2FA**); an **OAuth 2.0 /
OpenID Connect** client with **PKCE**, `state`, and JWKS `id_token`
verification; and drop-in **middleware** for express, fastify, oak, and hono.
Identity, credentials, and sessions live behind a flat set of **optional
storage hooks** — plain functions, no adapter, no base class, no schema
ownership — a lighter, bring-your-own-storage alternative to Passport, Lucia,
or better-auth. All cryptography is delegated to
[`@tundralibs/crypt`](../crypt/README.md); OAuth HTTP runs on
[`@tundralibs/restler`](../restler/README.md).

[![JSR](https://jsr.io/badges/@tundralibs/pact)](https://jsr.io/@tundralibs/pact)
[![JSR Score](https://jsr.io/badges/@tundralibs/pact/score)](https://jsr.io/@tundralibs/pact)
![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## The three boundaries

- **Transport belongs to your framework.** pact never parses headers or
  cookies, performs redirects, or owns routes. The framework extracts values
  and passes them in; pact checks and validates. The shipped
  [middleware adapters](middleware/Pact-Middleware.md) do the extraction for
  the common frameworks.
- **Storage belongs to your app.** Users, sessions, and API keys live in your
  database under your schema. pact reaches them through
  [flat optional hooks](docs/Pact-Hooks.md) — implement only what the features
  you enable need. A [suggested table structure](docs/Pact-Storage.md) covers
  every capability if you'd rather not design the schema yourself.
- **Crypto belongs to crypt.** Password hashing (salted PBKDF2), JWTs, HMAC,
  TOTP, sha-256 — pact orchestrates, crypt computes.

## Documentation

| Topic                                       | Description                                                                |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| [Hooks](docs/Pact-Hooks.md)                 | The storage seam — stored shapes, every hook, what each feature needs      |
| [Storage](docs/Pact-Storage.md)             | A suggested table structure covering every pact capability                 |
| [Sessions](docs/Pact-Sessions.md)           | Opaque vs JWT, refresh rotation, reuse detection, cache-only mode          |
| [OAuth](docs/Pact-OAuth.md)                 | Provider presets, PKCE/state/nonce, JIT provisioning, id_token policy      |
| [Caching](docs/Pact-Caching.md)             | Opt-in caches, the instance name, TTLs, invalidation                       |
| [Security](docs/Pact-Security.md)           | The error contract, enumeration resistance, bound principals, threat notes |
| [Middleware](middleware/Pact-Middleware.md) | express / fastify / oak / hono adapters and the neutral core               |
| [Roadmap](docs/Pact-Roadmap.md)             | Known limitations and planned work                                         |

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
import { Pact } from '@tundralibs/pact';
import type { PactStoredSession, PactStoredUser } from '@tundralibs/pact/types';

// ── your app's own data layer (any database, any schema) ────────────
declare const db: {
  users: {
    byEmail(email: string): Promise<PactStoredUser | null>;
    byId(id: string): Promise<PactStoredUser | null>;
    insert(draft: unknown): Promise<PactStoredUser>;
  };
  sessions: {
    insert(s: PactStoredSession): Promise<void>;
    get(id: string): Promise<PactStoredSession | null>;
    del(id: string): Promise<void>;
  };
};

const pact = Pact.create({
  // Authorization: atomic permission bits and per-module ceilings.
  // Modules are derived from the modulePermissions keys.
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n },
  modulePermissions: {
    Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'],
    Billing: ['READ'],
  },
  // The storage seam: flat, optional, promise-friendly functions.
  hooks: {
    getUser: (q) =>
      q.by === 'ID'
        ? db.users.byId(q.id)
        : q.by === 'IDENTIFIER'
        ? db.users.byEmail(q.identifier)
        : Promise.resolve(null),
    createUser: (draft) => db.users.insert(draft),
    saveSession: (s) => db.sessions.insert(s),
    getSession: (id) => db.sessions.get(id),
    deleteSession: (id) => db.sessions.del(id),
  },
});

// ── register → login → authenticate → authorize ─────────────────────
await pact.register({
  identifier: 'a@x.io',
  password: 'hunter2!hunter2!',
  grants: { Post: 1n | 2n }, // READ | EDIT
});
const login = await pact.login({
  identifier: 'a@x.io',
  password: 'hunter2!hunter2!',
}); // throws typed errors on failure — never returns null

const ctx = await pact.authenticate({
  scheme: 'BEARER',
  token: login.session.token,
});
// The bound principal checks against already-resolved grants: no
// store round-trip per check.
await ctx.principal.assert('Post', 'EDIT');
const canPublish = await ctx.principal.hasPermission('Post', 'PUBLISH');

// Or by id, from anywhere:
await pact.hasPermission('user-42', 'Billing', 'READ'); // boolean
await pact.logout(login.session.token);
console.log(canPublish);
```

Failure semantics are part of the contract: authentication failures throw
typed `PactError`s with stable codes (map `PACT_AUTH_FAILURE_CODES` to 401),
authorization answers are booleans, and `assert` throws `PERMISSION_DENIED`.
See [Security](docs/Pact-Security.md).

## Middleware

The `./middleware` subpaths ship the transport half for the common
frameworks: an authentication handler that extracts the credential, calls
`authenticate`, and attaches the context, plus a per-route permission guard.

```typescript
import { Pact } from '@tundralibs/pact';
import { oakAuth, oakGuard } from '@tundralibs/pact/middleware/oak';

declare const pact: Pact<{ READ: 1n }, 'Projects'>;
declare const router: {
  get: (path: string, ...handlers: unknown[]) => void;
};

router.get('/projects', oakAuth(pact), oakGuard('Projects', 'READ'), () => {
  // ctx.state.pact.principal is the authenticated, bound principal
});
```

`expressAuth`/`expressGuard`, `fastifyAuth`/`fastifyGuard`, and
`honoAuth`/`honoGuard` follow the same shape, and the neutral core makes an
adapter for any other stack a few lines. See
[Middleware](middleware/Pact-Middleware.md).

## Highlights

- **Four credential schemes** through one `authenticate()` — `BASIC`
  (identifier + password), `BEARER` (session token, opaque or JWT), `APIKEY`
  (key id + presented secret), `HMAC` (request signature; the secret never
  travels). Junk input collapses to a 401, never a crash.
- **Bound principals** — `authenticate` and `principalOf(id)` return a
  principal whose `hasPermission`/`assert` evaluate in memory, re-resolving
  only when stale or after a revocation call. Hand-built objects have no
  working methods, and the capability does not survive serialization. See
  [Security](docs/Pact-Security.md).
- **A login seam you can compose** — `verifyCredentials` proves identity
  (and reports MFA enrollment), `createSession` mints by id; `login` is the
  two glued together. MFA-gated logins, magic links, and impersonation are
  app flows, not framework features.
- **Two session strategies, one surface** — store-backed `OPAQUE` (instantly
  revocable) or `JWT` with a rotating refresh family: every refresh bumps a
  generation, a `grace` window absorbs concurrent refreshes, and replaying a
  stale token revokes the whole family and fires `refreshReused`. See
  [Sessions](docs/Pact-Sessions.md).
- **Bitmask authorization** — module × permission over unbounded BigInt
  masks. Definition typos throw at construction; per-request junk fails
  closed. Grants serialize through a prototype-pollution-safe codec.
- **OAuth as helpers, not a framework** — `oauthRedirect()` (URL, state,
  PKCE verifier, nonce) and `oauthLogin()` feeding the standard session
  pipeline. Seven presets plus generic OIDC discovery; inbound `id_token`s
  are JWKS-verified with the algorithm pinned to the key. See
  [OAuth](docs/Pact-OAuth.md).
- **Opt-in caching with a named namespace** — no config means every check
  hits your hooks; per-type TTLs opt in, and the instance `name` keys the
  cache namespace so two apps on one Redis can never read each other's
  grants. See [Caching](docs/Pact-Caching.md).
- **TOTP as plain secondary verification** — `generateMFASecret()` /
  `generateMFAAuthURL()` for enrollment, `verifyMFA()` to check; the app
  decides when to demand the second step.
- **Content signing** — `sign()` / `verifySignature()` for webhook payloads
  and signed URLs, keyed by an HKDF-derived, JWT-domain-separated secret or
  your own explicit key.
- **Events everywhere** — `login`, `loginFailed`, `logout`,
  `authenticateFailed`, `refreshReused`, `idTokenUnverified` via `.on()` or
  `_on<event>` options. Listener faults never alter an outcome.

## Sub-paths

| Import                                | Contents                                                 |
| ------------------------------------- | -------------------------------------------------------- |
| `@tundralibs/pact`                    | `Pact`, the grants codec, errors, all types              |
| `@tundralibs/pact/middleware`         | The neutral core + every framework adapter               |
| `@tundralibs/pact/middleware/express` | express adapter only (same for `fastify`, `oak`, `hono`) |
| `@tundralibs/pact/types`              | The type surface                                         |
| `@tundralibs/pact/errors`             | `PactError`, codes, `PACT_AUTH_FAILURE_CODES`            |

## Examples

Two runnable mini-apps live in `packages/pact/examples/`, each with its own
README and per-runtime run commands:

- **orbit** — a project-management API on oak exercising the whole surface:
  register/activate, login/logout/refresh (JWT strategy), password reset,
  API keys, HMAC, MFA, per-route authorization, and the audit-trail events.
- **oauth-signin** — "Sign in with Google/GitHub" end to end: redirect with
  PKCE and state, callback exchange, JIT provisioning, and the shipped oak
  middleware. Bring your own provider credentials via env variables.

## What pact deliberately does not do

Header/cookie parsing, redirects, routes, CSRF, and every other transport
concern (the framework's — though the [middleware](middleware/Pact-Middleware.md)
covers the common cases); user/session storage (yours, via hooks — no schema,
no adapters, no migrations); account-management flows (email verification,
password-reset delivery); per-instance authorization ("edit this post" is app
logic); group/role membership resolution (compose effective grants in your
`getUser`).

See the [Roadmap](docs/Pact-Roadmap.md) for known limitations and planned
work.

## License

MIT
