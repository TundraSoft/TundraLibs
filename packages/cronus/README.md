# Cronus

A cross-runtime, minute-resolution cron scheduler for Deno, Bun, and
Node.js.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

Cronus runs on all five targets — it is plain `setTimeout` with no
server-only imports, so it loads and ticks on Deno, Bun, Node.js,
Cloudflare Workers, and the browser alike. A minute-resolution
scheduler is **most useful on a long-lived process**, though: it only
earns its keep where something keeps the process alive between ticks. A
browser tab can close at any time, and a standard Cloudflare Worker has
no background execution between requests — a Durable Object's Alarms
API is a different scheduling model. Reach for it on a server.

## Overview

Cronus runs jobs on standard 5-field cron expressions using a
**tick-and-match** architecture: a self-correcting timer fires at each
minute boundary and runs every job whose schedule matches the current
time. It never computes a "next run", which has three practical
consequences:

- An impossible expression (`0 0 30 2 *` — Feb 30) simply never fires
  instead of crashing the scheduler.
- There is no far-future timer to overflow — a "fires in 40 days"
  schedule is just a match that eventually comes true.
- Drift self-corrects every tick (the next tick targets the next `:00`
  boundary, not `now + 60s`).

Jobs never overlap themselves: while a job's action is running, matching
ticks are skipped — a job scheduled every minute that takes five minutes
to run resumes on the sixth minute. The package is dependency-light: it
imports `@tundralibs/utils` (base error and event classes) and
`@tundralibs/compat` (cross-runtime timer `unref`).

## Modules

| Module     | Description                                             | Documentation                                            |
| ---------- | ------------------------------------------------------- | -------------------------------------------------------- |
| `Cronus`   | The scheduler — jobs, ticker, events, run-now           | This page                                                |
| Schedules  | Cron expression syntax and matching semantics           | [Cronus-Schedule-Syntax](docs/Cronus-Schedule-Syntax.md) |
| Jobs       | Job lifecycle, overlap prevention, events               | [Cronus-Jobs](docs/Cronus-Jobs.md)                       |
| `./errors` | `CronusError` plus `InvalidScheduleError` etc.          | [Cronus-Errors](errors/Cronus-Errors.md)                 |
| `./types`  | `CronusJobInfo`, `CronusRunContext`, `ParsedSchedule` … | —                                                        |

## Installation

**Deno:**

```bash
deno add @tundralibs/cronus
```

**Bun:**

```bash
bunx jsr add @tundralibs/cronus
```

**Node.js:**

```bash
npx jsr add @tundralibs/cronus
```

## Quick Start

```typescript
import { Cronus } from '@tundralibs/cronus';

declare function purgeExpired(): Promise<void>;
declare function runMigration(): Promise<void>;

const cron = new Cronus();

// Observability — actions and listeners can throw without harm:
cron.on(
  'error',
  (_runId, name, _at, _ms, err) =>
    console.error(`job ${name} failed:`, err.message),
);
cron.on('skip', (name) => console.warn(`${name} still running — tick skipped`));

// Recurring: every hour on the hour.
cron.add('hourly-cleanup', '0 * * * *', async () => {
  await purgeExpired();
});

// Once: next 03:00, then auto-removes.
cron.addOnce('migrate', '0 3 * * *', runMigration);

cron.start();

// Run-now, bypassing the schedule (false if already running):
await cron.trigger('hourly-cleanup');
```

## Embedding

By default the ticker holds the event loop (standalone-daemon
friendly). When embedding inside a host that owns the lifecycle (an
HTTP server), pass `{ unref: true }` so a pending tick never blocks
shutdown — and call `stop()` on teardown. Caveat: with nothing else
holding the loop, the process can exit mid-run of an async job; the
host is responsible for draining in-flight work before exit:

```typescript
import { Cronus } from '@tundralibs/cronus';

const cron = new Cronus({ unref: true });
```

## Related Documentation

- [Cronus-Schedule-Syntax](docs/Cronus-Schedule-Syntax.md) - Cron
  expression fields, names, steps, and POSIX matching semantics
- [Cronus-Jobs](docs/Cronus-Jobs.md) - Job lifecycle, overlap
  prevention, run-once/run-now, and the event surface
- [Cronus-Errors](errors/Cronus-Errors.md) - The typed error hierarchy

## License

MIT
