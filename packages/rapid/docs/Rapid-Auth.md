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

### Sessions for a browser UI

A login route is app code over `pact.login()` — the body shape, the cookie
and what the principal exposes are yours. The shape that keeps the browser
and API clients on one token:

```ts
import { Application, RapidError } from '@tundralibs/rapid';
import type { Pact } from '@tundralibs/pact';

declare const pact: Pact<{ READ: 1n }, 'Admin'>;
const app = await Application.initialize({ name: 'login' });

app.post('/login', async (ctx) => {
  const body = (await ctx.payload) as Record<string, unknown> | null;
  const identifier = body?.identifier;
  const password = body?.password;
  if (typeof identifier !== 'string' || typeof password !== 'string') {
    throw new RapidError('RAPID_VALIDATION_FAILED', {
      message: 'identifier and password are required',
    });
  }
  let result: Awaited<ReturnType<typeof pact.login>>;
  try {
    result = await pact.login({ identifier, password });
  } catch {
    // One answer for every failure kind — never an account oracle.
    throw new RapidError('RAPID_UNAUTHENTICATED', {
      message: 'invalid credentials',
    });
  }
  return {
    content: {
      token: result.session.token,
      principal: { id: result.principal.id }, // project — never the whole principal
    },
    cookies: [{
      name: 'session',
      value: result.session.token,
      options: { path: '/', httpOnly: true, secure: true, sameSite: 'Lax' },
    }],
  };
});
```

`pactAuth(pact, { bearer: { cookie: 'session' } })` then reads the cookie
back on page requests, while API clients send the same token as
`Authorization: Bearer`. Rules worth keeping: validate the body yourself, map
every pact failure to one 401 (a distinct message per reason is an account
oracle), never put `set-cookie` behind `idempotency()`, and rotate any
`session()` state with `regenerate()` on login.

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
