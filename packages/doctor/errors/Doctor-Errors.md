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
- [MissingMetadataError](#missingmetadataerror)
- [MissingDesignTypeError](#missingdesigntypeerror)
- [Matching strategy](#matching-strategy)

## Hierarchy

```
Error
└── BaseError                          // from @tundralibs/utils
    └── DoctorError                    // package base
        ├── UnregisteredVialError       // @Dose → no @Vial registered for that type
        ├── ScopeRequiredError          // SCOPED vial resolved without a scope
        ├── CircularDependencyError     // TRANSIENT vial in an unbreakable dependency cycle
        ├── DuplicateVialError          // same class registered twice
        ├── MissingMetadataError        // reflect-metadata not imported
        └── MissingDesignTypeError      // emitDecoratorMetadata not enabled
```

Every error in this package derives from `DoctorError`, which in
turn derives from `BaseError`.

## DoctorError

Package base. Use it to catch _any_ error this package throws
without committing to a specific class:

```typescript
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

Thrown by `Doctor.dispense` (and transitively by
`Doctor.treat` for required dependencies) when no `@Vial`
decorator has registered the requested class.

```typescript
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

- `vialName: string` — Constructor name of the missing vial.

## ScopeRequiredError

Thrown by `Doctor.dispense` (and transitively by
`Doctor.treat` / `Doctor.resolve`) when a SCOPED vial needs
to be instantiated but no scope was provided.

```typescript
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

Thrown by `Doctor.dispense` (and transitively by
`Doctor.treat` / `Doctor.resolve`) when resolving a vial
re-enters a vial that is already in flight — a dependency
cycle the registry cannot break.

SINGLETON and SCOPED instances are cached before their
properties are injected, so two such vials can each hold a
(partially built) reference to the other. A TRANSIENT vial
is never cached, so a cycle through one can never terminate
and always surfaces as this error instead of overflowing
the stack.

```typescript
import { CircularDependencyError } from '@tundralibs/doctor';

@Vial('TRANSIENT')
class A {
  @Dose()
  b!: B;
}

@Vial('TRANSIENT')
class B {
  @Dose()
  a!: A;
}

try {
  Doctor.dispense(A);
} catch (e) {
  if (e instanceof CircularDependencyError) {
    console.log(e.context.vialName); // 'A'
  }
}
```

**Context:**

- `vialName: string` — Name of the vial whose resolution
  re-entered while it was already being resolved.

## DuplicateVialError

Thrown by `Doctor.prescribe` (and the `@Vial` decorator that
wraps it) when the same class is being registered a second time.

```typescript
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
```

**Context:**

- `vialName: string` — Constructor name of the already-registered
  class.

## MissingMetadataError

Thrown by `@Dose` at decoration time when `Reflect.getMetadata` is
unavailable.

**Fix:** add `import 'reflect-metadata'` once, at the top of your
application entry point, before any doctor decorator runs.

## MissingDesignTypeError

Thrown by `@Dose` when `Reflect.getMetadata('design:type', …)`
returns `undefined`.

**Fix:** set `emitDecoratorMetadata: true` in your TypeScript
config (`tsconfig.json` or `deno.json`'s `compilerOptions`).

**Context:**

- `property: string` — Name of the property whose type was missing.

## Matching strategy

Branch with `instanceof` and read `error.context` for
variant-specific data — there is no error-code table.

## See in context

The [web-app example](../examples/web-app/) doesn't throw any of
these in its happy path, but you can provoke each one by:

- Dropping `Doctor.prescribe(Config, …)` from
  [`registry.ts`](../examples/web-app/registry.ts) →
  `UnregisteredVialError` when Logger is dispensed.
- Calling `Doctor.dispense(Database)` (without a scope) from
  [`main.ts`](../examples/web-app/main.ts) → `ScopeRequiredError`.
- Calling `Doctor.prescribe(Config, …)` twice in `registry.ts` →
  `DuplicateVialError`.

---

[← Back to Doctor](../README.md)
