# Middleware

Drop-in transport adapters: an authentication handler that extracts the
credential, calls `authenticate`, and attaches the auth context, plus a
per-route permission guard. Four frameworks ship ready-made — express,
fastify, oak, hono — and the neutral core makes any other stack a few
lines of glue. The adapters are structural: pact depends on none of the
frameworks.

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

| Step          | Behavior                                                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Extract       | `Authorization: Bearer` / `Basic` / `ApiKey key:secret`, plus `x-key-id` + `x-signature` when HMAC is configured                              |
| No credential | 401 `{ "error": "NO_CREDENTIALS" }` — or pass through when `optional`                                                                         |
| Authenticate  | `pact.authenticate(credential)`; the context attaches to the request (`req.pact`, `request.pact`, `ctx.state.pact`, `c.get('pact')`)          |
| Auth failure  | 401 with the stable code (`INVALID_CREDENTIALS`, `SESSION_EXPIRED`, ...)                                                                      |
| Guard         | `<framework>Guard(module, permission)` asserts on the attached bound principal — 403 `PERMISSION_DENIED` on refusal, 401 when unauthenticated |
| Other errors  | Handed to the framework (express `next(error)`; the rest rethrow)                                                                             |

The attached principal is a bound principal: route handlers can call
`principal.hasPermission(...)`/`assert(...)` directly for checks beyond
the guard, at no store round-trip.

## Options

Both handlers accept the same `PactMiddlewareOptions`:

| Option     | Default                                                      | Meaning                                                                      |
| ---------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `schemes`  | `['BEARER', 'BASIC', 'APIKEY']` (+ `'HMAC'` when `hmac` set) | Accepted schemes; others read as absent                                      |
| `optional` | `false`                                                      | Missing credential continues unauthenticated (invalid ones still 401)        |
| `hmac`     | —                                                            | `{ canonical }` enables the HMAC scheme — see [below](#hmac-signed-requests) |

## express

```ts ignore
import express from 'express';
import { expressAuth, expressGuard } from '@tundralibs/pact/middleware/express';

const app = express();
app.use(expressAuth(pact));

app.get('/projects', expressGuard('Projects', 'READ'), (req, res) => {
  res.json({ user: req.pact.principal.id });
});

// Sessions-only route group, anonymous browsing allowed:
app.use('/shop', expressAuth(pact, { schemes: ['BEARER'], optional: true }));
```

The context attaches as `req.pact`. Non-pact errors go to `next(error)`
and your express error handler.

## fastify

```ts ignore
import Fastify from 'fastify';
import { fastifyAuth, fastifyGuard } from '@tundralibs/pact/middleware/fastify';

const app = Fastify();
app.addHook('preHandler', fastifyAuth(pact)); // global

app.get('/projects', {
  preHandler: fastifyGuard('Projects', 'READ'), // per-route
}, async (request) => ({ user: request.pact.principal.id }));
```

The context attaches as `request.pact`. Register per-route instead of
globally by putting `fastifyAuth(pact)` in that route's `preHandler`
array.

## oak

```ts ignore
import { Application, Router } from '@oak/oak';
import { oakAuth, oakGuard } from '@tundralibs/pact/middleware/oak';

const router = new Router();
router.get(
  '/projects',
  oakAuth(pact),
  oakGuard('Projects', 'READ'),
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
import { honoAuth, honoGuard } from '@tundralibs/pact/middleware/hono';
import type { PactAuthContext } from '@tundralibs/pact';

const app = new Hono();
app.use(honoAuth(pact));

app.get('/projects', honoGuard('Projects', 'READ'), (c) => {
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
app.use(expressAuth(pact, {
  hmac: {
    canonical: (req) => `${req.method} ${req.path}`,
  },
}));
```

Clients send `x-key-id` and `x-signature` (hex, as produced by crypt's
`signHMAC` with the key's secret). Cover a timestamp and body digest in
real deployments, and reject stale timestamps at the app layer — see
[Security](../docs/Pact-Security.md).

## Writing your own adapter

The core is two functions from `@tundralibs/pact/middleware`:

```ts ignore
import {
  extractCredential,
  failureResponse,
} from '@tundralibs/pact/middleware';

async function myAdapter(req: MyRequest, res: MyResponse, pass: () => void) {
  const credential = extractCredential({
    method: req.method,
    path: req.pathname,
    header: (name) => req.headers.get(name),
  });
  if (credential === null) return res.send(401, { error: 'NO_CREDENTIALS' });
  try {
    req.auth = await pact.authenticate(credential);
  } catch (error) {
    const failure = failureResponse(error); // null → not pact's error
    if (failure === null) throw error;
    return res.send(failure.status, failure.body);
  }
  pass();
}
```

`extractCredential` needs only `{ method, path, header }`;
`failureResponse` is the complete PactError → status mapping (401 for the
auth-failure codes, 403 `PERMISSION_DENIED`, 409 `USER_EXISTS`, 500
otherwise) and doubles as an app-level error boundary.

---

[← Back to Pact](../README.md)
