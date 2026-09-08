# Authentication & authorization

Rapid owns one thing here: the auth bag. `ctx.auth` is `undefined` until an
authentication middleware calls `ctx.setAuth(identity)` — once per request,
any transport — and every guard downstream reads it. The `@tundralibs/pact`
adapter is the shipped way to fill it; any other identity system is a short
middleware over the same seam.

---

## TL;DR

- **Using pact** — `@tundralibs/rapid/middlewares/pact`: one factory over your
  instance, `const { authenticate, authorize } = pactAuth(pact, options)`;
  `authorize('Module', 'PERMISSION')` is typed by that instance. pact is a
  real dependency of this subpath only — importing
  `@tundralibs/rapid/middlewares` never pulls it in.
- **Anything else** — write the middleware: read your credential, verify it,
  `ctx.setAuth(...)`; guard with a middleware that throws
  `RAPID_UNAUTHENTICATED` / `RAPID_ACCESS_DENIED`. See
  [Bring your own auth](#bring-your-own-auth).

---

## Bring your own auth

The seam is the context, not a helper. An identifying middleware never
rejects (anonymous requests flow through so public routes keep working), skips
jobs (no client), and reads the upgrade request on a socket frame; a guard
throws rapid's own codes so the error pipeline (JSON envelope, HTML on the UI
surface, logs) handles the rest:

```ts
import {
  Application,
  RapidError,
  type RapidMiddleware,
} from '@tundralibs/rapid';

declare function verify(
  token: string,
): Promise<{ id: string; role: string } | null>;

const identify: RapidMiddleware = async (ctx, next) => {
  if (ctx.type !== 'JOB') {
    const headers = ctx.type === 'HTTP' ? ctx.headers : ctx.connection.headers;
    const token = headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const identity = token ? await verify(token) : null;
    if (identity !== null) ctx.setAuth(identity);
  }
  return next();
};

const admins: RapidMiddleware = (ctx, next) => {
  const auth = ctx.auth as { role: string } | undefined;
  if (auth === undefined) throw new RapidError('RAPID_UNAUTHENTICATED');
  if (auth.role !== 'admin') throw new RapidError('RAPID_ACCESS_DENIED');
  return next();
};

const app = await Application.initialize({ name: 'demo' });
app.use(identify);
app.get('/admin', admins, (ctx) => ({ content: { auth: ctx.auth } }));
```

`setAuth` is write-once (a second call is `RAPID_CONFIG`), so two identity
middlewares cannot silently overwrite each other.

### Documenting your guard in OpenAPI — `markOpenApi`

A guard can carry the security requirement it enforces and the schemes it
accepts. `app.route()` reads that metadata off the route's middleware chain
and fills the operation's `security` plus `components.securitySchemes`, so a
guarded route documents itself without an `openapi.security` list on every
registration. This is exactly what pact's `authorize()` does for its
configured carriers; `markOpenApi` gives a hand-written guard the same
ability. The split stays the one above: the identifying middleware never
rejects, the guard is what enforces — and the guard is what gets stamped:

```ts
import {
  Application,
  markOpenApi,
  RapidError,
  type RapidMiddleware,
} from '@tundralibs/rapid';
import { openapi } from '@tundralibs/rapid/endpoints';

declare function lookupKey(key: string): Promise<{ id: string } | null>;

// Identify (app-wide, never rejects): a valid `x-api-key` sets ctx.auth,
// anything else continues anonymous so public routes keep working.
const identify: RapidMiddleware = async (ctx, next) => {
  if (ctx.type === 'HTTP') {
    const key = ctx.headers.get('x-api-key');
    const owner = key ? await lookupKey(key) : null;
    if (owner !== null) ctx.setAuth(owner);
  }
  return next();
};

// Guard (per route, enforces): no identity → 401. The metadata describes
// the credential `identify` accepts, in OpenAPI terms.
const requireKey: RapidMiddleware = markOpenApi(
  (ctx, next) => {
    if (ctx.auth === undefined) throw new RapidError('RAPID_UNAUTHENTICATED');
    return next();
  },
  {
    security: ['apiKeyAuth'],
    securitySchemes: {
      apiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-api-key' },
    },
  },
);

const app = await Application.initialize({ name: 'keys' });
app.use(identify);
app.get('/reports', requireKey, () => ({ content: { rows: [] } }));
app.get('/status', () => ({ content: { ok: true } })); // public, no requirement
app.get('/openapi.json', openapi({ expose: 'ALL' }));
```

