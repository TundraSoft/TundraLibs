# Authentication & authorization

Rapid owns two things here: the auth bag and the `access` string. An
application **binds** an auth platform once — `app.auth({ authenticate,
authorize })` — and rapid runs `authenticate` once per request, job run or
module `invoke()`, sets `ctx.auth` from the answer, and hands every `access`
string a route, socket command, job or module method declares to
`authorize`. Rapid never parses an identity or an access string: both belong
to the binding. The `@tundralibs/pact` adapter ships one; any other identity
system is two functions.

---

## TL;DR

- **Declare, don't guard.** `access: 'Posts:READ'` on the route (or `@GET`
  option, `@SOCKET`, `@JOB`, `@Action`) is the whole authorization. No
  `access` means **public** — by decision, and `rapid access <entry.ts>`
  lists every action with its string so that decision is reviewed, not
  guessed (`--fail-on-undeclared` for a CI gate).
- **Using pact** — `@tundralibs/rapid/middlewares/pact`:
  `app.auth(pactAuth(pact, options).binding)`. Its grammar is
  `Module:PERMISSION`, `signed-in`, and `|` for any-of; a clause the pact
  catalog does not know is denied. pact is a real dependency of this
  subpath only — importing `@tundralibs/rapid/middlewares` never pulls it in.
