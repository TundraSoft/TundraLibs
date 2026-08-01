# @Vial

Class decorator that registers a class with the Doctor injector
under a chosen lifecycle.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript
@Vial(mode: 'SINGLETON' | 'SCOPED' | 'TRANSIENT')
class MyService { ... }

// Long form, with optional factory:
@Vial({ mode: 'SCOPED', factory: () => new Db(env.URL) })
class Db { constructor(public url: string) {} }
```

The decorator calls
`Doctor.prescribe(MyService, modeOrOptions)` at decoration
(module-load) time.

## Lifecycles

- `SINGLETON` — one instance for the entire process. Constructed
  lazily on first resolution, treated, then cached.
- `SCOPED` — one instance per named scope. Requires a scope at
  resolution time (`Doctor.dispense(Type, scopeName)` or via
  `@Inoculate(scope)` / `Doctor.resolve(Class, scope)`).
- `TRANSIENT` — fresh instance every resolution.

## Factory hook

When the class needs constructor arguments, register a `factory`
that returns the constructed instance. Doctor calls the factory
every time it would otherwise have called `new Klass()`.

```typescript
@Vial({
  mode: 'SINGLETON',
  factory: () => new Config(loadFromEnv()),
})
class Config {
  constructor(public readonly opts: ConfigOpts) {}
}
```

The returned instance is still treated, so the factory does not
have to wire `@Dose` properties itself.

If the factory returns a **directly `@Inoculate`d instance** (e.g.
`factory: () => new Repo()` where `Repo` is `@Inoculate`d), that instance
is treated **exactly once**, not twice — the wrapper's construction-time
auto-treat is reconciled with the driving `dispense`/`resolve`. The
class's own decoration scope wins if it has one, otherwise the operation's
scope fills in, so an `@Inoculate()` return whose `@Dose` is SCOPED
resolves under the caller's scope.

The operation-scope fallback applies to the factory's **return value
only**. An `@Inoculate`d **collaborator** the factory builds but does not
return keeps its own decoration scope and never inherits the operation
scope — with a SCOPED `@Dose` and no scope of its own it throws
[`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror),
exactly as it would outside a factory. See
[Returning an `@Inoculate`d instance from a factory](./Doctor-Inoculate.md#returning-an-inoculated-instance-from-a-vial-factory).

## Example

```typescript
@Vial('SINGLETON')
class Logger {
  log(msg: string) { console.log(msg); }
}

@Vial('SCOPED')
class Database {
  query<T>(sql: string): T[] { ... }
}

@Vial('TRANSIENT')
class RequestId {
  public id = crypto.randomUUID();
}
```

## Throws

- [`DuplicateVialError`](../errors/Doctor-Errors.md#duplicatevialerror)
  — when the same class is registered twice.

## See in context

The [web-app example](../examples/web-app/) shows each lifecycle
plus the factory hook:

- [`Logger.ts`](../examples/web-app/Logger.ts) —
  `@Vial('SINGLETON')` with a `@Dose` dependency
- [`Database.ts`](../examples/web-app/Database.ts) —
  `@Vial('SCOPED')`
- [`UserRepository.ts`](../examples/web-app/UserRepository.ts) —
  `@Vial('TRANSIENT')`
- [`registry.ts`](../examples/web-app/registry.ts) —
  `Doctor.prescribe(Class, { mode, factory })` for a class that
  needs constructor arguments

---

[← Back to Doctor](../README.md)
