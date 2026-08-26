# Authentication & authorization

Two layers: a generic, auth-agnostic seam in core, and an opt-in
`@tundralibs/pact` adapter for apps that use pact. Mix both in the same app.

---

## TL;DR

- **Bring your own auth** — `authenticate({ verify })` + `authorize(check?)`
  from `@tundralibs/rapid/middlewares`. Fills `ctx.auth`; you own identity.
- **Using pact** — `@tundralibs/rapid/middlewares/pact` instead: `pact(options)`
  once at boot, then `authenticate(schemes?)` + `authorize(module, permission)`
  wherever you mount routes. pact is a real dependency of this subpath only —
  importing `@tundralibs/rapid/middlewares` never pulls it in.
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

### 1. Register pact once

```ts
import { pact } from '@tundralibs/rapid/middlewares/pact';

declare const db: {
  getUser(id: string): Promise<{ id: string; status: 'ACTIVE' } | null>;
  getApiKey(
    id: string,
  ): Promise<{ id: string; userId: string; secretHash: string } | null>;
};

// Exactly once, typically at boot. Creates the Pact instance AND registers
// it (via doctor) for authenticate()/authorize() to resolve — no separate
// registration step, and nothing to import from this call's return value.
pact({
  bits: { READ: 1n, WRITE: 2n },
  modules: { Post: ['READ', 'WRITE'] },
  apiKeys: true,
  hooks: {
    getUser: (q) => (q.by === 'ID' ? db.getUser(q.id) : null),
    getApiKey: (id) => db.getApiKey(id),
  },
  // configure the schemes this app accepts — only the ones you list here
  // are tried; everything else is off by default.
  apiKey: {}, // x-api-key / x-api-secret headers, both defaults
});
```

`pact()` calls `Pact.create()` internally, so the app never imports
`@tundralibs/pact`'s `Pact` class directly. Every other pact option
(`password`, `tokens`, `oauth`, `session`, …) passes straight through — see
`@tundralibs/pact`'s own docs for those.

### 2. Identify requests

```ts
import { authenticate } from '@tundralibs/rapid/middlewares/pact';

declare const app: import('@tundralibs/rapid').Application;

app.use(authenticate()); // every configured scheme, in a fixed priority order
app.get('/webhook', authenticate(['HMAC']), () => ({ content: 'ok' })); // this route: HMAC only
```

`authenticate(schemes?)` resolves the registered `Pact` via `inject(PACT)` at
**call time** — the same timing modules already use for `inject(DB)`, not
per-request — so it's safe to import and call from any number of route files.
There is nothing to accidentally re-initialize: `pact()` runs once, this
function never holds its own `Pact` instance.

The "fixed priority order" when `schemes` is omitted is always
`bearer`/`basic`/`token`/`apiKey`/`hmac`, whichever of those you configured —
**not** the order you wrote the keys in `pact(options)`.

If `ctx.auth` is already set (an earlier `authenticate()`, or BYO auth) and
`schemes` restricts to specific scheme(s), the existing auth must already
carry one of those schemes — otherwise this call denies with 403 rather than
silently accepting whatever scheme authenticated the request first. With no
restriction, an existing `ctx.auth` is left alone either way.

### 3. Authorize

```ts
import { authorize } from '@tundralibs/rapid/middlewares/pact';

declare const app: import('@tundralibs/rapid').Application;

// 401 if ctx.auth is unset, 403 if the principal lacks WRITE on Post
app.post('/posts', authorize('Post', 'WRITE'), (ctx) => ({
  content: { authorId: ctx.auth?.id },
}));
```

Argument order is **`(module, permission)`**, matching pact's own
`pact.can(principal, module, permission)` (pact 0.6.0+). Built on the generic
`authorize(check)` internally, so 401/403 semantics are identical to the BYO
path above.

---

## `ctx.auth` after a pact scheme matches

The resolved principal (`id`, `grants`, `status`, `metadata`) is always
present, plus `authMode` and whichever credential fields are safe to expose —
never a secret:

| scheme   | extra fields | never included         |
| -------- | ------------ | ---------------------- |
| `BASIC`  | `identifier` | `password`             |
| `BEARER` | —            | `token`                |
| `TOKEN`  | —            | `token`                |
| `APIKEY` | `keyId`      | `secret`               |
| `HMAC`   | `keyId`      | `signature`, `payload` |

`grants` are BigInt masks — don't return `ctx.auth` whole from a JSON handler
(`JSON.stringify` can't serialize a BigInt); pick the fields you need.

---

## Responding to the request (HMAC signing, etc.)

Each scheme accepts an optional `respond(ctx, pact)` hook, called after the
handler runs, only when that scheme authenticated the request:

```ts
import { pact } from '@tundralibs/rapid/middlewares/pact';

declare const db: {
  getUser(id: string): Promise<{ id: string; status: 'ACTIVE' } | null>;
  getApiKey(
    id: string,
  ): Promise<{ id: string; userId: string; secret: string } | null>;
};

pact({
  bits: { READ: 1n },
  apiKeys: true,
  hooks: {
    getUser: (q) => (q.by === 'ID' ? db.getUser(q.id) : null),
    getApiKey: (id) => db.getApiKey(id),
  },
  hmac: {
    canonical: (ctx) => `${ctx.action}`, // build the string the caller signed
    respond: async (ctx, instance) => {
      const keyId = (ctx.auth as { keyId: string }).keyId;
      const signature = await instance.signAs(keyId, 'the response body');
      if (ctx.type === 'HTTP' && signature !== null) {
        ctx.setHeader('x-signature', signature);
      }
    },
  },
});
```

`signAs(keyId, content)` signs with the _same_ per-key secret the caller
authenticated with, without ever exposing that secret to your code — rapid
doesn't decide what a response needs to carry; the hook does.

---

## Norm + pact

pact owns no storage — its hooks are just queries. For the full pattern
(sharing one pool, backing `getUser`/`getApiKey` with norm repos, caching
`getUser` safely), see
[Database access & connection pooling](./Rapid-Database.md); a runnable
version lives in [`examples/pactAuth.ts`](../examples/pactAuth.ts) and
`examples/main.ts`'s `/admin/pact-summary` route.
