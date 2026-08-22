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
  `path` + `version` combination twice raises
  `Error: Duplicate route: GET /users (version "v1") is already registered.`
  Different methods or versions on the same path are fine — that's
  how versioned endpoints work — but an exact duplicate is treated as
  a likely bug at the call site rather than silent overwrite.

## Lookup

```ts ignore
router.find(method, path, version?): RouteMatch<M> | undefined

type RouteMatch<M> = {
  middlewares: M[];           // global + route, in registration order
  params: RouteParams;        // Record<string, string>
};
```

`find()` returns `undefined` for misses. The match's `middlewares` is a
fresh array on every call (safe to mutate without affecting the
router's state).

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
