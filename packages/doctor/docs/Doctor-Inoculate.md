# @Inoculate

Class decorator that wraps the constructor so every `new` call
automatically treats the new instance.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript
@Inoculate(scope?: string)
class MyHandler { ... }
```

The wrapped constructor:

1. Calls the original constructor (forwarding arguments).
2. Calls `Doctor.treat(instance, scope)` to fill `@Dose`
   properties — on a direct `new WrappedClass()` **and** on a plain
   subclass (at any depth) that adds no `@Dose` of its own, but never
   mid-`super()` while any more-derived level is still initializing its
   own `@Dose` fields (see [Subclassing](#subclassing)).
3. Returns the treated instance.

The decorator preserves `instanceof`, static members, and
`constructor.name`.

## Scope handling

The `scope` argument is captured **at decoration time** and reused
for every `new` call on this class. For per-instance scope (typical
web-request handlers), use `Doctor.resolve` instead — it constructs
the class with a caller-supplied scope and treats it once, without a
second decoration-time treat: on a directly wrapped class it unwraps
the wrapper, and on a subclass of a wrapped base it suppresses the
wrapper's auto-treat **for that exact construction only** — an unrelated
`new SomeInoculated()` performed meanwhile (say, a _collaborator_ built
inside a `@Vial` factory) still auto-treats normally (see
[Subclassing](#subclassing) below).

```typescript
// Decoration-time default scope:
@Inoculate('background-job')
class JobRunner {
  @Dose()
  public db!: Database;
}
new JobRunner(); // → injected under 'background-job'

// Per-call scope:
class RequestHandler {
  @Dose()
  public db!: Database;
}
const h = Doctor.resolve(RequestHandler, `req-${reqId}`);
```

### Returning an `@Inoculate`d instance from a `@Vial` factory

A registered [`@Vial` factory](./Doctor-Vial.md#factory-hook) is Doctor's
construction mechanism for that vial. When the factory body does
`new SomeInoculated()` and **returns that instance**, the wrapper's
auto-treat and the driving `dispense`/`resolve` do not both fire — the
instance is treated **exactly once**:

- The class's **own decoration scope wins** when it has one; otherwise the
  **operation's scope** (the one passed to `dispense`/`resolve`) fills in,
  so a factory returning an `@Inoculate()` instance whose `@Dose` is
  SCOPED resolves under the caller's scope rather than throwing
  [`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror).
- A dependency is built **once** — no orphaned first copy of a TRANSIENT
  `@Dose`.

The operation-scope fallback is applied **only to the value the factory
returns**, and it is applied _after_ the factory returns. A return value
whose SCOPED `@Dose` needs the fallback therefore has those fields filled
in only once the factory has returned — not while the factory body is
still running.

```typescript
@Vial('SCOPED')
class Db {/* ... */}

@Inoculate() // no decoration scope — the operation scope fills in
class Repo {
  @Dose()
  public db!: Db; // SCOPED
}

@Vial({ mode: 'SINGLETON', factory: () => new Repo() })
class RepoProvider {}

Doctor.dispense(RepoProvider, 'req-1'); // Repo.db resolved under 'req-1', treated once
```

**A collaborator the factory builds but does _not_ return** (e.g.
`() => ({ repo: new Repo() })`, or a helper `new`ed for its side effects)
is treated on its own `new` under **its own decoration scope only** — it
**never** inherits the operation scope. It behaves exactly as it would
outside a factory:

- With a resolvable `@Dose` (SINGLETON/TRANSIENT, or a SCOPED dep plus its
  own decoration scope), it is injected on `new`, ready to use in the
  factory body.
