# Wire-up

`RadRouter` is structurally agnostic — it doesn't open a socket, parse
requests, or write responses. The consumer composes the lookup with
their own server and runs the middleware chain however they like.

## Table of Contents

- [With `@tundralibs/compat/webserver`](#with-tundralibscompatwebserver)
- [With Express](#with-express)
- [With Oak](#with-oak)
- [Middleware chain composition](#middleware-chain-composition)
- [Method discovery on miss](#method-discovery-on-miss)
- [More examples](#more-examples)

## With `@tundralibs/compat/webserver`

The canonical integration. Construct the router once at module scope,
look up on every request, run the resulting chain against a per-request
context object you own.

```ts
// Needs a separate install: deno add @tundralibs/compat
import { WebServer } from '@tundralibs/compat/webserver';
import { RadRouter } from '@tundralibs/radrouter';
// Needs a separate install: deno add @tundralibs/compat
import type { HTTPMethod } from '@tundralibs/compat/http';

type AppCtx = {
  request: Request;
  response: Response;
  state: Record<string, unknown>;
};
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const router = new RadRouter<AppMw>();

router.get('/health', [(ctx, next) => {
  ctx.response = new Response('ok');
  return next();
}]);

const server = new WebServer<unknown>('API', {
  mode: 'TCP',
  port: 8080,
  handler: async (request) => {
    const match = router.find(
      request.method as HTTPMethod,
      new URL(request.url).pathname,
    );
    if (!match) return new Response('Not Found', { status: 404 });

    const ctx: AppCtx = { request, response: new Response(), state: {} };
    let i = 0;
    const next = async () => {
      const mw = match.middlewares[i++];
      if (mw) await mw(ctx, next);
    };
    await next();
    return ctx.response;
  },
});
await server.start();
```

See [`examples/`](../examples/) for runnable variants.

## With Express

Express middleware is `(req, res, next) => void` with a sync-style
`next()` callback. Parameterise `RadRouter<M>` with that shape and
write one app-level adapter that calls `router.find()` and runs the
chain. Errors bubble up via `next(err)` per Express convention:

```ts
// Deno resolves Express via the `npm:` specifier; under plain
// Node/Bun use a bare `from 'express'` instead.
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'npm:express@^4.21.0';
import { type HTTPMethod, RadRouter } from '@tundralibs/radrouter';

type ExpressMw = (req: Request, res: Response, next: NextFunction) => void;

const router = new RadRouter<ExpressMw>();
router.get('/users/:id:', [(req, res) => {
  res.json({ id: (req as any).radParams.id });
}]);

const radHandler: ExpressMw = (req, res, next) => {
  const match = router.find(req.method as HTTPMethod, req.path);
  if (!match) return next(); // pass through to Express's default 404
  (req as any).radParams = match.params;

  let i = 0;
  const run = (err?: unknown) => {
    if (err) return next(err);
    const mw = match.middlewares[i++];
    if (!mw) return next();
    try {
      mw(req, res, run);
    } catch (e) {
      next(e);
    }
  };
  run();
};

express().use(radHandler).listen(8080);
```

Captured params land on `match.params` — the adapter stashes them on
`req.radParams` because Express owns `req.params` itself.

Full runnable file: [`examples/with-express.ts`](../examples/with-express.ts).

## With Oak

Oak's middleware signature is `(ctx, next) => Promise<void>` — the
same shape as RadRouter's default `Middleware` — so the adapter is
essentially a chain runner. Captured params live in `ctx.state`:

```ts
import { Application, type Middleware as OakMw } from 'jsr:@oak/oak@^17.1.4';
import { type HTTPMethod, RadRouter } from '@tundralibs/radrouter';

type AppState = { radParams: Record<string, string> };
type AppMw = OakMw<AppState>;

const router = new RadRouter<AppMw>();
router.get('/users/:id:', [async (ctx) => {
  ctx.response.body = { id: ctx.state.radParams.id };
}]);

const radHandler: AppMw = async (ctx, next) => {
  const match = router.find(
    ctx.request.method as HTTPMethod,
    ctx.request.url.pathname,
  );
  if (!match) {
    await next();
    return;
  }
  ctx.state.radParams = match.params;

  let i = 0;
  const run = async (): Promise<void> => {
    const mw = match.middlewares[i++];
    if (!mw) {
      await next();
      return;
    }
    await mw(ctx, run);
  };
  await run();
};

const app = new Application<AppState>();
app.use(radHandler);
await app.listen({ port: 8080 });
```

Full runnable file: [`examples/with-oak.ts`](../examples/with-oak.ts).

## Middleware chain composition

The `next()` recursion in the snippet above is a four-line pattern, but
it's worth understanding the contract:

- Each middleware **must** call `next()` exactly once to advance the
  chain (or skip the call to short-circuit).
- Throws bubble up; the consumer's outer error handler catches them.
  RadRouter never sees the throw.
- After `next()` returns, the rest of the middleware can mutate `ctx`
  for post-processing (response logging, metrics, response-header
  injection).

```ts
type AppCtx = { response: Response };
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const timing: AppMw = async (ctx, next) => {
  const start = performance.now();
  await next();
  ctx.response.headers.set('x-elapsed-ms', String(performance.now() - start));
};
```

## Method discovery on miss

`router.find('POST', '/users/42')` returning `undefined` doesn't tell
the caller whether the path is wrong or just the method is wrong. Use
`router.allowedMethods(path)` for a `405 Method Not Allowed` on path
matches with mismatched methods — it probes the full `HTTPMethod`
union (including `TRACE`/`CONNECT`, which have no shorthand) using the
same lookup and version fallback as `find`, so a route registered via
`addRoute('TRACE', …)` can't silently vanish from a hand-maintained
method list. See
[API → `allowedMethods()`](RadRouter-API.md#allowedmethods--building-a-405-response):

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();

const onMiss = (pathname: string): Response => {
  const allowed = router.allowedMethods(pathname);
  if (allowed.length) {
    return new Response('Method Not Allowed', {
      status: 405,
      headers: { Allow: allowed.join(', ') },
    });
  }
  return new Response('Not Found', { status: 404 });
};
```

This is 9 lookups instead of 1; do it only on miss, not on every
request. Each probe is constant-time relative to path length.

## More examples

- [`examples/basic.ts`](../examples/basic.ts) — quick start with one
  typed middleware
- [`examples/versioned-api.ts`](../examples/versioned-api.ts) —
  multiple API versions sharing the same router
- [`examples/static-assets.ts`](../examples/static-assets.ts) —
  greedy-suffix mount for file trees
- [`examples/with-webserver.ts`](../examples/with-webserver.ts) —
  canonical wire-up against `@tundralibs/compat/webserver`
- [`examples/with-express.ts`](../examples/with-express.ts) —
  Express 4/5 integration via an adapter middleware
- [`examples/with-oak.ts`](../examples/with-oak.ts) — Oak integration
  (Deno), with captured params on `ctx.state.radParams`

---

[← Back to RadRouter](../README.md)
