# Ambient Integration

Wiring ambient into the suite — logging, tracing, and request boundaries —
without coupling any of them to each other.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [The composition-root pattern](#the-composition-root-pattern)
- [Opening the scope: middleware](#opening-the-scope-middleware)
- [slogger: automatic log correlation](#slogger-automatic-log-correlation)
- [tracer: who owns what](#tracer-who-owns-what)
- [Correlation ids](#correlation-ids)
- [Background work and queues](#background-work-and-queues)

## The composition-root pattern

Nothing in the suite imports ambient to talk to anything else. `slogger` does
not know ambient exists; `tracer` uses it only for its own span store. The
**application** wires them together at startup — each integration is one line,
and each package stays independently usable.

That is deliberate. If slogger read ambient directly, every consumer of a
logging package would drag in async-context machinery; if tracer wrote spans
into the shared request bag, span lifecycle would leak into application state.
The seams below keep the arrows pointing one way: packages expose hooks, the
app connects them.

## Opening the scope: middleware

Exactly one place should call `ambient.run` per request — the outermost
boundary. Everything below it, at any depth, reads the same bag.

```typescript
import { ambient } from '@tundralibs/ambient';

// Fetch-standard (Deno.serve, Bun.serve, compat/webserver, Workers)
async function withRequestContext(
  req: Request,
  next: () => Promise<Response>,
): Promise<Response> {
  const correlationId = req.headers.get('x-correlation-id') ??
    crypto.randomUUID();
  const { pathname } = new URL(req.url);
  return ambient.run(
    { correlationId, method: req.method, path: pathname },
    next,
  );
}
```

Reusing an inbound `x-correlation-id` (when you trust the caller) is what makes
one id follow a request across your own services. For untrusted edges, always
mint fresh.

Later enrichment goes through `set` — authentication is the classic case:

```typescript
import { ambient } from '@tundralibs/ambient';

const user = { id: 'u_123' };

ambient.set('userId', user.id); // every subsequent log line carries it
```

## slogger: automatic log correlation

`slogger`'s `contextProvider` (shipped in slogger 1.1.0) is a logger-level
thunk invoked per emitted record and merged **under** the call/scope context —
explicit fields always win:

```typescript
// Needs a separate install: deno add @tundralibs/slogger
import { LogManager, SyslogSeverities } from '@tundralibs/slogger';
import { ambient } from '@tundralibs/ambient';

const log = LogManager.createSlogger({
  appName: 'orders',
  level: SyslogSeverities.INFO,
  contextProvider: () => ambient.get() ?? {}, // ← the whole integration
});

ambient.run({ correlationId: 'c1' }, () => {
  log.info('charging'); // → { correlationId: 'c1', ... } with no argument
});
```

Two properties worth knowing:

- **Lazy** — the provider runs only for records that pass the level/handler
  filters, so muted lines never touch ambient.
- **Reference-cached** — `LogManager` compares configs by function identity;
  hoist the provider to a `const` rather than passing a fresh arrow per
  `createSlogger` call.

## tracer: who owns what

`tracer` depends on ambient, but **not** for the request bag — it keeps its
active span in its own `createContext` store. The shared `RequestContext`'s
`traceId`/`spanId` fields are a _convention for you to fill_, not something
tracer writes.

The correlation between logs and traces happens, again, at the composition
root:

```typescript
// Needs a separate install: deno add @tundralibs/slogger
import { LogManager, SyslogSeverities } from '@tundralibs/slogger';
import { ambient } from '@tundralibs/ambient';
// Needs a separate install: deno add @tundralibs/tracer
import { Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });

const log = LogManager.createSlogger({
  appName: 'orders',
  level: SyslogSeverities.INFO,
  contextProvider: () => ({
    ...ambient.get(), // the request bag
    ...tracer.logContext(), // live trace identity, tracer's own store
  }),
});
```

One provider, three sources joined: request context, plus live trace identity
when a span is open. Neither slogger nor tracer learned about the other.
`tracer.logContext` (tracer ≥ 0.4) returns `{ traceId, spanId }` while a span
is open and `{}` otherwise — camelCase, the exact keys slogger's
`otelLogFormatter` hoists into first-class OTel fields.

## Correlation ids

Ambient is **carry-only**: it stores whatever id you hand it and mints nothing.
`crypto.randomUUID()` is the zero-dependency default; reach for
`@tundralibs/id` (ULID, CUID2) when you want sortable or shorter ids — that
choice belongs to the application, which is why ambient has no `id` dependency.

Propagating the id **outward** is also yours — set the header on outbound
calls:

```typescript
import { ambient } from '@tundralibs/ambient';

const url = 'https://payments.internal/charge';

await fetch(url, {
  headers: { 'x-correlation-id': String(ambient.get()?.correlationId ?? '') },
});
```

(W3C `traceparent` propagation is `tracer`'s job and rides a different header;
the two travel independently.)

## Background work and queues

Request context dies with its request — a job picked up later must _rebuild_
its scope from whatever travelled with the message:

```typescript
import { ambient } from '@tundralibs/ambient';

type Job = { payload: unknown; correlationId?: string };

const payload = { orderId: 'ord_42' };
const queue = { enqueue: async (_job: Job): Promise<void> => {} };
const job: Job = { payload, correlationId: 'c1' };
const process = async (_payload: unknown): Promise<void> => {};

// producer: snapshot what the job needs
await queue.enqueue({
  payload,
  correlationId: ambient.get()?.correlationId,
});

// consumer: open a fresh scope per job
await ambient.run(
  { correlationId: job.correlationId ?? crypto.randomUUID() },
  () => process(job.payload),
);
```

For non-request context in workers — the current tenant, say — prefer a
dedicated `createContext` store over overloading the request bag; see
[Ambient-Concepts](Ambient-Concepts.md#your-own-stores-createcontext).
