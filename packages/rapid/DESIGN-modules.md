# rAPId modules round — design (2026-08-14)

Status: **SHIPPED 2026-08-15** — `@Module`, `app.module()`, and every
binder source are built and tested (`decorators/module.ts`,
`utils/mountModule.ts`; see ROADMAP.md's "Phase D remainder — MODULES"
for the full changelog). Written after the decorator tier landed, to
settle how decorated classes become live routes / commands / jobs.
Empirically checked where it matters (noted inline) — everything below
matches what actually got built; the subclass-override policy this
doc left open is resolved in ROADMAP.md, not here.

## The boundary (decided — read this first)

**rAPId is a transport adapter, not an application framework.** The
decorators are SUGAR over `app.get()` / `app.socket()` / `app.job()`:
the same registration core, authored on the class instead of at the
call site.

What that means, concretely:

- A module is just code. Write it with DI or without, with an event
  bus or without, calling other modules however it likes — **none of
  that touches rapid, ever**. Not "out of scope for now": out of
  scope permanently. Lifecycle and wiring belong to whatever owns
  modules.
- **rAPId never constructs anything.** It takes an INSTANCE you built
  and binds its decorated methods to transports. No `new` inside the
  framework, no resolver seam to configure, no container to teach it
  about.
- rAPId makes exactly ONE demand of a method: the shape of what it
  returns ({@link RapidModuleReply}), because that is the one thing
  that must become a response.

A decorated class does import the decorators — that is the wire that
makes the binding possible, and it is expected. What matters is that
the import is INERT: decorators are metadata-only and never wrap the
method, so `new Users(db).find('7')` runs in a unit test with no app,
no server, and no rapid runtime. That independence is a property to
TEST, not just to claim.

## The three problems this has to solve

1. **Iteration.** The decoration registry is a `WeakMap` keyed by the
   method function — deliberately, because a TC39 method decorator
   never sees the class. A `WeakMap` cannot be enumerated, so "cycle
   through the registry at start()" is not directly possible.
2. **Instantiation.** A method decorator records a FUNCTION. Invoking
   it needs `instance.method(...)` — someone must call `new`, and
   method decorators cannot know the constructor.
3. **Isolation.** Anything process-global is shared by every
   `Application` in that process. Our own test suite builds dozens per
   run; an imported module file would leak its routes into all of them.

## The resolution: never iterate the registry — iterate what the caller hands us

The elegant move is to notice that (1) and (3) are the same problem,
and both disappear if the framework never asks "what has been
decorated?" and instead asks "what did you give me?".

`await import('./modules/users.ts')` returns a **module namespace
object**, and that object IS enumerable. So the caller's own import is
the discovery mechanism — no global list, no retention, no leakage.

VERIFIED on Deno 2.9.4, Bun 1.3.14 and Node 26 (tsx), identical on all
three (`scratchpad/nsprobe`):

- `Object.keys(ns)` / `Object.entries(ns)` enumerate the exports.
- Picking decorated classes out of a namespace via a
  `WeakMap`-by-constructor lookup works.
- A SECOND `import()` of the same file is a cache hit — the module body
  does NOT re-run, so decorators do not re-fire — but the namespace is
  the same object and still resolves. **This is why namespace scanning
  beats side-effect registration**: a second Application can attach the
  same module, which a drain-on-consume global list could never do.

So:

```ts
// registry.ts — two tiers, both weak, neither enumerated
const DECORATIONS = new WeakMap<object, RapidDecoration[]>(); // method fn → routes/commands/jobs
const MODULES = new WeakMap<object, RapidModuleMeta>(); // constructor → prefix/version/…
```

## The API

Shipped exactly as below MINUS `version` — `@Module`/`@GET` only take
`prefix` today; the versioning half of this example is the design this
round scoped out (see "What was open here").

```ts
@Module({ prefix: '/users', version: '2' })
class Users {
  constructor(private readonly db: Db) {}

  @GET('/:id:', { bind: [param('id')] })
  find(id: string): RapidContextResponse { … }

  @SOCKET('users.get', { bind: [param('id')] })
  @JOB('user-sync', '0 * * * *')
  sync(): RapidContextResponse { … }
}
```

Registration takes INSTANCES — you construct them however your module
system does, rapid only binds them:

```ts
app.module(new Users(db)); // the plain case
app.module(container.get(Users)); // a DI container built it
app.module(usersInstance, ordersInstance); // several at once
```

Both funnel into one internal path: prototype-walk the instance → read
`DECORATIONS` per method → register onto the same core `app.get()` /
`app.socket()` / `app.job()` uses. Explicit at every level, so two
Applications never see each other's modules and tests stay isolated.

A namespace/directory sugar (`app.modules(await import(...))`,
`app.discover('./modules')`) is possible on top — the namespace-scan
mechanism is verified below — but it needs a convention for how a file
hands over an INSTANCE (export a built one, or export a factory).
Deferred until the instance convention is decided; nothing below
depends on it.

