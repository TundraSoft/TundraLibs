# Pact

A **transport-agnostic authentication & authorization toolkit**.
Authorization is **BigInt bitmask** permissions; identity, credentials, and
sessions run over a flat set of **optional storage hooks** — plain
functions, no adapter, no base class, no schema ownership. All
cryptography is delegated to
[`@tundralibs/crypt`](../crypt/README.md); OAuth HTTP runs on
[`@tundralibs/restler`](../restler/README.md).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## The three boundaries

- **Transport belongs to your framework.** pact never parses headers or
  cookies, performs redirects, or owns routes. The framework extracts
  values (splits `Authorization`, decodes Basic, holds OAuth `state`) and
  passes them in; pact checks and validates.
- **Storage belongs to your app.** Users, sessions, api keys live in YOUR
  database under YOUR schema. pact reaches them through
  [flat optional hooks](docs/Pact-Hooks.md) — implement only what the
  features you enable need (an authorization-only pact needs zero hooks;
  password + stateless JWT needs one).
- **Crypto belongs to crypt.** Password hashing (salted PBKDF2), JWTs,
  HMAC, TOTP, sha-256 — pact orchestrates, crypt computes. Your hooks
  only ever see opaque hash strings.

## Documentation

| Topic                                         | Description                                                            |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| [Hooks](docs/Pact-Hooks.md)                   | The storage seam — stored shapes, every hook, the requiredness table   |
| [Authentication](docs/Pact-Authentication.md) | `authenticate` schemes, `login` methods, registration, TOTP            |
| [Sessions](docs/Pact-Sessions.md)             | JWT vs opaque, refresh-token rotation, reuse detection, logout         |
| [Authorization](docs/Pact-Authorization.md)   | Bitmask permissions — `can`/`assert`, mask math, the `./authz` subpath |
| [OAuth](docs/Pact-OAuth.md)                   | Provider presets, PKCE/state/nonce, declared claims, id_token policy   |
| [Errors & Events](docs/Pact-Errors.md)        | Error classes, stable codes, and the event map                         |

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
    byOAuth(provider: string, subject: string): Promise<PactStoredUser | null>;
    insert(draft: unknown): Promise<PactStoredUser>;
  };
  sessions: {
    upsert(s: PactStoredSession): Promise<void>;
    get(id: string): Promise<PactStoredSession | null>;
    del(id: string): Promise<void>;
  };
};

const pact = new Pact({
  // authorization: module × action over BigInt masks
  bits: { READ: 1n, EDIT: 2n, DELETE: 4n, PUBLISH: 8n },
  modules: { Post: ['READ', 'EDIT', 'DELETE', 'PUBLISH'], Billing: ['READ'] },
  // tokens: configured once, delegated to @tundralibs/crypt
  secret: 'a-256-bit-shared-secret-for-hs256!', // load from your env store
  issuer: 'api.example.com',
  // login methods (each optional; enabling one gates its hooks)
  password: true,
  // sessions: short access token + rotating refresh family
  session: { ttl: 900, refresh: {} },
  // the storage seam: flat, optional, promise-returning functions
  hooks: {
    getUser: (q) =>
      q.by === 'ID'
        ? db.users.byId(q.id)
        : q.by === 'IDENTIFIER'
        ? db.users.byEmail(q.identifier)
        : db.users.byOAuth(q.provider, q.subject),
    createUser: (draft) => db.users.insert(draft),
    saveSession: (s) => db.sessions.upsert(s),
    getSession: (id) => db.sessions.get(id),
    deleteSession: (id) => db.sessions.del(id),
  },
});

// ── register → login → verify → authorize ───────────────────────────
await pact.register({ identifier: 'a@x.io', password: 'hunter2!hunter2!' });
const login = await pact.login('password', {
  identifier: 'a@x.io',
  password: 'hunter2!hunter2!',
}); // { principal, token, refreshToken, expiresAt } | null

const principal = await pact.verify(login!.token); // Principal | null
pact.can(principal, 'EDIT', 'Post'); // boolean
pact.assert(principal, 'DELETE', 'Post'); // throws PactDeniedError

