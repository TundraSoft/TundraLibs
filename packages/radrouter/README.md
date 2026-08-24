# RadRouter

Compressed radix-tree HTTP router. Trie-based lookup, typed parameter
patterns, greedy segments, versioned endpoints, and a structurally
agnostic middleware slot.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

Pure trie lookup with no I/O of its own — routing decisions for a
request object, not a listener — so it runs unchanged on Workers and
in the browser; pair it with whatever fetch handler your target
actually uses.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Documentation](#documentation)
- [When to use this](#when-to-use-this)
- [When not to use this](#when-not-to-use-this)

## Overview

A path-compressed trie router. Static nodes hold multi-character labels
(so `/api/v1/users` and `/api/v1/posts` share `/api/v1/` as a single
node and split lazily on insert). Lookup walks the URL string with one
integer cursor — no `path.split('/')` allocation, no `Map.get()` per
segment.

`RadRouter` is structurally agnostic — it stores and dispatches
middleware functions but never reads `ctx`. Consumers define a typed
middleware alias and supply it as the `M` type parameter; that type
flows through every chain entry so a misshapen middleware fails to
register.

## Installation

**Deno:**

```bash
deno add @tundralibs/radrouter
```

**Bun:**

```bash
bunx jsr add @tundralibs/radrouter
```

**Node.js:**

```bash
npx jsr add @tundralibs/radrouter
```

## Quick start

```ts
import { RadRouter } from '@tundralibs/radrouter';

// Define your application's per-request context shape and the
// middleware type that wraps it. RadRouter is parameterised over
// the middleware type — your context flows through every chain
// entry automatically.
type AppCtx = {
  request: Request;
  state: { user?: string; requestId: string };
};
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const router = new RadRouter<AppMw>();

const auth: AppMw = async (ctx, next) => {
  ctx.state.user = ctx.request.headers.get('x-user') ?? undefined;
  await next();
};

const getUser: AppMw = async (ctx, _next) => {
  // Inside the handler, ctx is typed AppCtx end-to-end.
  console.log('user:', ctx.state.user);
};

router.use(auth);
router.get('/users/:id:', [getUser]);

// Lookup
const match = router.find('GET', '/users/42');
if (match) {
  console.log(match.params); // { id: '42' }
  console.log(match.middlewares); // [auth, getUser]
}
```

## Documentation

| Topic                                                      | Description                                                              |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| [Patterns](docs/RadRouter-Patterns.md)                     | Variable, suffix-literal, and greedy patterns; matching priority         |
| [Routing](docs/RadRouter-Routing.md)                       | Versioned endpoints, case sensitivity, slash handling                    |
| [API](docs/RadRouter-API.md)                               | Full reference: constructor, registration, lookup, maintenance, errors   |
| [Wire-up](docs/RadRouter-WireUp.md)                        | Integration with `compat/webserver`, Express, Oak                        |
| [Performance](docs/RadRouter-Performance.md)               | Benchmarks: per-shape, case-mode, router shootout                        |
| [Tracing](../tracer/docs/Tracer-Recipes.md#radrouter--rpc) | Ready-made `@tundralibs/tracer` middleware for RadRouter's generic chain |

## When to use this

- You want a **typed** router with zero runtime overhead from
  decorators / metadata-reflect / etc.
- You want **versioned endpoints** as a first-class concept (most
  routers force you to encode the version into the path).
- You want **greedy patterns** (`:name:-*`, `*-:name:`, literal
  suffixes) without falling back to regex.
- You want **structural agnosticism** — `RadRouter` doesn't dictate
  what your context looks like or how middleware runs; it just hands
  you the chain.

## When not to use this

- You want a full HTTP framework. RadRouter does **routing only** —
  no request parser, no response builder, no body validation, no
  WebSocket. Compose with `@tundralibs/compat/webserver`,
  `@tundralibs/guardian`, etc.
- You need regex parameter constraints (`/users/:id(\d+)`).
  RadRouter's parameter patterns are deliberately string-only — add
  a validation middleware if you need typed param shapes.
