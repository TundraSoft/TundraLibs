# Ambient Concepts

How a value survives `await`, and why concurrent requests never see each
other's context.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

## Table of Contents

- [The problem: prop drilling](#the-problem-prop-drilling)
- [The mechanism: AsyncLocalStorage](#the-mechanism-asynclocalstorage)
- [Scopes: run and child](#scopes-run-and-child)
- [The bag is mutable and live](#the-bag-is-mutable-and-live)
- [Nothing throws outside a scope](#nothing-throws-outside-a-scope)
- [Your own stores: createContext](#your-own-stores-createcontext)
- [Runtime requirements](#runtime-requirements)

## The problem: prop drilling

To tag every log line of a request with its id, the id has to _reach_ every
function that logs — which classically means threading it through every
signature in between:

```typescript
type Order = { id: string };

async function handleOrder(reqId: string, order: Order) {
  await chargeCard(reqId, order); // carried
}
async function chargeCard(reqId: string, order: Order) {
  await fraudCheck(reqId, order); // carried again
}
async function fraudCheck(_reqId: string, _order: Order) {}
```

Every intermediate function pays for a value it never uses. Ambient inverts
this: set the context **once** at the boundary, read it **anywhere** below.

```typescript
import { ambient } from '@tundralibs/ambient';

const order = { id: 'ord_42' };
async function handleOrder(_order: { id: string }): Promise<void> {}

ambient.run({ correlationId: crypto.randomUUID() }, () => handleOrder(order));

// five frames deep, after any number of awaits:
ambient.get()?.correlationId;
```

## The mechanism: AsyncLocalStorage

A module-level variable cannot do this: two concurrent requests interleave on
one event loop, so the second `run` would overwrite the first and request A
would read request B's context.

`AsyncLocalStorage` (from `node:async_hooks`, uniform across Deno, Bun and
Node) is "a thread-local, but for async": the value set by `run` follows the
**logical** flow of that call — across `await`, timers, promise chains — and
each concurrent flow sees only its own value.

```typescript
import { ambient } from '@tundralibs/ambient';

const work = async (): Promise<string | undefined> =>
  ambient.get()?.correlationId;

await Promise.all([
  ambient.run({ correlationId: 'A' }, work), // work() sees A
  ambient.run({ correlationId: 'B' }, work), // work() sees B — same code,
]); // same moment, no bleed
```

That isolation property is the entire reason this package exists, and the
reason `tracer` (span parenting) and `slogger` (log correlation) build on it.

## Scopes: run and child

`run(seed, fn)` establishes a fresh context for the duration of `fn`. The seed
is **shallow-copied**, so later mutation via `set` never leaks back into the
caller's object:

```typescript
import { ambient, type RequestContext } from '@tundralibs/ambient';

const seed: RequestContext = { correlationId: 'c1' };
ambient.run(seed, () => ambient.set('userId', 'u1'));
seed.userId; // undefined — the scope worked on a copy
```

`child(patch, fn)` overlays on the inherited context — the parent scope is
untouched once `fn` returns:

```typescript
import { ambient } from '@tundralibs/ambient';

ambient.run({ correlationId: 'c1', tenant: 't1' }, () => {
  ambient.child({ tenant: 't2' }, () => {
    ambient.get()?.tenant; // 't2', correlationId still 'c1'
  });
  ambient.get()?.tenant; // 't1' again
});
```

Outside any scope, `child` behaves like `run` over the patch alone.

> `run()` called again while a scope is already active does **not** merge with
> it — it opens a brand-new bag for `fn`'s duration, so `correlationId` or any
> field added via `set` on the outer scope disappears until the inner `run()`
> returns (the outer bag then reappears untouched). This bites when two
> composed layers each try to open the request scope. `child()` is what
> merges; `ambient.active()` is how to guard against double-opening — see
> [Ambient-Integration](Ambient-Integration.md#opening-the-scope-middleware).

## The bag is mutable and live

`get()` returns the live `RequestContext`, not a snapshot, and
`set()` writes into it. Anything reading later in the same scope — a log line,
an error handler — observes the enrichment:

```typescript
import { ambient } from '@tundralibs/ambient';

const token = 'bearer …';
async function authenticate(_token: string): Promise<string> {
  return 'u_123';
}

ambient.run({ correlationId: 'c1' }, async () => {
  ambient.set('userId', await authenticate(token));
  // every later reader in this scope sees userId
});
```

This is deliberate: request context _accumulates_ (authentication resolves a
user, a router resolves a tenant), and consumers like slogger's
`contextProvider` should see the accumulated state at the moment they read, not
the state at scope creation.

## Nothing throws outside a scope

Every accessor is total, because context is plumbing — it must never be able to
break the code it flows through:

| call outside any `run` | result       |
| ---------------------- | ------------ |
| `ambient.get()`        | `undefined`  |
| `ambient.set(k, v)`    | silent no-op |
| `ambient.active()`     | `false`      |
| `ctx.getOr(fallback)`  | the fallback |

The one place ambient _does_ throw is `createContext` on a runtime
without `AsyncLocalStorage` — a misconfiguration, surfaced loudly at startup
rather than as silently-missing context later.

## Your own stores: createContext

`ambient` is one blessed store with one blessed shape. When you need context
that is not request-shaped — a tenant in a job worker, a transaction handle —
`createContext` gives you an independent, typed store with the same
semantics:

```typescript
import { createContext } from '@tundralibs/ambient';

const tenant = createContext<{ id: string; schema: string }>();

const job = { tenant: { id: 't1', schema: 'tenant_1' }, payload: {} };
async function handle(_payload: unknown): Promise<void> {}

await tenant.run(job.tenant, () => handle(job.payload));

// deep in the data layer:
tenant.getOr({ id: 'public', schema: 'public' }).schema;
```

Distinct stores never observe each other — `tracer` keeps its active span in
its own `createContext` store precisely so span lifecycle stays out of the
shared request bag.

One subtlety: `getOr` falls back only on `undefined`. A stored `null` is a
value, and is returned as-is.

## Runtime requirements

`node:async_hooks` is a **runtime built-in** on Deno, Bun, Node ≥ 22 and
Cloudflare Workers (under `nodejs_compat`) — not an npm dependency, which is why
`dependencies` is empty and the requirement lives in `engines.node` instead.
Ambient resolves it lazily via `process.getBuiltinModule`, so importing the
package is side-effect-free even where it is absent; the guard in
`createContext` turns the ALS-less case into an immediate, actionable error at
first use. A plain browser tab has no `AsyncLocalStorage`, so `run()` / `child()`
throw there — there is no fallback.

A future TC39 `AsyncContext` (a platform-native replacement for
`async_hooks`) would be adopted inside `createContext.ts` — one file, no API
change. See [ROADMAP.md](../ROADMAP.md).
