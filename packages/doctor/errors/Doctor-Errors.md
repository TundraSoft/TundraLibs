# Errors

Error classes thrown by `@tundralibs/doctor`.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Hierarchy](#hierarchy)
- [DoctorError](#doctorerror)
- [UnregisteredVialError](#unregisteredvialerror)
- [ScopeRequiredError](#scoperequirederror)
- [CircularDependencyError](#circulardependencyerror)
- [DuplicateVialError](#duplicatevialerror)
- [Matching strategy](#matching-strategy)

## Hierarchy

```
Error
└── BaseError                          // from @tundralibs/utils
    └── DoctorError                    // package base
        ├── UnregisteredVialError       // inject()/dispense → nothing registered or stocked
        ├── ScopeRequiredError          // SCOPED entry resolved without a scope
        ├── CircularDependencyError     // unbreakable dependency cycle
        └── DuplicateVialError          // same class, or same name, registered twice
```

Every error in this package derives from `DoctorError`, which in
turn derives from `BaseError`.

## DoctorError

Package base. Use it to catch _any_ error this package throws
without committing to a specific class:

```typescript ignore
import { DoctorError } from '@tundralibs/doctor';

try {
  Doctor.dispense(MyService);
} catch (e) {
  if (e instanceof DoctorError) {
    // doctor-originated failure
  }
  throw e;
}
```

## UnregisteredVialError

Thrown by `Doctor.dispense` / `Doctor.dispenseByName` (and therefore
by any `inject()` initializer during construction) when no `@Vial`
decorator or `prescribe` call has registered the requested class — or
nothing is stocked under the requested label.

```typescript ignore
import { UnregisteredVialError } from '@tundralibs/doctor';

try {
  Doctor.dispense(MyService);
} catch (e) {
  if (e instanceof UnregisteredVialError) {
    console.log(e.context.vialName); // 'MyService'
  }
}
```

**Context:**

- `vialName: string` — Constructor name of the missing vial, or the
  label's name.

## ScopeRequiredError

Thrown by `Doctor.dispense` when a SCOPED vial or label needs to be
instantiated but no scope was provided — explicitly, or through the
ambient scope of the driving `Doctor.resolve` / `Doctor.dispense`
operation. A plain `new` of a class whose `inject()` field targets a
SCOPED vial (with no scope named anywhere) throws this at
construction.

```typescript ignore
import { ScopeRequiredError } from '@tundralibs/doctor';

@Vial('SCOPED')
class Db {}

try {
  Doctor.dispense(Db); // no scope
} catch (e) {
  if (e instanceof ScopeRequiredError) {
    console.log(e.context.vialName); // 'Db'
  }
}
```

**Context:**

- `vialName: string` — Name of the SCOPED vial that needed a scope.

## CircularDependencyError

Thrown by `Doctor.dispense` when resolving a vial re-enters a vial
that is already in flight — a dependency cycle the registry cannot
break.

Injection happens during construction, so two **eager** `inject()`
initializers pointing at each other always trip this: the second
resolution re-enters before the first instance finished constructing.
Break the cycle by making at least one side a **lazy getter** — by
first access, both instances exist:

```typescript ignore
import { CircularDependencyError, inject, Vial } from '@tundralibs/doctor';

@Vial('SINGLETON')
class A {
  b = inject('B'); // eager
}

@Vial('SINGLETON')
class B {
  private __a?: A;
  get a(): A {
    return this.__a ??= inject('A'); // lazy — breaks the cycle
  }
}
```

**Context:**

- `vialName: string` — Name of the vial whose resolution
  re-entered while it was already being resolved.

The [order-service example](../examples/order-service/) breaks a real
cycle with a lazy getter — `AuditTrail.orders` reaches back to the
`OrderService` that eagerly injects it. Make that getter an eager field
and the boot-time `checkup()` throws this error.

## DuplicateVialError

Thrown by `Doctor.prescribe` (and the `@Vial` decorator that
wraps it) when the same class is being registered a second time, or
when the class name is already held by a stocked label; and by
`Doctor.stock` when the name is already taken — by an earlier `stock`
or by a prescribed class — or the class token is itself already
registered. Two distinct classes sharing a name do not throw in
`prescribe` (the last registration wins the name); `stock` refuses it.

```typescript ignore
import { DuplicateVialError } from '@tundralibs/doctor';

class Logger {}
Doctor.prescribe(Logger, 'SINGLETON');
try {
  Doctor.prescribe(Logger, 'TRANSIENT');
} catch (e) {
  if (e instanceof DuplicateVialError) {
    console.log(e.context.vialName); // 'Logger'
  }
}
Doctor.stock('Logger', {}); // throws too: the name is the class's
```

**Context:**

- `vialName: string` — The contested name: the class's constructor
  name, or the label's name.

## Matching strategy

Branch with `instanceof` and read `error.context` for
variant-specific data — there is no error-code table.

## See in context

The [order-service example](../examples/order-service/) throws only
`ScopeRequiredError` in its happy path (step 4 of `main.ts` dispenses the
SCOPED `Connection` with no scope, on purpose). Provoke the others by:

- Dropping `Doctor.stock(CONFIG, …)` from
  [`wiring.ts`](../examples/order-service/wiring.ts) →
  `UnregisteredVialError` from `checkup()` when the logger is built.
- Calling `Doctor.prescribe(PaymentGateway, …)` twice in `wiring.ts` →
  `DuplicateVialError`.
- Turning `AuditTrail.orders` into an eager field →
  `CircularDependencyError`.

---
