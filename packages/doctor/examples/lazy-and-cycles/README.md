# Lazy-and-cycles example

A background-job domain that exercises the capabilities the other two
examples don't: a lazy getter breaking an otherwise-unbreakable
eager/eager cycle, `Doctor.checkup()` catching a missing dependency at
boot, deferred vial registration, and a live `CircularDependencyError`
from a cycle nothing breaks.

| File           | Lifecycle | Depends on                                      |
| -------------- | --------- | ----------------------------------------------- |
| `JobLogger.ts` | SINGLETON | `JobQueue` — **lazily**, via a getter           |
| `JobQueue.ts`  | SINGLETON | `JobLogger`, `Metrics` — both eagerly           |
| `Metrics.ts`   | SINGLETON | nothing (registered late, see Scenario 2 below) |
| `registry.ts`  | —         | carries the `VialRegistry` augmentation         |

`JobQueue` logs every enqueue, so it eagerly needs `JobLogger`.
`JobLogger` only needs `JobQueue` back for the rare "queue is backed
up" warning, so that reference is a lazy getter instead — eagerly
injecting `JobQueue` from `JobLogger` too would create an unbreakable
construction-time cycle (see Scenario 5 for what that looks like when
nothing breaks it).

## Running

```bash
deno run packages/doctor/examples/lazy-and-cycles/main.ts
```

## Expected output

```
=== Scenario 1 — checkup() before Metrics is registered ===
checkup() failed loudly: No service registered under the name 'Metrics'
missing vial: Metrics

=== Scenario 2 — registering Metrics late, then re-running checkup() ===
checkup() passed — 3 singleton(s) dispensed

=== Scenario 3 — enqueueing jobs ===
[log] enqueued "send-welcome-email" (depth 1)
[log] enqueued "resize-thumbnail" (depth 2)
[log] enqueued "sync-crm" (depth 3)
queue depth: 3

=== Scenario 4 — lazy getter breaks the JobLogger ↔ JobQueue cycle ===
[log] queue depth 3 within threshold 10
[log] WARNING: queue depth 3 exceeds 2

=== Scenario 5 — an eager/eager cycle throws CircularDependencyError ===
caught: Circular dependency detected while resolving 'CycleA'
detected while resolving: CycleA
fix: make one side a lazy getter, like JobLogger.queue above

Done.
```

## What this example demonstrates

| Scenario | Behavior                                                                                                                                                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | **`checkup()` as a boot-time preflight.** `JobQueue` eagerly needs `Metrics`, which isn't registered yet — `Doctor.checkup()` fails loudly and immediately, instead of on the first real job deep inside a request.                |
| 2        | **Deferred vial registration.** `Metrics` registers via a dynamic `import()` in `main.ts`, run after Scenario 1 — proof a vial can be registered any time before it's first dispensed, e.g. a plugin loaded on demand.             |
| 3        | **Eager singleton cascade.** `Doctor.dispense(JobQueue)` wires `JobLogger` and `Metrics` into it during construction; every `enqueue()` call logs and counts through those fields.                                                 |
| 4        | **Lazy getter breaks the cycle.** `JobLogger.queue` is a hand-rolled getter (`this.__queue ??= inject('JobQueue')`) — it resolves `JobQueue` on first _access_, long after both singletons finished constructing.                  |
| 5        | **`CircularDependencyError` when nothing breaks the cycle.** `CycleA` and `CycleB` both eagerly `inject()` each other — construction re-enters the still-in-flight resolution, and Doctor throws instead of overflowing the stack. |

## Why not make `JobLogger` lazy about `JobQueue` too, and vice versa?

It already is on `JobLogger`'s side — that's the fix. The rule: in an
eager/eager pair, at least one side has to defer resolution until
after both instances exist. Making `JobQueue`'s reference to
`JobLogger` lazy _instead_ would work exactly as well; the cycle just
needs breaking on **one** side, not both. Scenario 5's `CycleA` /
`CycleB` show what happens when neither side gives way.