The document then carries, for `GET /reports`:

```json
{ "security": [{ "apiKeyAuth": [] }] }
```

and under `components.securitySchemes` the `apiKeyAuth` entry exactly as
declared (beside the `bearerAuth` rapid always declares). `/status` has no
`security` key. Rules: an explicit `openapi.security` on the route wins over
the guard's (so `{ openapi: { security: [] } }` still marks a guarded route
public in the docs); several stamped guards on one route union their names;
`middlewareOpenApi(mw)` reads the metadata back. Decorated routes cannot take
route middleware yet, so they keep the `security` decorator option.

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

export const { authenticate, authorize } = pactAuth(pact, {
  schemes: ['BEARER', 'APIKEY'], // default: BEARER, BASIC, APIKEY
  bearer: { cookie: 'session' }, // browser UIs: the cookie login({ cookie }) set
  apiKey: { keyHeader: 'x-api-key', secretHeader: 'x-api-secret' },
});
```

The options are pact's own `PactMiddlewareOptions` — every carrier (header
and scheme prefix) defaults to its standard and is overridable, plus `hmac`,
`encryption`, `challenge` and `realm` — with two rapid additions:
`bearer.cookie`, and `optional` defaulting to `true`. The full option and
wire contract lives in [`@tundralibs/pact`](https://jsr.io/@tundralibs/pact)'s
Middleware guide; rapid's
adapter is glue over the same neutral core as pact's express/fastify/oak/hono
adapters, so a client written for one works against all of them.

Then wire them wherever routes are registered — `authenticate` once (global,
or `onlyApi(authenticate)` on a split surface), `authorize` per route:

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
- Every 401 the adapter raises includes a `WWW-Authenticate` challenge listing
  the accepted schemes (`challenge: false` to suppress, `realm` to name one).
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

| Handler     | Does                                                                                                                                                                                                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `login()`   | Reads the two body fields → `pact.login()` → `200 { token, expiresAt, refreshToken?, principal }` and sets the session cookie (`Max-Age` = remaining session life, capped at 400 days). Malformed body → 400. Every pact authentication failure → one 401 `invalid credentials`; anything else is a real 500. |
| `logout()`  | Ends the presented session (header or cookie) via `pact.logout()`, clears the session and refresh cookies, answers 204. Idempotent — an unknown or already-ended token still clears the cookie.                                                                                                               |
| `refresh()` | JWT strategy only: `pact.refresh()` with the token from `refreshCookie` (or `refreshToken` in the body) → the same reply as `login` with rotated tokens. A reused or expired token is 401; an OPAQUE instance is a `RAPID_CONFIG` 500.                                                                        |
| `me()`      | `{ principal, via }` for the current credential through the same projection; 401 when anonymous. Mount it after `authenticate`.                                                                                                                                                                               |

Rules worth knowing: the principal projection defaults to `{ id }` on purpose
(grants, status and metadata are yours to expose field by field, and grants
are BigInts); `sameSite: 'None'` needs `secure: true`; the handlers are
ordinary routes, so `csrf()` applies to the POSTs if installed and
`idempotency()` should not sit in front of `login` (`set-cookie` is never
replayed). API clients ignore the cookie and send the same token as
`Authorization: Bearer`.

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

## Norm + pact

pact owns no storage — its hooks are just queries. For the full pattern
(sharing one pool, backing `getUser`/`getApiKey` with norm repos, caching
`getUser` safely), see
[Database access & connection pooling](./Rapid-Database.md); a runnable
version lives in [`examples/blog/auth.ts`](../examples/blog/auth.ts) and
`examples/blog/main.ts`'s `/login` + `/admin/*` routes.