- With a SCOPED `@Dose` and **no** decoration scope of its own, it throws
  [`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror) —
  it is not the returned value, so the operation-scope fallback is not its
  to take. Give such a collaborator its own `@Inoculate('scope')`, or
  return it from the factory, if it genuinely needs a scope.

```typescript
@Inoculate() // no decoration scope
class Repo {
  @Dose()
  public db!: Db; // SCOPED
}

// Repo is a NON-returned collaborator here → it does NOT get 'req-1';
// this throws ScopeRequiredError, exactly as a bare `new Repo()` would.
@Vial({ mode: 'SINGLETON', factory: () => ({ repo: new Repo() }) })
class RepoHolderProvider {}

Doctor.dispense(RepoHolderProvider, 'req-1'); // throws ScopeRequiredError
```

## Subclassing

How a subclass of an `@Inoculate`d base is injected depends on whether
any level **more derived than the base** adds its own `@Dose` fields.
The base wrapper runs as `super()`, so it fires before every subclass
field initializer at every level — the rule is the same whether the
extra `@Dose` sits on a direct subclass or on an intermediate class in a
deeper chain.

**A plain subclass that adds no `@Dose` of its own** — at any depth
(`Leaf extends Mid extends BaseHandler`, where every level below the base
is plain) — is auto-injected on `new`. The base's `@Dose`
fields are set inside `super()` and no later field initializer
overwrites them, so the base wrapper treats the instance — with the
base's decoration-time scope, which the subclass therefore inherits
automatically:

```typescript
@Inoculate('background-job')
class BaseHandler {
  @Dose()
  public db!: Database; // SCOPED
}

class ReportHandler extends BaseHandler {} // no @Dose, no @Inoculate
new ReportHandler(); // → db injected under 'background-job'
```

**A class that adds its own `@Dose` fields** must carry its own
`@Inoculate` at that level. Those fields initialize _after_ `super()`,
so treating them in the base wrapper (which runs as `super()`) would
fill each and then have the field initializer immediately re-define it
to `undefined` — a silent half-injection. Its own wrapper treats once,
after every field (base and subclass) has initialized. Because that
wrapper captures its **own** `scope` argument, **repeat the base's scope
on it** — a bare `@Inoculate()` treats with no scope, so a SCOPED base
dependency throws
[`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror):

```typescript
@Inoculate('background-job') // repeat the base's scope — its own wrapper
class ReportHandler extends BaseHandler {
  @Dose()
  public reports!: ReportService;
}
new ReportHandler(); // → both db and reports injected under 'background-job'
```

A class with its own `@Dose` but **no** `@Inoculate` is not
auto-injected by `new` — it is all-or-nothing (never a silently partial
instance), so a missing decorator is obvious rather than a half-built
object. This holds at any depth: if an **intermediate** class adds
`@Dose` without its own `@Inoculate`, `new Leaf()` on a plain leaf below
it injects nothing — inject the whole chain through `Doctor.resolve`, or
add `@Inoculate` to the level that declares the extra `@Dose`:

```typescript
@Inoculate()
class Base {
  @Dose()
  a!: DepA;
}
class Mid extends Base {
  @Dose()
  b!: DepB; // own @Dose, but no @Inoculate — misuse
}
class Leaf extends Mid {}

new Leaf(); // → all-or-nothing: neither a nor b injected
Doctor.resolve(Leaf); // → both a and b injected (treats after construction)
```

A well-formed multi-level chain carries `@Inoculate` at every level that
adds `@Dose`; only the most-derived wrapper treats, once, after every
field has initialized, so each level's dependency is injected exactly
once.

**Per-call scope** — when the scope varies per instance, skip the
subclass decorator and construct through `Doctor.resolve` (or
`Doctor.dispense` for a registered vial), which treat after
construction completes and take a caller-supplied scope:

```typescript
class RequestHandler extends BaseHandler {}
const h = Doctor.resolve(RequestHandler, `req-${reqId}`);
// → db injected under `req-${reqId}`
```

## Example

```typescript
@Inoculate('request-1')
class UserHandler {
  @Dose()
  public db!: Database;
  @Dose()
  public logger!: Logger;
}

const handler = new UserHandler();
handler.db.query('SELECT 1');
```

## Throws

At `new` time, propagated from `Doctor.treat`:

- [`UnregisteredVialError`](../errors/Doctor-Errors.md#unregisteredvialerror)
  — required `@Dose` dependency has no registered vial.
- [`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror)
  — a required `@Dose` dependency is SCOPED but the decorator was
  invoked as `@Inoculate()` (no default scope).

## See in context

The [cli-tool example](../examples/cli-tool/) uses `@Inoculate()`
on every command — see
[`HelloCommand.ts`](../examples/cli-tool/commands/HelloCommand.ts)
and [`StatsCommand.ts`](../examples/cli-tool/commands/StatsCommand.ts).
Each command runs with plain `new HelloCommand()`, and the wrapper
fills in the `@Dose` properties via singletons. No scope is needed
because every dependency is a SINGLETON.

The [web-app example](../examples/web-app/) deliberately _avoids_
`@Inoculate` on its `UserHandler` and uses
`Doctor.resolve(UserHandler, scopeName)` from
[`main.ts`](../examples/web-app/main.ts) instead — that's the right
call when each request needs its own scope name.

Rule of thumb:

- **Scope fixed (or absent)?** Use `@Inoculate(scope?)` and `new`.
- **Scope varies per call?** Use `Doctor.resolve(Class, scope)`.

---

[← Back to Doctor](../README.md)
