# Tracer Recipes

Copy-paste integrations for the frameworks and runtimes people actually deploy
on.

These are **not shipped in-tree**. Every framework has its own context shape and
release cadence, so shipping adapters would mean tracking version drift across
projects we don't control — and a generic adapter cannot _write_ to a context it
doesn't know (`ctx.span = span`), which is usually the thing you want. They are
~10 lines each, and yours keeps full type knowledge of your own context.

Everything below works with the package as-is: `startActiveSpan`, `extract` and
`inject` are all an adapter needs. Each example assumes a `tracer` in scope and
these imports:

```typescript
import {
  extract,
  inject,
  SemConv,
  SpanKind,
  SpanStatusCode,
} from '@tundralibs/tracer';
```

## Table of Contents

- [The shape](#the-shape)
- [Fetch-standard runtimes](#fetch-standard-runtimes) — Deno.serve, Bun.serve,
  Cloudflare Workers
- [Hono](#hono)
- [Express](#express)
- [Fastify](#fastify)
- [Koa](#koa)
- [NestJS](#nestjs)
- [Oak](#oak)
- [h3 / Nitro / Nuxt](#h3--nitro--nuxt)
- [SvelteKit](#sveltekit)
- [Next.js](#nextjs)
- [AWS Lambda](#aws-lambda)
- [RadRouter / RPC](#radrouter--rpc)
- [Outbound: propagating the trace](#outbound-propagating-the-trace)
- [Tracing drivers without wrapping every call](#tracing-drivers-without-wrapping-every-call)
- [Tracing norm: flat spans free, nested spans with a witness](#tracing-norm-flat-spans-free-nested-spans-with-a-witness)
- [Serverless: flush before the runtime freezes](#serverless-flush-before-the-runtime-freezes)
- [Testing traces](#testing-traces)

## The shape

Every inbound adapter is the same four steps:

1. **extract** the inbound `traceparent`, so this service joins the caller's
   trace instead of starting a new one
2. open a **`SERVER`** span
3. run the handler **inside** it, so everything below parents automatically
4. record the status on the way out

Frameworks differ only in _where headers live_, _how you learn the status_, and
_whether the handler is wrapped or signalled_. Two families:

- **Wrapping** (`await next()` returns) — the span closes naturally when
  `startActiveSpan`'s callback settles. Hono, Koa, Oak, SvelteKit.
- **Signalling** (`next()`/`done()` returns immediately) — the response
  lifecycle ends the span. Express, Fastify. `end()` is idempotent, so calling
  it from an event handler is safe.

## Fetch-standard runtimes

Covers `Deno.serve`, `Bun.serve`, Cloudflare Workers, and
`@tundralibs/compat/webserver` — anything whose handler is
`(Request) => Response`.

```typescript
const traced =
  (handler: (req: Request) => Promise<Response>) =>
  (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    return tracer.startActiveSpan(
      `${req.method} ${pathname}`,
      { kind: SpanKind.SERVER, parent: extract(req.headers) },
      async (span) => {
        span.setAttributes({
          [SemConv.HTTP_REQUEST_METHOD]: req.method,
          [SemConv.URL_PATH]: pathname,
        });
        const res = await handler(req);
        span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, res.status);
        if (res.status >= 500) span.setStatus(SpanStatusCode.ERROR);
        return res;
      },
    );
  };

Deno.serve(traced(myHandler));
```

## Hono

`c.req.raw` is the underlying `Request`, so the headers are Fetch-standard.
Prefer `c.req.routePath` over the resolved path — `/orders/:id` groups in a
backend, `/orders/42` does not.

```typescript
app.use('*', (c, next) =>
  tracer.startActiveSpan(
    `${c.req.method} ${c.req.routePath}`,
    { kind: SpanKind.SERVER, parent: extract(c.req.raw.headers) },
    async (span) => {
      c.set('span', span); // your context, your types
      await next();
      span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, c.res.status);
      if (c.res.status >= 500) span.setStatus(SpanStatusCode.ERROR);
    },
  ));
```

## Express

Express signals rather than wraps: `next()` returns immediately, so the response
lifecycle has to end the span.

```typescript
app.use((req, res, next) => {
  tracer.startActiveSpan(
    `${req.method} ${req.path}`,
    { kind: SpanKind.SERVER, parent: extract(req.headers) },
    (span) => {
      res.on('finish', () => {
        span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, res.statusCode);
        if (res.statusCode >= 500) span.setStatus(SpanStatusCode.ERROR);
        span.end();
      });
      next();
    },
  );
});
```

Downstream spans still parent correctly even though `next()` returns
immediately: async work _started_ inside the active scope keeps the context
through its continuations, which is exactly what `AsyncLocalStorage` guarantees.

## Fastify

Same signalling shape as Express, via hooks. `onRequest` opens the span,
the raw response's `finish` closes it.

```typescript
fastify.addHook('onRequest', (request, reply, done) => {
  tracer.startActiveSpan(
    `${request.method} ${request.routeOptions?.url ?? request.url}`,
    { kind: SpanKind.SERVER, parent: extract(request.headers) },
    (span) => {
      reply.raw.on('finish', () => {
        span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, reply.statusCode);
        if (reply.statusCode >= 500) span.setStatus(SpanStatusCode.ERROR);
        span.end();
      });
      done();
    },
  );
});
```

`request.routeOptions.url` is the route template; fall back to `request.url`
only when no route matched, and expect that to be high-cardinality.

## Koa

Koa wraps — `await next()` returns once the downstream chain finishes.

```typescript
app.use((ctx, next) =>
  tracer.startActiveSpan(
    `${ctx.method} ${ctx._matchedRoute ?? ctx.path}`,
    { kind: SpanKind.SERVER, parent: extract(ctx.headers) },
    async (span) => {
      ctx.span = span;
      await next();
      span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, ctx.status);
      if (ctx.status >= 500) span.setStatus(SpanStatusCode.ERROR);
    },
  )
);
```

## NestJS

An interceptor is the natural fit, but it returns an **Observable**, and that
changes which API to use.

`startActiveSpan` ends the span as soon as its callback returns a value that is
not a promise — so handing it an Observable would end the span the instant the
stream is _constructed_, recording a ~0ms duration. Use `startSpan` for the
manual lifetime and `activeSpan.run` to make it the parent, then close it in
`finalize`:

```typescript
import {
  activeSpan,
  extract,
  SpanKind,
  SpanStatusCode,
} from '@tundralibs/tracer';

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    const span = tracer.startSpan(
      `${req.method} ${context.getClass().name}.${context.getHandler().name}`,
      { kind: SpanKind.SERVER, parent: extract(req.headers) },
    );

    return activeSpan.run(span, () =>
      next.handle().pipe(
        tap({
          next: () =>
            span.setAttribute(
              SemConv.HTTP_RESPONSE_STATUS_CODE,
              res.statusCode,
            ),
          error: (err) => {
            span.recordException(err);
            span.setStatus(SpanStatusCode.ERROR, String(err?.message ?? err));
          },
        }),
        finalize(() => span.end()),
      ));
  }
}
```

The same applies to **any** callback returning a non-promise thenable or stream:
`startActiveSpan` cannot know when it finished, so own the lifetime yourself.

## Oak

```typescript
app.use((ctx, next) =>
  tracer.startActiveSpan(
    `${ctx.request.method} ${ctx.request.url.pathname}`,
    { kind: SpanKind.SERVER, parent: extract(ctx.request.headers) },
    async (span) => {
      await next();
      span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, ctx.response.status);
    },
  )
);
```

## h3 / Nitro / Nuxt

h3 handlers wrap, and its helpers keep this runtime-agnostic.

```typescript
import { defineEventHandler, getRequestHeaders, getResponseStatus } from 'h3';

export default defineEventHandler((event) =>
  tracer.startActiveSpan(
    `${event.method} ${event.path}`,
    { kind: SpanKind.SERVER, parent: extract(getRequestHeaders(event)) },
    async (span) => {
      const result = await handler(event);
      span.setAttribute(
        SemConv.HTTP_RESPONSE_STATUS_CODE,
        getResponseStatus(event),
      );
      return result;
    },
  )
);
```

## SvelteKit

The `handle` hook wraps the whole request, and `resolve(event)` returns the
`Response` — so the status is available directly.

```typescript
// src/hooks.server.ts
export const handle: Handle = ({ event, resolve }) =>
  tracer.startActiveSpan(
    `${event.request.method} ${event.route.id ?? event.url.pathname}`,
    { kind: SpanKind.SERVER, parent: extract(event.request.headers) },
    async (span) => {
      event.locals.span = span; // typed via App.Locals
      const response = await resolve(event);
      span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, response.status);
      if (response.status >= 500) span.setStatus(SpanStatusCode.ERROR);
      return response;
    },
  );
```

`event.route.id` is the route template (`/orders/[id]`); prefer it over
`url.pathname`.

## Next.js

Route handlers are Fetch-standard, so wrap them like any other handler:

```typescript
// app/api/orders/route.ts
export const GET = traced(async (req: Request) => {
  return Response.json(await listOrders());
});
```

with `traced` from [Fetch-standard runtimes](#fetch-standard-runtimes).

> Next.js **middleware** (`middleware.ts`) runs on the Edge runtime and is
> deliberately short-lived — it is the wrong place to own a span, because the
> exporter may not get a chance to flush. Trace in the route handler.

## AWS Lambda

An API Gateway event carries the headers, so the trace continues from the
caller. Note the flush — see the next section for why it is not optional.

```typescript
export const handler = async (event, context) =>
  tracer.startActiveSpan(
    `${event.requestContext.http.method} ${event.routeKey ?? event.rawPath}`,
    { kind: SpanKind.SERVER, parent: extract(event.headers ?? {}) },
    async (span) => {
      try {
        const result = await businessLogic(event);
        span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, 200);
        return result;
      } finally {
        // The runtime may freeze the instant the promise settles.
        await tracer.shutdown();
      }
    },
  );
```

If the backend is AWS X-Ray, it needs a timestamp-prefixed trace id and rejects
pure-random ones — supply an `idGenerator`, see the README.

## RadRouter / RPC

Both are generic over their middleware type, so the same body works — supply
your own context type and read headers from wherever your context keeps them:

```typescript
type AppMw = (ctx: AppCtx, next: () => Promise<void>) => Promise<void>;

const tracing: AppMw = (ctx, next) =>
  tracer.startActiveSpan(
    ctx.route,
    { kind: SpanKind.SERVER, parent: extract(ctx.headers) },
    () => next(),
  );

const router = new RadRouter<AppMw>();
router.use(tracing);
```

## Outbound: propagating the trace

Open a `CLIENT` span and inject `traceparent`, so the callee joins this trace
rather than starting its own.

```typescript
const tracedFetch = (input: string, init: RequestInit = {}) =>
  tracer.startActiveSpan(
    `${init.method ?? 'GET'} ${new URL(input).pathname}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      const headers = new Headers(init.headers);
      headers.set('traceparent', inject(span.context));
      const res = await fetch(input, { ...init, headers });
      span.setAttribute(SemConv.HTTP_RESPONSE_STATUS_CODE, res.status);
      if (res.status >= 500) span.setStatus(SpanStatusCode.ERROR);
      return res;
    },
  );
```

The same shape wraps a database call — `CLIENT` kind, `db.*` attributes, no
header injection:

```typescript
const tracedQuery = (sql: string, params: unknown[]) =>
  tracer.startActiveSpan(
    'db.query',
    { kind: SpanKind.CLIENT },
    async (span) => {
      span.setAttributes({
        [SemConv.DB_SYSTEM]: 'postgres',
        [SemConv.DB_OPERATION_NAME]: sql.split(' ')[0],
      });
      return await db.query(sql, params);
    },
  );
```

> Set `db.query.text` only if you are certain the statement carries no user
> data — it is a common way to leak PII into a trace backend.

## Tracing drivers without wrapping every call

Wrapping works, but only if you remember it at every call site.
`@tundralibs/drivers` engines are `Options`/`Events` subclasses that already
emit the hooks a tracer wants, so you can instrument **once, per engine**, with
no dependency in either direction — drivers never learns about tracer, and
tracer never learns about drivers.

```typescript
import { SemConv, SpanKind, SpanStatusCode } from '@tundralibs/tracer';

/** Attach tracing to a query engine. Call once, at wire-up. */
export function traceEngine(engine: QueryEngine, dbSystem: string): void {
  engine.on('query', (_instanceId, result) => {
    // The event fires as the query completes, so reconstruct the window from
    // the reported duration rather than guessing at it.
    const end = new Date();
    const span = tracer.startSpan('db.query', {
      kind: SpanKind.CLIENT,
      startTime: new Date(end.getTime() - result.time),
      attributes: {
        [SemConv.DB_SYSTEM]: dbSystem,
        'db.rows_affected': result.count,
      },
    });
    span.end(end);
  });

  engine.on('error', (_instanceId, error) => {
    const span = tracer.startSpan('db.error', { kind: SpanKind.CLIENT });
    span.recordException(error);
    span.setStatus(SpanStatusCode.ERROR);
    span.end();
  });
}
```

**Why this parents correctly.** The event is emitted _during_ the query call, so
the ambient active span is still the caller's — the span created in the handler
lands under whatever request span was open, with no context threading. Same
mechanism that makes `startSpan` parent automatically everywhere else.

Other events worth hanging spans off: `slowQuery`, `transactionBegin` /
`transactionCommit` / `transactionRollback` (they carry a `transactionId`, so a
whole transaction can be one span), `connectionFailed`, and `notice`.

> `EngineQueryResult` carries `{ id, query, count, time }`. Putting
> `result.query` on the span puts the **statement** in your trace backend —
> treat it exactly like `db.query.text` above: sanitise, or leave it off.

For `@tundralibs/norm`, see the next section — it forwards these driver
events AND adds an operation layer on top.

## Tracing norm: flat spans free, nested spans with a witness

norm gives you two layers. **Layer 1 is events** — norm re-emits the driver's
`query`/`slowQuery` (metadata only: no SQL text or params ever cross norm's
bus) and adds its own operation-level `call` event. Both yield retrospective
spans that parent to whatever request span is active:

```typescript
// Per-query spans — same idea as the drivers recipe, via norm's bus.
// Signature: (engineId, queryId, timeMs, isSlow, transactionId)
norm.on('query', (_engine, _qid, timeMs, _slow, txId) => {
  const end = new Date();
  const span = tracer.startSpan('db.query', {
    kind: SpanKind.CLIENT,
    startTime: new Date(end.getTime() - timeMs),
  });
  if (txId) span.setAttribute('db.transaction_id', txId);
  span.end(end);
});

// Per-OPERATION spans — norm's own layer. `id` is the same ULID returned in
// the operation's NormResult envelope, so spans correlate with results.
// Signature: (entity, op, timeMs, isSlow, id)
norm.on('call', (entity, op, timeMs, _slow, id) => {
  const end = new Date();
  tracer.startSpan(`norm.${entity}.${op}`, {
    kind: SpanKind.INTERNAL,
    startTime: new Date(end.getTime() - timeMs),
    attributes: { 'norm.entity': entity, 'norm.result_id': id },
  }).end(end);
});
```

> Attach per-query tracing at **one** level — norm's bus _or_ the engine, not
> both, or every query gets two spans. norm's forwarded events are the
> privacy-safe choice (no statement text); the engine's carry the SQL.

**Layer 2 is the `witness`** — event spans are flat: nothing links a `call`
span to the queries it caused, because a span created in an event handler is
never _active_ while the operation runs. The witness closes exactly that gap:

```typescript
const norm = new Norm({
  engine,
  witness: (info, fn) =>
    tracer.startActiveSpan(
      info.name, // 'norm.Users.find', 'norm.raw', …
      { kind: SpanKind.INTERNAL, attributes: info.attributes },
      fn,
    ),
});
```

```text
GET /orders                      ← request span (middleware)
└─ norm.Orders.find              ← witness: ACTIVE while the operation runs
   ├─ db.query                   ← event span parents here automatically
   └─ db.query   (relation load)
```

With the witness on, drop the `call` handler (the witness span replaces it —
keeping both double-reports every operation) and keep the `query` handler for
the children. The gap between an operation span and its child query spans is
norm's own overhead — validation, hooks, and per-cell crypto on encrypted
columns — surfaced per operation, for free.

## Serverless: flush before the runtime freezes

On Lambda, Cloudflare Workers and similar, the runtime may **freeze or discard
the instance the moment your handler's promise settles**. A
`BatchSpanProcessor` holding a partial batch loses it — silently, so it looks
exactly like "tracing isn't working".

Two ways to avoid it:

```typescript
// 1. Flush explicitly before returning.
await tracer.shutdown();

// 2. Cloudflare Workers: let the flush outlive the response.
export default {
  fetch(req: Request, env: Env, ctx: ExecutionContext) {
    return tracer.startActiveSpan(
      'handler',
      { kind: SpanKind.SERVER },
      async (span) => {
        const res = await handle(req);
        ctx.waitUntil(processor.forceFlush());
        return res;
      },
    );
  },
};
```

For very short invocations, consider skipping `BatchSpanProcessor` entirely and
exporting per span — one round-trip is cheaper than losing the trace.

## Testing traces

`MemoryExporter` buffers spans so you can assert on them directly:

```typescript
import { MemoryExporter, Tracer } from '@tundralibs/tracer';

const exporter = new MemoryExporter();
const tracer = new Tracer({ serviceName: 'test', exporter });

tracer.startActiveSpan('work', (span) => span.setAttribute('ok', true));

exporter.find('work')?.attributes.ok; // true
exporter.reset(); // between cases
```

Behind a `BatchSpanProcessor`, call `await processor.forceFlush()` before
asserting — spans are queued, not exported, until a batch or the timer fires.

For deterministic ids, inject a fixed byte source:

```typescript
import { createRandomIdGenerator } from '@tundralibs/tracer';

const idGenerator = createRandomIdGenerator(
  (n) => new Uint8Array(n).fill(0x0a),
);
new Tracer({ serviceName: 'test', idGenerator, exporter });
```
