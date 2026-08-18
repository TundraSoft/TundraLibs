# inject

Resolve a registered vial by its **token — the class name** — so a consumer
never has to import the dependency class. `inject` is Doctor's ONE injection
primitive: used as a field initializer or constructor default parameter it
wires an instance while it constructs; used inside a getter it injects
lazily.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript ignore
inject<K extends keyof VialRegistry>(token: K, scope?: string): VialRegistry[K];
```

`inject('Config')` returns the same instance `Doctor.dispense(Config)` would —
honouring the registered lifecycle — but keyed by the class name rather than the
class object. The return type is taken from [`VialRegistry`](#vialregistry), so a
mistyped token is a compile error.

## The three idioms

```typescript ignore
class Handler {
  // EAGER — field initializer: resolves while `new` runs.
  logger = inject('Logger');

  // EAGER — constructor default parameter: same timing, and a test
  // can pass a double explicitly (new Handler(fakeDb)).
  constructor(private db = inject('Db')) {}

  // LAZY — memoizing getter: resolves on first access. Use it to
  // break a dependency cycle, register a vial after construction,
  // or keep the dependency out of JSON.stringify/spread.
  private __audit?: Audit;
  get audit(): Audit {
    return this.__audit ??= inject('Audit', 'jobs');
  }
}
```

There is deliberately no `@Dose`-style member decorator: Bun
miscompiles value-supplying member decorators whenever a file holds
more than one decorated class
([oven-sh/bun#30326](https://github.com/oven-sh/bun/issues/30326)),
so Doctor's decorators record registrations and never supply values.

## The ambient operation scope

When `scope` is omitted, `inject` falls back to the scope of the
Doctor operation currently constructing an instance — the `scope`
argument of the driving `Doctor.dispense` / `Doctor.resolve` call:

```typescript ignore
class Handler {
  db = inject('Db'); // SCOPED, no scope named here
}

Doctor.resolve(Handler, 'req-7'); // db resolves under 'req-7'
```

Precedence: **explicit argument → ambient operation scope → none.**

A lazy getter resolves at first _access_, which usually happens
outside any operation — no ambient scope exists there, and Doctor
deliberately does not let a lazy resolution borrow whatever unrelated
operation happens to be in flight at that moment. Name the scope
explicitly in lazy getters for SCOPED dependencies (as `'jobs'` above
does), and call `Doctor.checkup()` at startup so missing
registrations still fail at boot.

## VialRegistry

`VialRegistry` is the token → type map `inject` is typed against. It ships
**empty**; you populate it by augmenting the module — either with
[`@tundralibs/doctor/build`](Doctor-Build.md) or by hand:

```typescript ignore
declare module '@tundralibs/doctor' {
  interface VialRegistry {
    Config: import('./Config.ts').Config;
  }
}
```

Until the registry has an entry for a token, `inject('That')` is rejected at
compile time (`keyof VialRegistry` is `never`) — generate or declare the
augmentation first.

## Doctor.dispenseByName

`inject` delegates to `Doctor.dispenseByName(name, scope?)`, which looks the
class up in a name index kept in sync by `prescribe` / `revoke` / `reset`. Use
it directly when you need the loosely-typed (`unknown`) form:

```typescript ignore
const config = Doctor.dispenseByName<Config>('Config');
```

Note: `dispenseByName` takes the scope you give it — the
ambient-scope fallback lives in `inject`, not here.

## Throws

- [`UnregisteredVialError`](../errors/Doctor-Errors.md#unregisteredvialerror) —
  when no vial is registered under the token at runtime.
- [`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror) —
  propagated when the resolved vial is `SCOPED` and no scope was given
  explicitly, by the ambient operation, or at all.
- [`CircularDependencyError`](../errors/Doctor-Errors.md#circulardependencyerror) —
  when two eager `inject()` initializers point at each other; break
  the cycle by making one side a lazy getter.

## Caveats

The token **is** the class name, so:

- Names must be unique across registered vials (last registration wins).
- They must **survive minification** — a bundler that renames classes
  (`Config` → `a`) breaks token resolution. Don't rely on this in a minified
  build; use `Doctor.dispense(Class)` there instead.

## See also

- [build](Doctor-Build.md) — generate the `VialRegistry` from your `@Vial`
  classes
- [@Vial](Doctor-Vial.md) — registers the classes `inject` resolves

---

[← Back to Doctor](../README.md)
