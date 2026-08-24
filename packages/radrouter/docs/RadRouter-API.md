# API reference

Full surface of `@tundralibs/radrouter`. For runtime semantics see
[Patterns](RadRouter-Patterns.md) and
[Routing](RadRouter-Routing.md).

## Table of Contents

- [Constructor](#constructor)
- [Typed middleware](#typed-middleware)
- [Registration](#registration)
- [Lookup](#lookup)
- [Maintenance](#maintenance)
- [Errors](#errors)
- [Types](#types)

## Constructor

```ts ignore
new RadRouter<M = Middleware>(options?: RouterOptions)
```

```ts
type RouterOptions = {
  /**
   * Version treated as "current"; lookups for this version OR
   * undefined hit the same handlers.
   */
  defaultVersion?: string;
  /**
   * RFC 3986 default; set to false for forgiving matching.
   */
  caseSensitive?: boolean;
  /**
   * Default true: `/users/` registers and matches as `/users`. Set to
   * false to make the trailing slash significant.
   */
  ignoreTrailingSlash?: boolean;
};
```

## Typed middleware

`M` is the middleware function type the router stores. The default is
the unconstrained `Middleware` (`(ctx: unknown, next) => Promise<void>`).
Typed-shape consumers narrow it by declaring their own alias and
passing it as the type argument:

```ts
import { RadRouter } from '@tundralibs/radrouter';

type AppCtx = { request: Request; state: Record<string, unknown> };
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const router = new RadRouter<AppMw>();
```

After narrowing, every middleware list passed to `.use()`, `.get()`,
`.post()` etc. is type-checked against `AppMw`. A misshapen middleware
fails to register at compile time.

## Registration

```ts ignore
router.use(middleware);                                         // global middleware
router.addRoute(method, path, middlewares, version?);           // generic
router.get(path, middlewares, version?);                        // ← shorthand for each method
router.post(path, middlewares, version?);
router.put(path, middlewares, version?);
router.delete(path, middlewares, version?);
router.patch(path, middlewares, version?);
router.head(path, middlewares, version?);
router.options(path, middlewares, version?);
```

- `middlewares` is an array. Global `.use()` middlewares run first on
  every match; route-specific ones run after.
- `version` is any string. Omit to register as the "unversioned" slot
  for the path.
- The shorthands cover seven methods. `TRACE` and `CONNECT` are also
  valid `HTTPMethod`s but have no shorthand — register them with the
  generic `addRoute('TRACE', path, …)` / `addRoute('CONNECT', path, …)`.
- **Registering an empty path (`''`) throws** `MalformedPathError`.
  Use `'/'` for the root route; `''` would attach a handler no lookup
  can reach.
- **Duplicate registrations throw.** Registering the same `method` +
  `path` + `version` combination twice raises a `DuplicateRouteError`:
  `Duplicate route: GET /users (version "v1") is already registered.`
  Different methods or versions on the same path are fine — that's
  how versioned endpoints work — but an exact duplicate is treated as
  a likely bug at the call site rather than silent overwrite. See
  [Errors](#errors).

## Lookup

```ts ignore
router.find(method, path, version?): RouteMatch<M> | undefined
router.allowedMethods(path, version?): HTTPMethod[]

type RouteMatch<M> = {
  middlewares: M[];           // global + route, in registration order
  params: RouteParams;        // Record<string, string>
};
```

`find()` returns `undefined` for misses. The match's `middlewares` is a
fresh array on every call (safe to mutate without affecting the
router's state). Captured values are percent-decoded once, and a
malformed percent-escape is treated as a miss rather than a thrown
`URIError` — `find()` never throws. See [Patterns → Percent-decoding of
captured values](RadRouter-Patterns.md#percent-decoding-of-captured-values).

### `params` is a null-prototype object

`match.params` is created with `Object.create(null)`, **not** a plain
`{}`. Param names may collide with `Object.prototype` members
(`constructor`, `hasOwnProperty`, `__proto__`, … — all valid under the
`[A-Za-z_]\w*` rule), and a null prototype keeps every capture a plain
own string entry instead of shadowing a builtin or being swallowed by the
`__proto__` setter. This is a deliberate safety property.

The trade-off is that `params` inherits **no** `Object.prototype`
methods. These **throw `TypeError`** (or read as `undefined`):

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/users/:id:', []);
const match = router.find('GET', '/users/value')!;

match.params.hasOwnProperty('id'); // TypeError: not a function
match.params.toString(); // TypeError: not a function
String(match.params); // TypeError: cannot convert to primitive
`${match.params}`; // TypeError: cannot convert to primitive
match.params.constructor; // undefined
```

Read `params` as data — all of these work:

```ts
import { RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/users/:id:', []);
const match = router.find('GET', '/users/value')!;

match.params.id; // 'value'
'id' in match.params; // true
Object.keys(match.params); // ['id']
Object.entries(match.params); // [['id', 'value']]
JSON.stringify(match.params); // '{"id":"value"}'
Object.prototype.hasOwnProperty.call(match.params, 'id'); // true
```

### `allowedMethods()` — building a 405 response

`find()` returning `undefined` doesn't say whether the _path_ is
unknown or just the _method_ is wrong. `allowedMethods(path, version?)`
answers that directly: every `HTTPMethod` for which `find(method, path,
version)` would succeed, using the identical version fallback and trie
backtracking as `find` itself — its result is guaranteed consistent
with `find`, not a hand-maintained approximation.

```ts
import { type HTTPMethod, RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/users/:id:', []);
router.post('/users/:id:', []);

router.allowedMethods('/users/42'); // ['GET', 'POST']
router.allowedMethods('/nonexistent'); // [] — no route at all

const onMiss = (path: string): Response => {
  const allowed = router.allowedMethods(path);
  if (allowed.length === 0) {
    return new Response('Not Found', { status: 404 });
  }
  return new Response('Method Not Allowed', {
    status: 405,
    headers: { Allow: allowed.join(', ') },
  });
};
```

> **A path can answer different methods from different trie nodes.** A
> static `/users/me` (GET) and a param `/users/:id:` (POST) both match
> the concrete request `/users/me` — `find` seats each on its own node
> via backtracking. `allowedMethods` re-runs that same backtracking
> search once per `HTTPMethod` (9 probes, not one walk), so it reports
> the true union rather than whatever the first-matched node happens to
> expose. Call it only on a miss, not on every request — it's O(9)
> lookups instead of 1.
>
> The 9 probes are the full `HTTPMethod` union, including `TRACE` and
> `CONNECT` (which have no `.trace()`/`.connect()` shorthand — see
> [Registration](#registration)). Prefer `allowedMethods()` over
> hand-rolling a `GET`/`POST`/… list so a route registered via
> `addRoute('TRACE', …)` doesn't silently vanish from your `Allow`
> header.

## Maintenance

```ts ignore
router.clear({ keepGlobalMiddlewares?: boolean });
router.getStats();   // { totalRoutes, totalNodes }
```

- `clear()` removes every registered route. With
  `keepGlobalMiddlewares: true`, the `.use()` registrations survive.
- `getStats()` reports `totalRoutes` (every method × version
  combination) and `totalNodes` (trie size). Useful for inspecting
  whether the trie is collapsing prefixes effectively.

## Errors

Every throw from `addRoute` (and its method shorthands) is a
`RadRouterError` subclass carrying typed `error.context`. Import them
from the root export — `errors/mod.ts` is re-exported through
`mod.ts` — or `@tundralibs/radrouter/errors` directly.

| Error                 | Thrown when                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MalformedPathError`  | The path is empty, a `:`-segment doesn't match one of the four forms in [Patterns](RadRouter-Patterns.md), a param name fails `[A-Za-z_]\w*`, or a greedy-suffix segment (`:name:-*`) is followed by more segments. |
| `RouteConflictError`  | Two different parameter bindings (name, suffix, or greedy kind) would have to share the same trie position.                                                                                                         |
| `DuplicateRouteError` | The exact `method` + `path` + `version` triple is already registered.                                                                                                                                               |

### `RouteConflictError` — same trie position, different binding

Two registrations can only share a trie position if their parameter
binding is identical. `/users/:id:` and `/users/:userId:` both bind
the segment after `/users/` — same position, different name — so the
second call throws rather than silently shadowing the first:

```ts
import { RadRouter, RouteConflictError } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/users/:id:', []);

try {
  router.get('/users/:userId:', []); // same position, different name
} catch (e) {
  if (e instanceof RouteConflictError) {
    console.error(e.context.existingParamName); // 'id'
    console.error(e.context.newParamName); // 'userId'
  }
}
```

> **This also fires across suffix and greedy siblings** — two
> `:name:<literal>` registrations sharing a suffix with different
> names, or a `:name:-*` / `*-:name:` pair at the same node, throw the
> same way. It is a real hazard for a plugin/module system that
> composes routes from independent registration calls: pick one
> parameter name per trie position across the whole route set — the
> router refuses to guess which caller's name should win, rather than
> letting the last registration silently shadow the first.

### `DuplicateRouteError` — re-registering the same slot

```ts
import { DuplicateRouteError, RadRouter } from '@tundralibs/radrouter';

const router = new RadRouter();
router.get('/health', []);

try {
  router.get('/health', []); // same method + path + version
} catch (e) {
  if (e instanceof DuplicateRouteError) {
    console.error(e.context); // { method: 'GET', path: '/health' }
  }
}
```

Different methods or versions on the same path compose normally —
only an exact `method` + `path` + `version` repeat throws.

## Types

The package re-exports every type you need to write a typed
integration:

```ts
import type {
  ClearOptions,
  HTTPMethod,
  Middleware,
  RouteHandler,
  RouteMatch,
  RouteParams,
  RouterOptions,
} from '@tundralibs/radrouter';
```

- `HTTPMethod` — `'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'TRACE' | 'CONNECT'`.
  Re-exported from `@tundralibs/compat/http` so server-side packages
  share one definition. The first seven have shorthand helpers
  (`.get()`, `.post()`, …); `TRACE` and `CONNECT` have no shorthand and
  are registered via `addRoute('TRACE', …)` / `addRoute('CONNECT', …)`.
- `Middleware` — the default unconstrained middleware shape; consumers
  with a typed `ctx` define their own alias and parameterise the
  router over it.

---

[← Back to RadRouter](../README.md)
