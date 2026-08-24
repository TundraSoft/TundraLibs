# Ambient

Request-scoped context that survives `await` — carry a correlation id, trace
and span ids, and any custom fields through an entire logical request without
threading them through every function signature.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

Built on `AsyncLocalStorage`, resolved at runtime via
`process.getBuiltinModule('node:async_hooks')` — genuinely works on
Cloudflare Workers, which expose it under the `nodejs_compat` flag.
**Not supported in a plain browser tab**: there's no fallback, so
`run()`/`child()` throw where no `AsyncLocalStorage` exists.

## The problem it solves

To tag every log line of a request with a `correlationId`, you normally have to
_carry_ it — passing a logger (or the id) down through every function:

```typescript
type Logger = { info(message: string): void };
type Order = { id: string };

async function handleOrder(log: Logger, order: Order) {
  log.info('processing');
  await chargeCard(log, order); // must thread `log`
}
async function chargeCard(log: Logger, order: Order) {
  log.info('charging'); // only works because `log` was threaded in
}
```

Ambient stores the context **once** at the request boundary; anything below
reads it — at any depth, across every `await`, isolated between concurrent
requests. It is built on `AsyncLocalStorage` (uniform across Deno, Bun and Node)
— `slogger` reads request context straight from it for log correlation, and
`tracer` builds its own isolated span store on the same primitive (not the
shared bag; see [Ambient-Integration](docs/Ambient-Integration.md#tracer-who-owns-what)).

## Installation

**Deno:**

```bash
deno add @tundralibs/ambient
```

**Bun:**

```bash
bunx jsr add @tundralibs/ambient
```

**Node.js:**

```bash
npx jsr add @tundralibs/ambient
```

## Real-world examples

### 1. Correlate a request across every layer

Open a context in one edge middleware, reuse an inbound correlation id (or mint
one), then read it anywhere below — including to propagate it to the _next_
service — without threading a thing:

```typescript
import { ambient } from '@tundralibs/ambient';

// Edge middleware — the only place that opens a context.
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

// Several layers down — nothing was threaded here.
async function chargeOrder(orderId: string): Promise<void> {
  const { correlationId } = ambient.get() ?? {};

  // Propagate the id so the trace continues across the wire.
  await fetch('https://payments.internal/charge', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-correlation-id': String(correlationId),
    },
    body: JSON.stringify({ orderId }),
  });
}
```

### 2. Auto-correlate every log line (with `slogger`)

`slogger`'s log methods accept a `() => LogContext` thunk, resolved at log time —
so hand it `ambient.get()` and every line carries whatever the request boundary
set, no `reqId` argument in sight:

```typescript
// Needs a separate install: deno add @tundralibs/slogger
import { LogManager, SyslogSeverities } from '@tundralibs/slogger';
import { ambient } from '@tundralibs/ambient';

const log = LogManager.createSlogger({
  appName: 'orders',
  level: SyslogSeverities.INFO,
});

async function chargeOrder(orderId: string): Promise<void> {
  log.info('charging order', () => ({ ...ambient.get(), orderId }));
  // → { correlationId: '…', userId: '…', orderId: 'ord_42' }
}

// Enrich the live context mid-request; later log lines pick it up automatically.
ambient.run({ correlationId: crypto.randomUUID() }, async () => {
  ambient.set('userId', 'u_123');
  await chargeOrder('ord_42');
});
```

### 3. A per-tenant background worker (`createContext`)

Need context for something other than requests? `createContext<T>()` gives you
an independent, typed store. A worker runs each job in its tenant's context, and
a deep data-access helper reads it with no `tenant` parameter:

```typescript
import { createContext } from '@tundralibs/ambient';

type Tenant = { id: string; schema: string };

const tenantCtx = createContext<Tenant>();

async function handle(_payload: unknown): Promise<void> {}

async function runJob(
  job: { tenant: Tenant; payload: unknown },
): Promise<void> {
  // Each job — even running concurrently — sees only its own tenant.
  await tenantCtx.run(job.tenant, () => handle(job.payload));
}

// Deep in the data layer — picks the schema off the ambient tenant.
function currentSchema(): string {
  return tenantCtx.getOr({ id: 'public', schema: 'public' }).schema;
}
```

## Scope

Ambient is **in-process only**. Propagating context across a network boundary
(W3C `traceparent`) is `tracer`'s job, layered on top; calling `ambient.run` per
request is the web/rpc middleware's job. Ambient just owns "the context that
survives `await`."

## Documentation

- [Concepts](docs/Ambient-Concepts.md) - AsyncLocalStorage, scopes, the mutable
  bag, and your own stores via `createContext`
- [Integration](docs/Ambient-Integration.md) - Wiring slogger, tracer, and
  request boundaries without coupling them
- [Roadmap](ROADMAP.md) - Decisions and deferred items

## License

MIT
