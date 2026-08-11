# Errors

The typed error hierarchy for `@tundralibs/cronus`.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Hierarchy](#hierarchy)
- [Classes](#classes)
- [Catching](#catching)
- [Related Documentation](#related-documentation)

## Hierarchy

All package errors extend `CronusError`, which extends `BaseError`
from [Utils](../../utils/README.md) — so every error carries the
project-wide contract: typed `context`, cause chains, and JSON
serialisation.

```
BaseError (@tundralibs/utils)
└── CronusError
    ├── DuplicateJobError
    ├── JobNotFoundError
    ├── InvalidScheduleError
    └── InvalidActionError
```

`CronusError` is also used directly to wrap foreign errors thrown by
job actions before they surface on the `error` event (the original
error is preserved as `cause`).

## Classes

| Class                  | Thrown by                                                              | Context                          |
| ---------------------- | ---------------------------------------------------------------------- | -------------------------------- |
| `DuplicateJobError`    | `add`/`addOnce` — name already registered                              | `{ name }`                       |
| `JobNotFoundError`     | `get`/`remove`/`enable`/`disable`/`isRunning`/`trigger` — unknown name | `{ name }`                       |
| `InvalidScheduleError` | `parseSchedule` (and therefore `add`) — malformed expression           | `{ expression, field?, reason }` |
| `InvalidActionError`   | `add` — action is not a function                                       | `{ name }`                       |

All registration errors are thrown synchronously at the call site —
never deferred to tick time — so a mis-configured job fails the
deploy, not the 03:00 run.

## Catching

Branch with `instanceof`; read structured data from `context`:

```typescript
import {
  Cronus,
  DuplicateJobError,
  InvalidScheduleError,
} from '@tundralibs/cronus';

try {
  cron.add(name, schedule, action);
} catch (e) {
  if (e instanceof InvalidScheduleError) {
    console.error(
      `bad schedule '${e.context.expression}': ${e.context.reason}`,
    );
  } else if (e instanceof DuplicateJobError) {
    // idempotent re-registration — ignore
  } else {
    throw e;
  }
}
```

## Related Documentation

- [Cronus-Jobs](../docs/Cronus-Jobs.md) - Where these errors surface
- [Cronus-Schedule-Syntax](../docs/Cronus-Schedule-Syntax.md) - What
  makes a schedule invalid

---

[← Back to Cronus](../README.md)