- **Anything else** — write the binding: identify from the request, judge the
  string against the identity. See [Bind an auth platform](#bind-an-auth-platform).
- **Declared but unbound fails boot** (`RAPID_AUTH_UNBOUND`): `fetch()`,
  `start()`, `triggerJob()`, `app.modules()` and the test `harness()` all
  refuse while any action declares `access` and no binding exists.

---

## Bind an auth platform

```ts
import { Application, type RapidAuthBinding } from '@tundralibs/rapid';

declare function verify(
  token: string,
): Promise<{ id: string; roles: string[] } | null>;

const binding: RapidAuthBinding = {
  async authenticate(ctx) {
    if (ctx.type === 'JOB') return { id: 'cron', roles: ['system'] };
    const headers = ctx.type === 'HTTP' ? ctx.headers : ctx.connection.headers;
    const token = headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    return token ? (await verify(token)) ?? undefined : undefined;
  },
  authorize(ctx, access) {
    const auth = ctx.auth as { roles: string[] } | undefined;
    return auth !== undefined && auth.roles.includes(access);
  },
};

const app = await Application.initialize({ name: 'demo' });
app.auth(binding);
app.get('/', () => ({ content: 'public' })); // no access: public
app.get('/admin', { access: 'admin' }, (ctx) => ({
  content: { auth: ctx.auth },
}));
app.job('purge', '0 3 * * *', () => ({ content: 'ok' }), { access: 'system' });
```

What rapid does with it, in chain order:

1. **`app.preAuth(...middleware)`** runs first — the phase for request ids,
   body-size caps and IP rate limits, everything that must not depend on
   who the caller is.
2. **`authenticate(ctx)`** runs once. Its return becomes `ctx.auth`;
   `undefined` leaves the request anonymous. A thrown `RapidError` with a
   4xx status is a **refusal** — a presented credential that fails — and is
   answered as thrown, on a public route too. Any other throw (a session
   store down) marks `ctx.authFailed`: a declared action answers 503
   `RAPID_AUTH_UNAVAILABLE`, an undeclared one serves anonymous. Never
   downgrade a failure to anonymous yourself.
3. **`app.use(...)`** middleware runs with `ctx.auth` already set, so a
   per-user rate limit reads it.
4. **`authorize(ctx, access)`** runs when the action declares `access`.
   `false` is a 401 for an anonymous caller and a 403 for an identified
   one; `onDenied` observes both. The string reaches `authorize` as
   written — any-of, tenants, system identities are the binding's grammar.
5. The action's own middleware and handler run.
6. **`finish(ctx)`** runs after a chain that completed — the hook a scheme
   uses to sign or encrypt the response.

A job has no client: `authenticate` sees `ctx.type === 'JOB'` and returns
either `undefined` (so a declared job is 401 — useful to keep a job declared
but disabled) or a system identity the policy recognises.

### Modules

The same string on a decorated method guards both the request **and**
module-to-module `invoke()`: an `invoke` of a method declaring `access` is
judged for the **caller's** identity, and a denial is the 401/403 envelope,
not a throw. `@Action({ access })` declares an invoke-only method — one no
transport serves. Details in [Modules](./Rapid-Modules.md#access-on-decorated-methods);
the test harness takes an `auth` binding, an `allowAll` stub and `h.as(identity)`
([Testing](./Rapid-Testing.md#harness--the-module-system-with-fakes)).

### The audit

`app.accessReport()` returns every routed action and every `@Action` with
its declared string; the CLI prints it:

```ts ignore
rapid access ./main.ts                       # entry exports the app as `default` or `app`
rapid access ./main.ts --fail-on-undeclared  # exit 1 when any action is public
rapid access ./main.ts --json
```

OpenAPI carries the string as `x-access` on each operation, so the
published contract states what a call needs.

### Without a binding

`ctx.setAuth(identity)` from your own middleware still works for an
application that declares no `access` at all, and remains write-once. It is
**deprecated**, and refused (`RAPID_CONFIG`) once a binding exists: with a
binding, nothing downstream can elevate a request.

---

## Using the pact adapter

Requires `@tundralibs/pact` (`deno add @tundralibs/pact`). Create the instance
and the two middlewares once, at module load, in an `auth.ts`:

```ts
import { Pact } from '@tundralibs/pact';
import { pactAuth } from '@tundralibs/rapid/middlewares/pact';

declare const hooks: Parameters<typeof Pact.create>[0]['hooks'];

export const pact = Pact.create({
  bits: { READ: 1n, EDIT: 2n },
  modulePermissions: { Posts: ['READ', 'EDIT'], Admin: ['READ'] },
  hooks, // getUser / getApiKey / saveSession / … — your storage
});

export const { binding, authenticate, authorize } = pactAuth(pact, {
  schemes: ['BEARER', 'APIKEY'], // default: BEARER, BASIC, APIKEY
  bearer: { cookie: 'session' }, // browser UIs: the cookie login({ cookie }) set
  apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
});
```

### The binding — `access` strings

`app.auth(binding)` is the whole wiring. The grammar `authorize` judges:

| `access`                 | Passes when                                                                     |
| ------------------------ | ------------------------------------------------------------------------------- |
| `Posts:READ`             | the principal holds that grant (`principal.hasPermission`), no store round-trip |
| `signed-in`              | any authenticated principal                                                     |
| `Posts:EDIT\|Admin:READ` | any one clause passes                                                           |
| anything else            | never — a module or permission outside the instance's catalog is denied         |

```ts ignore
import { binding } from './auth.ts';

app.auth(binding);
app.get('/posts', { access: 'Posts:READ' }, list);
app.post('/posts', { access: 'Posts:EDIT' }, create);
```

`binding.authenticate` is the same identification the `authenticate`
middleware does (every carrier below, the stale-cookie rule, one 401 for a
credential that fails); `binding.finish` signs or encrypts the reply when
`hmac` / `encryption` are configured. Tenant-scoped grants
(`acme::Posts`) take a per-request tenant, so they stay a handler check —
see [Tenant-scoped permissions](#tenant-scoped-permissions).

### The middlewares — without a binding

The options are pact's own `PactMiddlewareOptions` — every carrier (header
and scheme prefix) defaults to its standard and is overridable, plus `hmac`,
`encryption`, `challenge` and `realm` — with rapid's additions, `bearer.cookie`
and `session` (below), and one changed default: `optional` is `true` here. The full option and
wire contract lives in [`@tundralibs/pact`](https://jsr.io/@tundralibs/pact)'s
Middleware guide; rapid's
adapter is glue over the same neutral core as pact's express/fastify/oak/hono
adapters, so a client written for one works against all of them.

An application that binds nothing can wire the two middlewares instead —
`authenticate` once (global, or `onlyApi(authenticate)` on a split surface),
`authorize` per route. The two styles do not mix: `authenticate` calls
`ctx.setAuth`, which a binding refuses.

```ts ignore
import { authenticate, authorize } from './auth.ts';

app.use(authenticate);
app.get('/posts', authorize('Posts', 'READ'), list);
app.post('/posts', authorize('Posts', 'EDIT'), create);
```

### What `authenticate` does

It looks for a credential — `Authorization: Bearer <token>` (or the
configured `bearer` header/prefix), `Authorization: Basic …` (a user, or an
API key with `basic.credential: 'apiKey'`), `Authorization: ApiKey
<key>:<secret>` or the two-header `apiKey` form, HMAC (`x-key-id` +
`x-signature` + `x-timestamp`, when `hmac` is configured), or the
`bearer.cookie` — runs `pact.authenticate()`, and sets `ctx.auth` to pact's
`PactAuthContext`: `{ principal, via, sessionId? }`, where `principal` is
the BOUND principal (`id`, `kind: 'USER' | 'APIKEY'`, `grants`,
`hasPermission()`, `assert()`).

- **No credential → the request continues anonymous** (`ctx.auth` unset) —
  `authorize` still rejects it. `optional: false` makes it a 401 instead.
- **A credential that fails → 401, never anonymous.** A wrong password, an
  unknown key and a disabled account are ONE answer on the wire (the
  distinction is in the server log): `RAPID_UNAUTHENTICATED`, "invalid
  credential". A stale HMAC timestamp says so (`details.reason:
  'STALE_TIMESTAMP'`) — the caller's own clock is not a secret.
  The one exception is a **stale bearer cookie**: a browser keeps sending it
  after the session ended, and a 401 would lock the user out of `/login`
  itself — so it is cleared (`Set-Cookie` with `Max-Age=0`) and the request
  continues anonymous (or is a `NO_CREDENTIALS` 401 under `optional: false`).
  A header credential never gets that treatment.
- Every 401 `authenticate` raises for a presented or missing header credential,
  and every 401 from `authorize`, includes a `WWW-Authenticate` challenge listing
  the accepted schemes (`challenge: false` to suppress, `realm` to name one).
  The stale-cookie 401 under `optional: false`, `me()`'s 401 and the session
  handlers' 401s carry no challenge.
- Socket frames authenticate from the UPGRADE request's headers/cookies with
  the header-only schemes (no HMAC, no encryption); jobs pass through (there
  is no client) — a guard on a job fails closed.
- Register `authenticate` before anything that reads the request body: the
  HMAC body digest and JWE decryption read the raw bytes once
  (`ctx.rawPayload`), and `ctx.payload` then parses from those same bytes.
- `ctx.auth` holds the pact object by reference; pick the fields you return
  from a JSON handler (`grants` are BigInts).

### What `authorize(module, permission)` does

`await principal.assert(module, permission)` on the authenticated principal
— no store round-trip. 401 (with the challenge) when `ctx.auth` is unset,
403 when the grant is missing. Both arguments are typed by the instance
(`'Posts'`, `'READ'`), and a JS caller's typo is a `RAPID_CONFIG` at the
call site, not on the first request.

### Tenant-scoped permissions

pact grants can be scoped to a tenant (`acme::Posts`), with a bare `Posts`
grant applying in every tenant; see
[Pact-Tenants](../../pact/docs/Pact-Tenants.md).
`authorize(module, permission)` is fixed per route, and the tenant comes
from each request, so check a tenant-scoped key in the handler. Throw
`RAPID_ACCESS_DENIED` for the 403: an uncaught pact error in a handler is a
500.

```ts
import { Application, RapidError } from '@tundralibs/rapid';
import type { PactAuthContext } from '@tundralibs/pact';

const app = await Application.initialize({ name: 'tenants' });

app.post('/orgs/:org:/posts', async (ctx) => {
  const auth = ctx.auth as PactAuthContext<'Posts'> | undefined;
  if (auth === undefined) throw new RapidError('RAPID_UNAUTHENTICATED');
  const org = String(ctx.args.params.org);
  if (!await auth.principal.hasPermission(`${org}::Posts`, 'EDIT')) {
    throw new RapidError('RAPID_ACCESS_DENIED', {
      details: { module: `${org}::Posts`, permission: 'EDIT' },
    });
  }
  // Query and write with `org`, the value just checked, never a second
  // tenant id from the body.
  return { content: { org } };
});
```

### A second factor (TOTP)

`pactAuth` does not run TOTP; call `pact.verifyMFA` in your own route. A
code works once, and past `options.mfa.maxAttempts` attempts pact throws
`MFA_LOCKED` even for a correct code. Map it to `RAPID_RATE_LIMITED`: an
uncaught pact error in a handler is a 500.

```ts
import { Application, RapidError } from '@tundralibs/rapid';
import { type Pact, PactError } from '@tundralibs/pact';

declare const pact: Pact<{ READ: 1n }, 'Posts'>;
const app = await Application.initialize({ name: 'mfa' });

app.post('/mfa', async (ctx) => {
  const { userId, code } = await ctx.payload as {
    userId: string;
    code: string;
  };
  try {
    if (!await pact.verifyMFA(userId, code)) {
      throw new RapidError('RAPID_UNAUTHENTICATED');
    }
  } catch (e) {
    if (e instanceof PactError && e.code === 'MFA_LOCKED') {
      throw new RapidError('RAPID_RATE_LIMITED');
    }
    throw e;
  }
  return { content: { ok: true } };
});
```

### Sessions — `login`, `logout`, `refresh`, `me`

The factory also returns the four session handlers, thin HTTP wrappers over
`pact.login()`, `pact.logout()` and `pact.refresh()`. Hanging them off
`pactAuth` is what keeps the cookie `login` sets and the cookie
`authenticate` reads one declaration: `bearer.cookie`.

```ts
import { Application } from '@tundralibs/rapid';
import { pactAuth } from '@tundralibs/rapid/middlewares/pact';
import type { Pact } from '@tundralibs/pact';

declare const pact: Pact<{ READ: 1n }, 'Admin'>;
const app = await Application.initialize({ name: 'sessions' });

const { authenticate, login, logout, refresh, me } = pactAuth(pact, {
  bearer: { cookie: 'session' },
  session: {
    fields: { identifier: 'email' }, // body field names (default identifier/password)
    cookie: { sameSite: 'Lax' }, // + secure: true, path: '/' — always HttpOnly
    refreshCookie: 'refresh', // JWT strategy: refresh token as an HttpOnly cookie
    principal: (p) => ({ id: p.id, kind: p.kind }), // default: { id }
  },
});

app.use(authenticate);
app.post('/login', login());
app.post('/logout', logout());
app.post('/refresh', refresh());
app.get('/me', me());
```

| Handler     | Does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login()`   | Reads the two body fields → `pact.login()` → `200 { token, expiresAt, refreshToken?, principal }` and, when `bearer.cookie` is set, the session cookie (`Max-Age` = remaining session life, capped at 400 days). `refreshToken` is in the body only when the JWT strategy issued one AND no `refreshCookie` is configured — with the cookie it travels there (`Max-Age` = `session.refreshMaxAge`, default 7 days). Malformed body → 400. Every pact authentication failure → one 401 `invalid credentials`; anything else is a real 500. |
| `logout()`  | Ends the presented session (header or cookie) via `pact.logout()`, clears the session and refresh cookies, answers 204. Idempotent — an unknown or already-ended token still clears the cookie.                                                                                                                                                                                                                                                                                                                                           |
| `refresh()` | JWT strategy only: `pact.refresh()` with the token from `refreshCookie` (or `refreshToken` in the body) → the same reply as `login` with rotated tokens. A reused or expired token is 401 and clears the refresh cookie; an OPAQUE instance is a `RAPID_CONFIG` 500.                                                                                                                                                                                                                                                                      |
| `me()`      | `{ principal, via }` for the current credential through the same projection; 401 when anonymous. Mount it after `authenticate`.                                                                                                                                                                                                                                                                                                                                                                                                           |

Rules worth knowing: the principal projection defaults to `{ id }` on purpose
(grants, status and metadata are yours to expose field by field, and grants
are BigInts); `sameSite: 'None'` needs `secure: true`; the handlers are
ordinary routes, so `csrf()` applies to the POSTs if installed and
`idempotency()` should not sit in front of `login` (`set-cookie` is never
replayed). API clients ignore the cookie and send the same token as
`Authorization: Bearer`. The API reference's sign-in form posts here too:
`docs(app, { tryIt: { login: { path: '/login' } } })` reads `token` from
the reply and the cookie comes along for free — see
[OpenAPI and the API reference](./Rapid-OpenAPI.md).

### HMAC — signed both ways

`hmac: {}` turns on pact's signed exchange with its standard defaults: the
client signs `${@method}\n${@path}${@query}\n${x-timestamp}\n${content-digest}`
with the API key's secret (hex HMAC; the digest is RFC 9530 `sha-256=:…:`
over the exact body bytes), sends `x-key-id`, `x-signature` and
`x-timestamp`, and rapid verifies it — a timestamp outside `maxSkew` (300 s)
is a 401 before the body is even hashed. After the handler, rapid signs the
response over `${@status}\n${x-timestamp}\n${content-digest}` with the same
key: a JSON reply is serialized by the adapter so the signed bytes are the
sent bytes; a streamed body (`ctx.serve`, SSE) goes out unsigned, and so
does an error response. Templates, header names, the algorithm and the
frozen RFC 9421 key set are pact's — see its Middleware guide.

### Encrypted payloads

`encryption: {}` lets an API-key or HMAC caller send its body as a compact
JWE (`Content-Type: application/jose`, `alg: dir` + AES-GCM under a key
derived from the API key's secret — `pact.encryptFor`/`decryptFor` are the
reference). Rapid decrypts it before the handler runs, so `ctx.payload` and
`payload(schema)` see the plaintext (JSON when it parses, else text), and
encrypts the reply back for a caller that sent a JWE, sends `Accept:
application/jose`, or when `required` is on. A JWE that cannot be opened is
a 400 `RAPID_VALIDATION_FAILED` with `details.reason: 'ENCRYPTION_INVALID'`.

---

### On Cloudflare Workers

Workers refuses PBKDF2 above 100 000 iterations, and pact hashes passwords at
600 000 by default, so `register`, `login` and password reset fail there. A
Workers deployment passes `options: { password: { iterations: 100_000 } }` to
`Pact.create`. For a different scheme, such as a pepper, pass the
`hashPassword` / `verifyPassword` hooks. Hashes already stored at a higher
count cannot be checked on Workers and need a password reset. See the
Password hashing section of [`@tundralibs/pact`](https://jsr.io/@tundralibs/pact)'s
Security guide (pact 0.13+).

## Norm + pact

pact owns no storage — its hooks are just queries. For the full pattern
(sharing one pool, backing `getUser`/`getApiKey` with norm repos, caching
`getUser` safely), see
[Database access & connection pooling](./Rapid-Database.md); a runnable
version lives in [`examples/blog/auth.ts`](../examples/blog/auth.ts) and
`examples/blog/main.ts`'s `/login` + `/admin/*` routes.
