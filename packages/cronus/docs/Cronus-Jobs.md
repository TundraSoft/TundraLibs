# Jobs

Job lifecycle, overlap prevention, run-once/run-now, and the event
surface.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Registering jobs](#registering-jobs)
- [Overlap prevention](#overlap-prevention)
- [Run-once and run-now](#run-once-and-run-now)
- [The run context](#the-run-context)
- [Events](#events)
- [Error isolation](#error-isolation)
- [API Reference](#api-reference)
- [Related Documentation](#related-documentation)

## Registering jobs

```typescript
import { Cronus } from '@tundralibs/cronus';
import type { CronusAction } from '@tundralibs/cronus/types';

declare function buildReport(): Promise<void>;
declare const betaSync: CronusAction;

const cron = new Cronus();

cron.add('report', '0 6 * * *', async (ctx) => {
  await buildReport();
});

// Registered disabled — the ticker skips it until enable():
cron.add('beta', '*/5 * * * *', betaSync, { enabled: false });

cron.start();
```

Registration is loud: a duplicate name, a malformed schedule, or a
non-function action throw immediately (see
[Cronus-Errors](../errors/Cronus-Errors.md)) — never a silent
never-fires. Jobs can be added and removed while the ticker runs.

## Overlap prevention

A job never overlaps itself. While its action is running, matching
ticks are **skipped** (a `skip` event fires per skipped tick). A job
scheduled `* * * * *` whose run takes five minutes resumes on the
sixth minute — there is no queue and no pile-up:

```
minute  1     2     3     4     5     6
        run──────────────────────┐   run
              skip  skip  skip  skip
```

Different jobs run independently — a slow job never delays others.
The guard is **per registration**: removing a job and re-adding the
same name while the old run is still in flight starts a fresh guard,
so the old and new registrations can briefly run concurrently.

## Run-once and run-now

```typescript
import { Cronus } from '@tundralibs/cronus';

declare function runMigration(): Promise<void>;

const cron = new Cronus();
cron.add('report', '0 6 * * *', () => {});

// Run ONCE at the next matching minute, then auto-remove:
cron.addOnce('migrate', '0 3 * * *', runMigration);

// Run NOW, bypassing the schedule:
const fired = await cron.trigger('report');
```

`trigger()` respects the overlap guard — it resolves `false` (without
running) when the job is already mid-run, `true` after the run
settles. It works whether or not the ticker is started, and on
disabled jobs. A one-shot job auto-removes after its single run —
scheduled or triggered, success or error.

Actions must **settle**: an action that never resolves wedges its job
(the overlap guard skips every subsequent tick) and hangs any
`trigger()` awaiting it — recovery is `remove()` + `add()`. Jobs
registered while a tick is being evaluated wait for the next minute.

## The run context

Every run receives a `CronusRunContext`:

| Field         | Meaning                                                          |
| ------------- | ---------------------------------------------------------------- |
| `runId`       | Unique id for THIS run — a fresh UUID per firing                 |
| `name`        | The job's registered name                                        |
| `scheduledAt` | The minute boundary the run fired for (call time on trigger)     |
| `runCount`    | Runs STARTED since registration (failed runs and triggers count) |
| `triggered`   | `true` when started via `trigger()`                              |

## Events

Metadata only — never the action's arguments. Listeners are
**isolated** (inherited from `@tundralibs/utils` Events): a sync throw
or an async rejection is caught per listener and reported via
`console.error` — it never affects the run, the job's state, other
listeners, the ticker, or the process. `off(event, callback)` also
removes `once` listeners by their original callback. A listener that
re-triggers its own job during `success`/`error`/`finish` hits the
overlap guard (resolves `false`) — the guard releases only after the
emissions.

| Event     | Fires when                        | Arguments                                            |
| --------- | --------------------------------- | ---------------------------------------------------- |
| `run`     | a run starts                      | `(runId, name, scheduledAt)`                         |
| `success` | a run returns                     | `(runId, name, scheduledAt, elapsedMs, result)`      |
| `error`   | a run throws (never escapes)      | `(runId, name, scheduledAt, elapsedMs, CronusError)` |
| `finish`  | a run settles (success or error)  | `(runId, name, scheduledAt, elapsedMs)`              |
| `skip`    | a matching tick hit a running job | `(name, scheduledAt)`                                |

## Error isolation

An action that throws is routed to the `error` event as a
`CronusError` (foreign errors are wrapped, the original preserved as
`cause`) and then `finish` fires. The throw never escapes the run: a
job that fails every single tick cannot stop the ticker or affect
other jobs. `trigger()` follows the same rule — it resolves normally
even when the action threw; subscribe to `error` for the failure.

## API Reference

### `add()`

```typescript ignore
add(name: string, schedule: string, action: CronusAction, options?: CronusJobOptions): this
```

**Parameters:**

- `name` - Unique job name.
- `schedule` - A 5-field cron expression
  ([syntax](Cronus-Schedule-Syntax.md)).
- `action` - Sync or async function; receives a `CronusRunContext`.
- `options` - `{ once?: boolean; enabled?: boolean }` (defaults:
  `false`, `true`).

**Throws:**

- `DuplicateJobError` - When `name` is already registered.
- `InvalidScheduleError` - When `schedule` is malformed.
- `InvalidActionError` - When `action` is not a function.

### `addOnce()`

`add(..., { once: true })` — runs once at the next matching minute,
then auto-removes. Same throws as `add()`.

### `remove()` / `has()` / `get()` / `list()`

Manage and inspect registrations. `get()`/`list()` return snapshots
(`CronusJobInfo`) — mutating one never affects the scheduler.
`lastRun` is when the most recent run **started** (not completed);
`runCount` counts runs started, including failures and triggers.
`remove()`/`get()` throw `JobNotFoundError` for unknown names. A
removed job's in-flight run is not interrupted, and its completion
cannot touch a job registered later under the same name.

### `enable()` / `disable()` / `isRunning()`

Toggle or inspect a job by name. Disabled jobs are skipped by the
ticker but remain runnable via `trigger()`. All throw
`JobNotFoundError` for unknown names.

### `start()` / `stop()` / `active`

Start aligns to the next minute boundary and is idempotent; a job is
never fired for the minute in which `start()` was called. Minutes
missed while stopped, blocked, or suspended are not replayed (classic
cron behaviour — no catch-up). Stop clears the pending tick but does
not cancel a run already in flight; registrations survive and
`start()` resumes.

### `trigger()`

```typescript ignore
trigger(name: string): Promise<boolean>
```

Run now, bypassing the schedule. Resolves `false` when the job is
already running (overlap guard), `true` after the run settles.

**Throws:**

- `JobNotFoundError` - When `name` is not registered.

## Related Documentation

- [Cronus-Schedule-Syntax](Cronus-Schedule-Syntax.md) - Expression
  syntax and matching semantics
- [Cronus-Errors](../errors/Cronus-Errors.md) - The typed error
  hierarchy

---

[← Back to Cronus](../README.md)
