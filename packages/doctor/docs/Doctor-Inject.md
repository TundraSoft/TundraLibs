# inject

Resolve a dependency by a typed **label**, by the **class** itself, or —
untyped — by its **name**. `inject` is Doctor's ONE injection primitive: used as a
field initializer or constructor default parameter it wires an instance
while it constructs; used inside a getter it injects lazily.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript ignore
inject<T>(target: Vial<T> | Label<T>, scope?: string): T;
inject(token: string, scope?: string): unknown;
```

- `inject(Db)` — `Db` a label from `label<BlogDb>('Db')` — returns what
  [`Doctor.stock`](Doctor-Stock.md) put under it, typed `BlogDb`. The label
  carries the type; nothing else is needed.
- `inject(Config)` — the class — returns the registered instance,
  honouring its lifecycle, typed `Config`. A class is a value that
  carries its own type.
- `inject('Config')` returns the same instance `Doctor.dispense(Config)`
  would, keyed by the class name (or a label's name) rather than the
  object — typed `unknown`. The escape hatch for dynamic wiring; see
  [String tokens](#string-tokens).

## The three idioms

```typescript ignore
class Handler {
  // EAGER — field initializer: resolves while `new` runs.
  logger = inject(Logger);

  // EAGER — constructor default parameter: same timing, and a test
  // can pass a double explicitly (new Handler(fakeDb)).
  constructor(private db = inject(Db)) {}

  // LAZY — memoizing getter: resolves on first access. Use it to
  // break a dependency cycle, register a vial after construction,
  // or keep the dependency out of JSON.stringify/spread.
  private __audit?: Audit;
  get audit(): Audit {
    return this.__audit ??= inject(Audit, 'jobs');
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
  db = inject(Db); // SCOPED, no scope named here
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

## String tokens

`inject('Name')` resolves by **name** — a prescribed class's name or a
stocked label's — and returns `unknown`: you assert the type. Two uses earn
it: a token that only exists at runtime (read from configuration), and a
lazy getter that must not value-import the class on the other side of a
cycle. For everything else, `inject(Class)` or a [label](Doctor-Stock.md) is
typed and immune to minification.

## Doctor.dispenseByName

The string form delegates to `Doctor.dispenseByName(name, scope?)`, which
looks the class or label up in a name index kept in sync by `prescribe` /
`stock` / `revoke` / `reset`. Use it directly when you need the
loosely-typed (`unknown`) form:

```typescript ignore
const config = Doctor.dispenseByName<Config>('Config');
```

Note: `dispenseByName` takes the scope you give it — the
ambient-scope fallback lives in `inject`, not here.

## Throws

- [`UnregisteredVialError`](../errors/Doctor-Errors.md#unregisteredvialerror) —
  when no vial is registered — or nothing is stocked — for the target at
  runtime.
- [`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror) —
  propagated when the resolved vial is `SCOPED` and no scope was given
  explicitly, by the ambient operation, or at all.
- [`CircularDependencyError`](../errors/Doctor-Errors.md#circulardependencyerror) —
  when two eager `inject()` initializers point at each other; break
  the cycle by making one side a lazy getter.

## Caveats

The string token **is** the class name, so:

- Names must be unique across registered vials (last registration wins),
  and a name held by a stocked label cannot also be a class's.
- They must **survive minification** — a bundler that renames classes
  (`Config` → `a`) breaks token resolution. Don't rely on this in a minified
  build; use `inject(Class)` or a [label](Doctor-Stock.md) there instead —
  a label's name is an explicit string, untouched by minifiers.

## See also

- [@Vial](Doctor-Vial.md) — registers the classes `inject` resolves
- [stock](Doctor-Stock.md) — typed labels for ready-made values and labelled
  factories
- [containers](Doctor-Container.md) — what "the ambient container" `inject`
  reads actually is

---

[← Back to Doctor](../README.md)