// rotate the session without re-authenticating
const next = await pact.refresh(login!.refreshToken!);
await pact.logout(next!.token);
```

## The two middlewares

pact slots into any `(ctx, next)` framework as two seams — extraction is
the framework's job, checking is pact's:

```typescript
import { Pact, PactDeniedError } from '@tundralibs/pact';

declare const pact: Pact;
type Ctx = {
  req: { headers: Headers };
  principal?: unknown;
  status?: number;
};
type Next = () => Promise<void>;

// middleware 1 — authenticate: extracted credential → principal
export const authenticate = async (ctx: Ctx, next: Next): Promise<void> => {
  const header = ctx.req.headers.get('authorization') ?? '';
  const space = header.indexOf(' ');
  const [scheme, value] = space === -1
    ? [header, '']
    : [header.slice(0, space), header.slice(space + 1)];
  ctx.principal = scheme === 'Bearer' && value !== ''
    ? await pact.authenticate({ scheme: 'BEARER', token: value })
    : null;
  await next();
};

// middleware 2 — authorize: principal → allow / deny
export const canEditPost = async (ctx: Ctx, next: Next): Promise<void> => {
  try {
    pact.assert(
      (ctx.principal ?? null) as Parameters<typeof pact.assert>[0],
      'EDIT',
      'Post',
    );
  } catch (error) {
    if (error instanceof PactDeniedError) {
      ctx.status = 403;
      return;
    }
    throw error;
  }
  await next();
};
```

## Highlights

- **Five credential schemes** through one `authenticate()` —
  `BASIC` (identifier+password), `BEARER` (pact-issued session token),
  `TOKEN` (simple static token, stored by hash), `APIKEY` (key id +
  presented secret), `HMAC` (request signature; the secret never travels).
  See [Authentication](docs/Pact-Authentication.md).
- **Refresh-token rotation with reuse detection** — every refresh bumps a
  family generation; replaying a stale token revokes the whole family and
  fires the `refreshReuse` event. A `grace` window absorbs legitimate
  concurrent refreshes. See [Sessions](docs/Pact-Sessions.md).
- **Bitmask authorization** — `module × action` over unbounded BigInt
  masks, module-catalog validation that turns typos into thrown config
  errors, and a dependency-free `./authz` subpath that runs in the
  browser. See [Authorization](docs/Pact-Authorization.md).
- **OAuth as helpers, not a framework** — `oauthRedirect()` (URL, state,
  PKCE verifier, nonce) and callback verification feeding the standard
  login pipeline. Six presets + generic `OIDC` discovery; declared claims are
  requested AND extracted (sanitized, fail-soft). Inbound `id_token`s are
  JWKS-verified with the algorithm pinned to the key.
  See [OAuth](docs/Pact-OAuth.md).
- **TOTP as plain secondary verification** — `enrollOtp()` (seed +
  otpauth URL) and `verifyOtp()`; the app decides when to demand the
  second step. No login state machine.
- **Events everywhere** — `register`, `login`/`loginFailed`,
  `verifyFailed`, `denied`, `refreshReuse`, `logout`,
  `idTokenUnverified`, via `_on<Event>` options or `.on()`. Listener
  faults are isolated by the hardened `Events` base — an audit hook can
  never alter an outcome. See [Errors & Events](docs/Pact-Errors.md).

## Sub-paths

| Import                    | Contents                                                   |
| ------------------------- | ---------------------------------------------------------- |
| `@tundralibs/pact`        | `Pact`, `Permissions`, grants codec, errors, all types     |
| `@tundralibs/pact/authz`  | Dependency-free authorization core (browser-safe)          |
| `@tundralibs/pact/oauth`  | `OAuthClient`, `IdTokenVerifier`, `PROVIDERS` (standalone) |
| `@tundralibs/pact/types`  | The type surface                                           |
| `@tundralibs/pact/errors` | Error classes + codes                                      |

## What pact deliberately does NOT do

Header/cookie parsing, redirects, routes, CSRF, and every other transport
concern (the framework's); user/session **storage** (yours, via hooks —
no schema, no adapters, no migrations); account management flows (email
verification, password-reset delivery); per-instance / attribute
authorization ("edit **this** post" is app logic); group/role membership
resolution (compose effective grants in your `getUser` — the mask algebra
in `./authz` makes it a one-liner).

See [ROADMAP.md](./ROADMAP.md) for known limitations and planned work.

## License

MIT
