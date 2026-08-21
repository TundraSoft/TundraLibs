# @Vial

Class decorator that registers a class with the Doctor injector
under a chosen lifecycle.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript ignore
@Vial(mode: 'SINGLETON' | 'SCOPED' | 'TRANSIENT')
class MyService { ... }

// Long form, with optional factory:
@Vial({ mode: 'SCOPED', factory: () => new Db(env.URL) })
class Db { constructor(public url: string) {} }
```

The decorator calls
`Doctor.prescribe(MyService, modeOrOptions)` at decoration
(module-load) time.

The decorator is a TC39 standard class decorator — no
`experimentalDecorators`, no metadata emission. It registers and
nothing else (Doctor's decorators record; they never supply values).

## Lifecycles

- `SINGLETON` — one instance for the entire process. Constructed
  lazily on first resolution and cached on successful construction.
- `SCOPED` — one instance per named scope. Requires a scope at
  resolution time (`Doctor.dispense(Type, scopeName)`, an explicit
  `inject('Type', scopeName)`, or the ambient scope of a
  `Doctor.resolve(Class, scope)` operation).
- `TRANSIENT` — fresh instance every resolution.

## Factory hook

When the class needs constructor arguments, register a `factory`
that returns the constructed instance. Doctor calls the factory
every time it would otherwise have called `new Klass()`.

```typescript ignore
@Vial({
  mode: 'SINGLETON',
  factory: () => new Config(loadFromEnv()),
})
class Config {
  constructor(public readonly opts: ConfigOpts) {}
}
```

Anything the factory constructs wires itself the ordinary way — the
`inject()` field initializers run while `new` runs, inheriting the
driving operation's scope as their ambient fallback — so the factory
never has to perform injection itself.

## Example

```typescript ignore
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

The [order-service example](../examples/order-service/) shows each
lifecycle plus the factory hook:

- [`Logger.ts`](../examples/order-service/Logger.ts) —
  `@Vial('SINGLETON')` with an `inject()` field dependency
- [`Connection.ts`](../examples/order-service/Connection.ts) —
  `@Vial('SCOPED')`
- [`OrderRepository.ts`](../examples/order-service/OrderRepository.ts) —
  `@Vial('TRANSIENT')`
- [`wiring.ts`](../examples/order-service/wiring.ts) —
  `Doctor.prescribe(Class, { mode, factory })` for a class that
  needs constructor arguments

---

[← Back to Doctor](../README.md)
