# stock

Register **ready-made values** — and non-class factories with a
lifecycle — under typed labels, and `inject` them with full typing and
no `VialRegistry` augmentation. A vial is made to order from a class
(`@Vial` / `prescribe`); a stocked item arrives already built.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript ignore
label<T>(name: string): Label<T>;

Doctor.stock<T>(type: Vial<T>, value: T): void;
Doctor.stock<T>(labelOrName: Label<T> | string, value: T): void;
Doctor.stock<T>(labelOrName: Label<T> | string, options: StockOptions<T>): void;

Doctor.has(target: Vial | Label | string): boolean;
Doctor.revoke(target: Vial | Label | string): boolean;

inject<T>(target: Vial<T> | Label<T>, scope?: string): T;
Doctor.dispense<T>(vialOrLabel: Vial<T> | Label<T>, scope?: string): T;
```

`Label<T>` is `{ readonly name: string }` with a phantom `T`: the name
is the registry key, `T` exists only at compile time. A class is not a
`Label` — it has its own [form](#class-form), keyed by identity.
`StockOptions<T>` is `{ mode: VialModes; factory: () => T }`.

## Value form

```typescript
import { Doctor, inject, label } from '@tundralibs/doctor';

type BlogDb = { repo(name: string): unknown };
declare const db: BlogDb;

export const Db = label<BlogDb>('Db'); // a typed label: name + contents
Doctor.stock(Db, db); // stock a ready-made value under it

class Posts {
  db = inject(Db); // the very same `db`, typed as BlogDb
}
```

The value is handed out as-is on every dispense — SINGLETON by nature.
A function is a value too: `stock(Hook, () => {})` returns the function,
it never calls it. The value is pinned to the label's type at compile
time: `stock(label<number>('n'), 'str')` does not compile.

## Class form

`stock(Class, instance)` puts a ready instance under the class itself —
as if `Class` had been prescribed SINGLETON and already built — so
`inject(Class)`, `inject('Class')` and `Doctor.dispense(Class)` all hand
it out. Value only: a class that needs a factory is
`prescribe(Class, { mode, factory })`.

```typescript
import { Doctor, inject, Vial } from '@tundralibs/doctor';

@Vial('SINGLETON')
class Db {
  query(sql: string): unknown[] {
    return [sql];
  }
}

// In a test: swap the real singleton for a fake, leaving everything else.
Doctor.revoke(Db);
Doctor.stock(Db, { query: () => [] });

class Posts {
  db = inject(Db); // the fake, typed as Db
}
```

The class must not be registered and its name must be free —
`stock(Db, fake)` on a live `@Vial` class throws `DuplicateVialError`,
so `revoke(Db)` first. Unlike `prescribe`, whose same-named classes are
last-wins, the class form refuses a name any other class or label holds.

## Factory form

```typescript
import { Doctor, label } from '@tundralibs/doctor';

type Conn = { query(sql: string): unknown };
declare function connect(): Conn;

export const Db = label<Conn>('Db');
Doctor.stock(Db, { mode: 'SCOPED', factory: () => connect() });

const a = Doctor.dispense(Db, 'req-1'); // connect() runs
const b = Doctor.dispense(Db, 'req-1'); // cached: a === b
Doctor.discharge('req-1'); // dropped — the next dispense reconnects
```

The factory runs through the **same lifecycle engine** as class vials:

| Mode        | `factory` runs …        | Cache dropped by              |
| ----------- | ----------------------- | ----------------------------- |
| `SINGLETON` | once, on first dispense | `revoke(label)` / `reset()`   |
| `SCOPED`    | once per scope name     | `discharge(scope)` / `revoke` |
| `TRANSIENT` | on every dispense       | — (never cached)              |

Everything that holds for class vials holds here: a SCOPED label
dispensed without a scope throws `ScopeRequiredError`; an
`inject(label)` field initializer inherits the ambient scope of the
driving `Doctor.resolve(Handler, scope)`; `Doctor.checkup()` preflights
SINGLETON labelled factories along with singleton classes; a factory
that throws caches nothing and is retried next time.

A value whose own shape is `{ mode, factory }` — a valid mode and a
function — is read as the factory form.

## Name-keyed

Labels are keyed by **name**, not by object identity: two
`label<T>('Db')` calls address the same entry, and so do the string
paths. A label is a typed name — `inject(label<Logger>('Logger'))`
resolves exactly what `inject('Logger')` would, be that a stocked value
or a prescribed class of that name.

```typescript ignore
Doctor.stock(label<BlogDb>('Db'), db);
Doctor.dispenseByName('Db'); // db, typed unknown
inject('Db'); // db — typed only once `Db: BlogDb` is declared in VialRegistry
```

The string form of `inject` keeps its compile-time guarantee: a token
not in `VialRegistry` is a compile error, never `unknown`. Prefer
`inject(Db)` — typed by the label alone, and immune to minification
(the name is an explicit string, not a class name).

A name is held exclusively between labels and classes: stocking a name
a prescribed class already holds, or prescribing a class whose name a
label holds, throws `DuplicateVialError`. Two distinct classes sharing
a name behave as before — the last registration wins the name.

## has / revoke

```typescript ignore
const db = Doctor.has(Db) ? inject(Db) : undefined; // optional service

Doctor.revoke(Db); // entry + singleton/scoped caches gone; the name is free
Doctor.stock(Db, fakeDb); // a test double, no reset() needed
```

`has` accepts a label, a bare name, or a class; so does `revoke` — a
bare name revokes whatever `dispenseByName` would resolve it to.
`reset()` clears stocked entries along with everything else.

### Testing: `revoke` + `stock`, not `reset`

`Doctor.reset()` wipes the whole process-wide registry — every `@Vial`
class and stocked label in the process, not just the ones your test
cares about — so a test that calls it has to rebuild the world.
`Doctor.revoke(X)` followed by `Doctor.stock(X, fake)` replaces one
entry, caches included, and leaves everything else standing. Reach for
`reset()` only between unrelated suites; inside a suite, swap what you
need with `revoke` + `stock`.

## Throws

- [`DuplicateVialError`](../errors/Doctor-Errors.md#duplicatevialerror) —
  from `stock` when the name is already taken by an earlier `stock` or a
  prescribed class, or the class token is itself already registered; from
  `prescribe` / `@Vial` when the class name is held by a label.
- [`UnregisteredVialError`](../errors/Doctor-Errors.md#unregisteredvialerror) —
  from `inject(label)` / `Doctor.dispense(label)` when nothing is stocked
  under it.
- [`ScopeRequiredError`](../errors/Doctor-Errors.md#scoperequirederror) —
  a SCOPED label dispensed without a scope.

## Caveats

- **Factories are synchronous — by design.** `inject()` runs inside
  field initializers, which cannot `await`. Do the asynchronous setup
  first, then stock the result:
  `const db = await connect(); Doctor.stock(Db, db);`.
- **SCOPED is an explicit scope name, not an ambient per-request
  context.** You name the scope — `dispense(Db, 'req-7')`, or the
  `scope` of the `Doctor.resolve(Handler, 'req-7')` operation
  constructing the injecting class — and you end it with
  `Doctor.discharge('req-7')`. Nothing is tracked per async context.

## See also

- [inject](Doctor-Inject.md) — `inject(label)` / `inject(Class)` /
  `inject('Token')`
- [@Vial](Doctor-Vial.md) — the class-registration path
- [Errors](../errors/Doctor-Errors.md)

---

[← Back to Doctor](../README.md)
