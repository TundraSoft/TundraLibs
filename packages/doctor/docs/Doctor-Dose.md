# @Dose

Property decorator that marks a field as a dependency for Doctor
to fill in.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Signature

```typescript
import 'reflect-metadata';
import { Dose, Vial } from '@tundralibs/doctor';

@Vial('SINGLETON')
class Logger {}

class MyHandler {
  @Dose()
  public logger!: Logger;
}
```

`@Dose` reads the property's runtime type from `reflect-metadata`'s
`design:type` slot and appends an entry to the class's
`design:injectable` array. Injection happens later, when
`@Inoculate` (or a manual `Doctor.treat(this)`) walks that
array.

## Requirements

- The consumer's TypeScript config must have
  `emitDecoratorMetadata: true` — otherwise `design:type` will be
  `undefined` and `@Dose` throws
  [`MissingDesignTypeError`](../errors/Doctor-Errors.md#missingdesigntypeerror).
- `reflect-metadata` must be imported once at the entry point —
  otherwise `@Dose` throws
  [`MissingMetadataError`](../errors/Doctor-Errors.md#missingmetadataerror).

## Example

```typescript
import 'reflect-metadata';
import { Dose, Inoculate, Vial } from '@tundralibs/doctor';

@Vial('SINGLETON')
class Logger {}

@Vial('SCOPED')
class Database {}

@Inoculate()
class UserHandler {
  @Dose()
  public logger!: Logger;
  @Dose()
  public db!: Database;
}
```

## Throws

- [`MissingMetadataError`](../errors/Doctor-Errors.md#missingmetadataerror)
  — when `reflect-metadata` is unavailable.
- [`MissingDesignTypeError`](../errors/Doctor-Errors.md#missingdesigntypeerror)
  — when `emitDecoratorMetadata` isn't enabled.

## See in context

Every class in the [web-app example](../examples/web-app/) uses
`@Dose` — see [`Database.ts`](../examples/web-app/Database.ts) for
multi-property injection or
[`UserHandler.ts`](../examples/web-app/UserHandler.ts) for a plain
class that's wired up via `Doctor.resolve` instead of `@Inoculate`.

---

[← Back to Doctor](../README.md)
