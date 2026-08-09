# Tracer Recipes

Copy-paste integrations. These are **not shipped in-tree**: every framework has
its own context shape and release cadence, and shipping adapters for each means
tracking version drift across frameworks we don't control. They are ~10 lines
each, and writing your own keeps full type knowledge of _your_ context — you can
write back to it (`ctx.span = span`), which a generic adapter cannot.

Everything below works with the core package as-is — `startActiveSpan`,
`extract`, and `inject` are all an adapter needs.

## Inbound: server middleware

The shape is always the same — extract the inbound `traceparent`, open a
`SERVER` span, run the handler inside it, record the status on the way out.

### Fetch-standard (Deno.serve, Bun.serve, Hono, compat/webserver)

```typescript
import { extract, inject, SpanKind, SpanStatusCode } from '@tundralibs/tracer';

const traced =
  (handler: (req: Request) => Promise<Response>) =>
  async (req: Request): Promise<Response> => {
    const { pathname } = new URL(req.url);
    return tracer.startActiveSpan(
      `${req.method} ${pathname}`,
      { kind: SpanKind.SERVER, parent: extract(req.headers) },
      async (span) => {
        span.setAttributes({ 'http.method': req.method, 'url.path': pathname });
        const res = await handler(req);
        span.setAttribute('http.status_code', res.status);
        if (res.status >= 500) span.setStatus(SpanStatusCode.ERROR);
        return res;
      },
    );
  };
```

### Express

```typescript
app.use((req, res, next) => {
  tracer.startActiveSpan(
    `${req.method} ${req.path}`,
    { kind: SpanKind.SERVER, parent: extract(req.headers) },
    (span) => {
      // Express signals completion via the response, not a promise.
      res.on('finish', () => {
        span.setAttribute('http.status_code', res.statusCode);
        if (res.statusCode >= 500) span.setStatus(SpanStatusCode.ERROR);
        span.end();
      });
      next();
    },
  );
});
```

> Note the `res.on('finish')`: because `next()` returns immediately, the span
> must be ended by the response lifecycle rather than by `startActiveSpan`.
> Ending twice is harmless — `end()` is idempotent.

### Koa

```typescript
app.use((ctx, next) =>
  tracer.startActiveSpan(
    `${ctx.method} ${ctx.path}`,
    { kind: SpanKind.SERVER, parent: extract(ctx.headers) },
    async (span) => {
      ctx.span = span; // your context, your types
      await next();
      span.setAttribute('http.status_code', ctx.status);
      if (ctx.status >= 500) span.setStatus(SpanStatusCode.ERROR);
    },
  )
);
```

### Oak

```typescript
app.use((ctx, next) =>
  tracer.startActiveSpan(
    `${ctx.request.method} ${ctx.request.url.pathname}`,
    { kind: SpanKind.SERVER, parent: extract(ctx.request.headers) },
    async (span) => {
      await next();
      span.setAttribute('http.status_code', ctx.response.status);
    },
  )
);
```

### RadRouter / RPC

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
```

## Outbound: propagating the trace

Open a `CLIENT` span and inject `traceparent` so the callee joins this trace.

```typescript
const tracedFetch = (input: string, init: RequestInit = {}) =>
  tracer.startActiveSpan(
    `${init.method ?? 'GET'} ${new URL(input).pathname}`,
    { kind: SpanKind.CLIENT },
    async (span) => {
      const headers = new Headers(init.headers);
      headers.set('traceparent', inject(span.context));
      const res = await fetch(input, { ...init, headers });
      span.setAttribute('http.status_code', res.status);
      return res;
    },
  );
```

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

For deterministic ids, inject a fixed byte source:

```typescript
import { createRandomIdGenerator } from '@tundralibs/tracer';

const idGenerator = createRandomIdGenerator(
  (n) => new Uint8Array(n).fill(0x0a),
);
new Tracer({ serviceName: 'test', idGenerator, exporter });
```
