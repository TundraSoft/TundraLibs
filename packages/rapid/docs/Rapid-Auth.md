# Authentication & authorization

Two layers: a generic, auth-agnostic seam in core, and an opt-in
`@tundralibs/pact` adapter for apps that use pact. Mix both in the same app.

---

## TL;DR

- **Bring your own auth** — `authenticate({ verify })` + `authorize(check?)`
  from `@tundralibs/rapid/middlewares`. Fills `ctx.auth`; you own identity.
- **Using pact** — `@tundralibs/rapid/middlewares/pact` instead: one factory
  over your instance, `const { authenticate, authorize } = pactAuth(pact,
  options)`; `authorize('Module', 'PERMISSION')` is typed by that instance.
  pact is a real dependency of this subpath only — importing
  `@tundralibs/rapid/middlewares` never pulls it in.
- Both fill the same `ctx.auth` bag, so `authorize()` (the generic one) works
  on either, and one app can use pact on some routes and a custom `verify` on
  others.

---

## Bring your own auth

```ts
import { Application } from '@tundralibs/rapid';
import { authenticate, authorize } from '@tundralibs/rapid/middlewares';

const app = await Application.initialize({ name: 'demo' });

// extract a token, verify it yourself, never rejects (anonymous flows through)
app.use(authenticate({
  verify: (token) => (token === 'valid-token' ? { id: 'u1' } : null),
}));

// 401 if ctx.auth is unset; 403 if the check fails
app.get(
  '/me',
  authorize((auth) => (auth as { id: string }).id !== undefined),
  (ctx) => ({ content: { auth: ctx.auth ?? null } }),
);
```

`extract` defaults to a bearer `Authorization` header; override it to read a
cookie, a query param, or anything else. See the JSDoc on `authenticate`/
`authorize` for the full contract (set-once `ctx.auth`, job-skip behavior).

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
  apiKey: {}, // also x-api-key / x-api-secret headers
});
```

Then wire them wherever routes are registered — `authenticate` once (global,
or `onlyApi(authenticate)` on a split surface), `authorize` per route:

```ts ignore
import { authenticate, authorize } from './auth.ts';

app.use(authenticate);
app.get('/posts', authorize('Posts', 'READ'), list);
app.post('/posts', authorize('Posts', 'EDIT'), create);
```

### What `authenticate` does

It looks for a credential — `Authorization: Bearer <token>` (or a custom
`bearer.prefix`), `Authorization: Basic …`, `Authorization: ApiKey <key>:<secret>`,
the split `apiKey` headers, HMAC (`x-key-id` + `x-signature`, when `hmac` is
configured), or the `bearer.cookie` — runs `pact.authenticate()`, and sets
`ctx.auth` to pact's `PactAuthContext`: `{ principal, via, sessionId? }`, where
`principal` is the BOUND principal (`id`, `kind: 'USER' | 'APIKEY'`, `grants`,
`hasPermission()`, `assert()`).

- **No credential → the request continues anonymous** (`ctx.auth` unset) —
  `authorize` still rejects it. `optional: false` makes it a 401 instead.
- **A credential that fails → 401, never anonymous.** A wrong password, an
  unknown key and a disabled account are ONE answer on the wire (the
  distinction is in the server log); the body carries only the scheme.
- Every 401 the adapter raises includes a `WWW-Authenticate` challenge listing
  the accepted schemes (`challenge: false` to suppress, `realm` to name one).
- Socket frames authenticate from the UPGRADE request's headers/cookies; jobs
  pass through (there is no client) — a guard on a job fails closed.
- `ctx.auth` holds the pact object by reference; pick the fields you return
  from a JSON handler (`grants` are BigInts).

### What `authorize(module, permission)` does

`await principal.assert(module, permission)` on the authenticated principal
— no store round-trip. 401 (with the challenge) when `ctx.auth` is unset,
403 when the grant is missing. Both arguments are typed by the instance
(`'Posts'`, `'READ'`), and a JS caller's typo is a `RAPID_CONFIG` at the
call site, not on the first request.

### Sessions for a browser UI

`login({ pact, cookie: { name: 'session' } })` (from
`@tundralibs/rapid/endpoints`) logs a user in with `{ identifier, password }`
and sets the session token as an HttpOnly cookie; `pactAuth(pact, { bearer:
{ cookie: 'session' } })` reads it back. API clients keep sending the same
token as `Authorization: Bearer`.

### HMAC

`hmac.canonical(ctx)` returns the exact string the caller signed (hex HMAC
with the API key's secret) — the contract between your clients and this
server, so there is no default; it receives the rapid context, so a body hash
is `await ctx.payload` away. Response signing is not provided.

---

## Norm + pact

pact owns no storage — its hooks are just queries. For the full pattern
(sharing one pool, backing `getUser`/`getApiKey` with norm repos, caching
`getUser` safely), see
[Database access & connection pooling](./Rapid-Database.md); a runnable
version lives in [`examples/blog/pactAuth.ts`](../examples/blog/pactAuth.ts) and
`examples/blog/main.ts`'s `/admin/pact-summary` route.