`@Module` claiming: method decorators run BEFORE the class decorator
(elements first, then class), so `@GET` has already recorded into
`DECORATIONS` by the time `@Module` runs — `@Module` only needs to
record the class meta. No pending-bucket handoff required.

## Prefix

`prefix` is joined onto every HTTP path in the class, normalised for
slashes (radrouter is lenient on registration: `/api//users` →
`/api/users`).

Prefix params work for free — `@Module({ prefix: '/tenants/:tid:' })`
means any method may `bind: [param('tid')]`, because radrouter extracts
params from the whole matched path.

Prefix applies to HTTP paths ONLY. Socket commands and job names are
flat namespaces, not paths; if we later want `users.get` to become
`users.users.get`, that is a separate, explicit decision.

## Versioning (radrouter's, unlocked)

Radrouter already carries versions as a dimension SEPARATE from the
path:

```
addRoute(method, path, middlewares, version?)
find(method, path, version?)
resolution: exact requested version → configured defaultVersion → unversioned slot
```

So `/users/:id:` v1 and v2 are the SAME path with two handlers — not
two paths. rAPId therefore has to answer one question radrouter cannot:
**where does an inbound request declare its version?**

Proposed: a configurable header, because a `/v1/...` path prefix would
bypass the version dimension entirely and just be two paths.

```yaml
server:
  versioning:
    header: x-api-version # default; `accept-version` also common
    default: '1' # → RadRouter's defaultVersion
```

- `@Module({ version })` sets the default for its routes.
- `@GET(path, { version })` overrides per route.
- Neither set → the unversioned slot, exactly as today. **Purely
  additive**: every existing route keeps working.

Two cautions:

- Duplicate detection is per `method + path + version`, so a collision
  is loud at start() — good — but a route silently inheriting the
  module version is easy to miss. Log the resolved
  `method + path + version` table at boot (debug level).
- The version is caller-supplied input. It is used as a map key only
  (never a path), but it should still be length/charset-capped like
  `requestId` before being logged.

## Instantiation and dependencies — NOT rapid's

rAPId never calls `new`. It is handed instances. Whether those come
from `new Users(db)`, a DI container, a factory, or a module system's
own lifecycle is invisible to the framework, by design.

This closes the DI question permanently AS FAR AS RAPID IS CONCERNED:
there is no `@Inject` in rapid, no container, no resolver hook to
configure. A module system that wants DI implements it; rapid binds
whatever instance comes out.

(For the record, since it came up: `@tundralibs/doctor` — the suite's
DI package — is built on `emitDecoratorMetadata`'s `design:type`,
which has no standard-decorator equivalent. Upgrading it means making
tokens explicit (`@Dose(Logger)` instead of `@Dose()`), which is a
doctor 2.0 decision on its own merits — it would also drop the
`reflect-metadata` global patch, a win for Workers/browser. Rapid does
not need that to happen either way. Note the explicit token adds NO
import burden: `emitDecoratorMetadata` already emits `Reflect.metadata
("design:type", Logger)`, so the class was always retained as a
runtime import.)

## What is still open (NOT decided here)

## What was open here, and how it resolved (2026-08-15)

- **`payload()` binder semantics off HTTP — RESOLVED, no new code
  needed.** The Context layer already made `await ctx.payload` uniform
  (HTTP's cached parse promise, SOCKET's frame value, `undefined` on
  JOB — awaiting a non-promise passes through). The binder tier just
  calls it.
- **The reply envelope key — RESOLVED: `content`.** `RapidModuleReply`
  already rode `RapidContextResponse`, whose `content` field is
  universal and the type is closed (no index signature — a typo'd key
  is a compile error). Switching to `payload` would have collided with
  `ctx.payload` (the INBOUND body) meaning something different on the
  SAME context object; every test in the suite already writes
  `{ content: ... }`. No type swap was needed.
- **Decorated-then-overridden subclass method — RESOLVED: reject
  loudly**, not silent dedupe. Silently keeping the base's registration
  would bind a route to a method the instance no longer runs — the
  same "silently lost" failure family `registry.ts`'s own
  wrapping-decorator caveat already warns against. The algorithm (walk
  the prototype chain top-down, compare each decorated ancestor
  function against `instance[name]`'s actual resolution) is in
  `utils/mountModule.ts`; both the reject case and the legitimate
  re-decorated-override case are test-covered.
- **Error-registry extension — DEFERRED**, not built: plain throws
  already become a generic 500 through the framework's existing
  disclosure envelope, so shipping the mount tier didn't need it.
- **Auth-context handoff — still genuinely undesigned.** The binder
  tier makes no assumption about `state.principal`; nothing added in
  this round references it.
- **Versioning** (`@Module({ version })` / `@GET(path, { version })`)
  was scoped OUT of this pass entirely — it is additive on top of the
  mount mechanism, not a prerequisite for it, and needs its own design
  round (new `server.versioning` config, a request-side version-header
  read, threading a version param through `route()`/radrouter). No
  `version` option exists on `@Module`/`@GET` today.
