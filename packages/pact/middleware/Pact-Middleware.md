# Middleware

Drop-in transport adapters: one factory per framework — express, fastify,
oak, hono — returning `{ authenticate, authorize }` over one pact instance
and one options bag. `authenticate` extracts the credential, calls
`pact.authenticate`, and attaches the auth context; `authorize(module,
permission)` is the per-route guard, typed by the instance. The neutral
core (`createPactMiddleware`) makes any other stack a few lines of glue.
The adapters are structural: pact depends on none of the frameworks.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

## Table of Contents

- [What every adapter does](#what-every-adapter-does)
- [Options](#options)
- [express](#express)
- [fastify](#fastify)
- [oak](#oak)
- [hono](#hono)
- [HMAC-signed requests](#hmac-signed-requests)
- [Writing your own adapter](#writing-your-own-adapter)

## What every adapter does

| Step          | Behavior                                                                                                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build         | `const { authenticate, authorize } = <framework>Pact(pact, options)` — once, at module load                                                                       |
| Extract       | `Authorization: Bearer` / `Basic` / `ApiKey key:secret`, plus `x-key-id` + `x-signature` when HMAC is configured                                                  |
| No credential | 401 `{ "error": "NO_CREDENTIALS" }` — or pass through unauthenticated when `optional`                                                                             |
| Authenticate  | `pact.authenticate(credential)`; the context attaches to the request (`req.pact`, `request.pact`, `ctx.state.pact`, `c.get('pact')`)                              |
| Auth failure  | 401 with the stable code (`INVALID_CREDENTIALS`, `SESSION_EXPIRED`, ...) — a presented credential that fails is NEVER downgraded to anonymous, even if `optional` |
| Challenge     | Every 401 carries `WWW-Authenticate` — one challenge per accepted scheme, `realm` when set (`challenge: false` to suppress)                                       |
| Guard         | `authorize(module, permission)` asserts on the attached bound principal — 403 `PERMISSION_DENIED` on refusal, 401 when unauthenticated                            |
| Typing        | `authorize` takes the instance's own module names and permission keys; the catalog is checked when the guard is built, so a typo fails at boot                    |
| Other errors  | Handed to the framework (express `next(error)`; the rest rethrow)                                                                                                 |

The attached principal is a bound principal: route handlers can call
`principal.hasPermission(...)`/`assert(...)` directly for checks beyond
the guard, at no store round-trip.

## Options

The factory's `PactMiddlewareOptions` — one bag both halves share:

| Option      | Default                                                      | Meaning                                                                      |
| ----------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `schemes`   | `['BEARER', 'BASIC', 'APIKEY']` (+ `'HMAC'` when `hmac` set) | Accepted schemes; others read as absent                                      |
| `optional`  | `false`                                                      | Missing credential continues unauthenticated (invalid ones still 401)        |
| `hmac`      | —                                                            | `{ canonical }` enables the HMAC scheme — see [below](#hmac-signed-requests) |
| `challenge` | `true`                                                       | Send `WWW-Authenticate` on every 401                                         |
| `realm`     | —                                                            | The `realm` parameter of those challenges                                    |

## express

```ts ignore
import express from 'express';
import { expressPact } from '@tundralibs/pact/middleware/express';

const { authenticate, authorize } = expressPact(pact);
const app = express();
app.use(authenticate);

app.get('/projects', authorize('Projects', 'READ'), (req, res) => {
  res.json({ user: req.pact.principal.id });
});

// Sessions-only route group, anonymous browsing allowed:
const shop = expressPact(pact, { schemes: ['BEARER'], optional: true });
app.use('/shop', shop.authenticate);
```

The context attaches as `req.pact`. Non-pact errors go to `next(error)`
and your express error handler.

## fastify

```ts ignore
import Fastify from 'fastify';
import { fastifyPact } from '@tundralibs/pact/middleware/fastify';

const { authenticate, authorize } = fastifyPact(pact);
const app = Fastify();
app.addHook('preHandler', authenticate); // global

app.get('/projects', {
  preHandler: authorize('Projects', 'READ'), // per-route
}, async (request) => ({ user: request.pact.principal.id }));
```

The context attaches as `request.pact`. Register per-route instead of
globally by putting `authenticate` in that route's `preHandler` array.

## oak

```ts ignore
import { Application, Router } from '@oak/oak';
import { oakPact } from '@tundralibs/pact/middleware/oak';

const { authenticate, authorize } = oakPact(pact);
const router = new Router();
router.get(
  '/projects',
  authenticate,
  authorize('Projects', 'READ'),
  (ctx) => {
    ctx.response.body = { user: ctx.state.pact.principal.id };
  },
);
```

The context attaches as `ctx.state.pact`. The
[oauth-signin example](../examples/oauth-signin/README.md) runs this
adapter over live HTTP.

## hono

```ts ignore
import { Hono } from 'hono';
import { honoPact } from '@tundralibs/pact/middleware/hono';
import type { PactAuthContext } from '@tundralibs/pact';

const { authenticate, authorize } = honoPact(pact);
const app = new Hono();
app.use(authenticate);

app.get('/projects', authorize('Projects', 'READ'), (c) => {
  const auth = c.get('pact') as PactAuthContext;
  return c.json({ user: auth.principal.id });
});
```

The context attaches via `c.set('pact', ...)`. Hono runs on Workers, where
pact's fetch-based surface (JWT sessions, external caches over HTTP
drivers) is the natural fit.

## HMAC-signed requests

The HMAC scheme activates only when you provide the canonicalization
contract — the exact string clients sign. There is no default because the
contract must match your clients byte for byte:

```ts ignore
const { authenticate } = expressPact(pact, {
  hmac: {
    canonical: (req) => `${req.method} ${req.path}`,
  },
});
app.use(authenticate);
```

Clients send `x-key-id` and `x-signature` (hex, as produced by crypt's
`signHMAC` with the key's secret). Cover a timestamp and body digest in
real deployments, and reject stale timestamps at the app layer — see
[Security](../docs/Pact-Security.md).

## Writing your own adapter

The core is one factory from `@tundralibs/pact/middleware`: it returns the
two halves as pure functions over a `{ method, path, header }` request view
and an auth context, plus the shared challenge. An adapter maps a verdict or
a denial to its framework's response:

```ts ignore
import { createPactMiddleware } from '@tundralibs/pact/middleware';

const core = createPactMiddleware(pact, { optional: true });

async function myAuth(req: MyRequest, res: MyResponse, pass: () => void) {
  const verdict = await core.authenticate({
    method: req.method,
    path: req.pathname,
    header: (name) => req.headers.get(name),
  }); // throws only for non-pact errors — let the framework handle those
  if (!verdict.ok) {
    const { status, body, headers } = verdict.denial; // headers: www-authenticate on 401
    return res.send(status, body, headers);
  }
  req.auth = verdict.auth; // undefined when absent and optional
  pass();
}

const guard = core.authorize('Projects', 'READ'); // typed; catalog-checked here
async function myGuard(req: MyRequest, res: MyResponse, pass: () => void) {
  const denial = await guard(req.auth);
  if (denial !== undefined) {
    return res.send(denial.status, denial.body, denial.headers);
  }
  pass();
}
```

The lower-level pieces remain exported: `extractCredential` needs only
`{ method, path, header }`; `failureResponse` is the complete PactError →
status mapping (401 for the auth-failure codes, 403 `PERMISSION_DENIED`,
409 `USER_EXISTS`, 500 otherwise) and doubles as an app-level error
boundary.

---

[← Back to Pact](../README.md)
