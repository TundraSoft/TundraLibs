# Tracer

Distributed tracing that shows where a request actually spent its time —
across functions, and across services. Completes the observability triad with
[Slogger](../slogger/README.md) (logs) and [MetroMan](../metro-man/README.md)
(metrics).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## What it gives you

A log line says _one event happened_. A trace says _where the time went_:

```text
checkout ──────────────────────────────── 210ms
  auth.verify      ──── 40ms
  db.query           ──────── 120ms
  POST /charge              ───── 45ms   ← a different service, same trace
```

Each box is a **span**. Spans nest **automatically** — a span opened inside
another becomes its child at any call depth and across every `await` — because
the active span lives in an [ambient](../ambient/README.md) async context
instead of being threaded through function signatures. W3C `traceparent`
propagation carries the trace across process boundaries.

## Installation

**Deno:**

```bash
deno add @tundralibs/tracer
```

**Bun:**

```bash
bunx jsr add @tundralibs/tracer
```

**Node.js:**

```bash
npx jsr add @tundralibs/tracer
```

## Real-world examples

### 1. Trace a request, end to end

`startActiveSpan` makes the span active for the callback's whole lifetime, so
nothing below needs a `span` parameter:

```typescript
import { ConsoleExporter, SpanKind, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({
  serviceName: 'orders',
  exporter: new ConsoleExporter(),
});

await tracer.startActiveSpan('checkout', async (span) => {
  span.setAttribute('order.id', 'ord_42');

  await tracer.startActiveSpan('db.query', async () => {
    await db.query('SELECT …'); // auto-parents to `checkout`
  });

  await chargeCard(); // spans started in here parent too — no threading
});
```

### 2. Continue a trace across a service boundary

`extract` joins the caller's trace on the way in; `inject` hands it onward:

```typescript
import { extract, inject, SpanKind } from '@tundralibs/tracer';

// Inbound — join the caller's trace (or start one if there's no header).
const parent = extract(request.headers);

await tracer.startActiveSpan(
  `${request.method} ${route}`,
  { kind: SpanKind.SERVER, parent },
  async (span) => {
    // Outbound — pass the trace on, so the callee's spans join this trace.
    await fetch('https://payments.internal/charge', {
      method: 'POST',
      headers: { traceparent: inject(span.context) },
    });
  },
);
```

### 3. Correlate logs with traces

Slogger's `contextProvider` is called for every record, so trace ids land on
every log line — click a log, jump to its trace:

```typescript
import { LogManager } from '@tundralibs/slogger';

const log = LogManager.createSlogger({
  appName: 'orders',
  contextProvider: () => {
    const span = tracer.active();
    return span
      ? { trace_id: span.context.traceId, span_id: span.context.spanId }
      : {};
  },
});

log.info('charging'); // → { trace_id: '4bf92f…', span_id: '00f067…' }
```

### 4. Sample a fraction of traces

`ratioSampler` derives its decision from the trace id, so every service that
uses the same ratio agrees — traces stay complete end-to-end rather than
fragmenting:

```typescript
import { ratioSampler, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({
  serviceName: 'orders',
  sampler: ratioSampler(0.1), // 10% of traces, whole
});
```

Child spans **inherit** the parent's decision — a trace is always sampled whole
or not at all. Unsampled spans still carry and propagate their context, so
correlation keeps working even when nothing is exported.

### 5. A framework-agnostic tracing middleware

Tracer never sees your framework's context, so you write the ~10-line adapter
and keep full type knowledge — including writing back to `ctx`:

```typescript
async function tracing(ctx, next) {
  const parent = extract(ctx.request.headers);
  return tracer.startActiveSpan(
    `${ctx.request.method} ${ctx.route}`,
    { kind: SpanKind.SERVER, parent },
    async (span) => {
      ctx.span = span; // your ctx, your types
      await next();
      span.setAttribute('http.status_code', ctx.response.status);
    },
  );
}
```

See [Recipes](docs/Tracer-Recipes.md) for ready-made adapters — Hono, Express,
Fastify, Koa, NestJS, Oak, h3, SvelteKit, Next.js, Lambda and Workers.

### 6. Ship spans to a collector (OTLP)

The OTLP exporter lives behind its own subpath, so importing the tracer never
pulls an HTTP client into a CLI or worker that only creates spans. Wrap it in
`BatchSpanProcessor` — otherwise every ending span costs one HTTP round-trip:

```typescript
import { BatchSpanProcessor, Tracer } from '@tundralibs/tracer';
import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';

const tracer = new Tracer({
  serviceName: 'orders',
  exporter: new BatchSpanProcessor(
    new OTLPExporter({
      baseURL: 'http://localhost:4318', // collector root, not the signal path
      headers: { 'x-api-key': Deno.env.get('OTLP_KEY') ?? '' },
      // Export failures are silent by design — this is how you see them.
      onExportError: (err) => console.error('otlp export failed', err),
    }),
    { maxExportBatchSize: 512, scheduledDelayMs: 5000 },
  ),
});

// Before exit, so buffered spans are not lost.
await tracer.shutdown();
```

OTLP over **HTTP with a JSON payload** only. gRPC and protobuf are out of
scope — run the OTel Collector, which accepts JSON and re-exports in whatever
your backend wants.

### 7. Use the semantic-convention keys

Backends key their UI off these exact strings, so `SemConv` keeps them a
compile-time concern rather than a typo:

```typescript
import { SemConv } from '@tundralibs/tracer';

span.setAttributes({
  [SemConv.HTTP_REQUEST_METHOD]: 'GET',
  [SemConv.HTTP_RESPONSE_STATUS_CODE]: 200,
  [SemConv.URL_PATH]: '/orders/42',
});
```

## Custom id generation

Ids are random by default. Override when a backend needs a specific format —
AWS X-Ray requires a timestamp-prefixed trace id and rejects pure-random ones —
or to make ids deterministic in tests. A custom generator is smoke-tested once
at construction, because malformed ids are _silently dropped_ by collectors:

```typescript
new Tracer({ serviceName: 'orders', idGenerator: myGenerator });
```

## Design notes

- **Nothing on a span throws.** Tracing is observability; it must never break
  the code it observes. Export failures are swallowed, writes after `end()` are
  ignored, and a malformed inbound `traceparent` just means "start a new trace".
- **Config errors throw loudly** at construction — that is the one place a
  mistake is cheap to surface.
- **Core is dependency-light**: `ambient` + `utils`. The OTLP exporter lives
  behind its own subpath so an HTTP client is never pulled into the core graph.

## Documentation

- [Concepts](docs/Tracer-Concepts.md) - Spans, the lifecycle, and why nesting is
  automatic
- [Propagation](docs/Tracer-Propagation.md) - W3C Trace Context across service
  boundaries
- [Sampling](docs/Tracer-Sampling.md) - Head-based sampling and why children
  never re-sample
- [Exporters](docs/Tracer-Exporters.md) - The exporter contract, batching, and
  writing your own
- [OTLP](docs/Tracer-OTLP.md) - Shipping to a real backend, and the encodings
  that decide whether spans arrive
- [Recipes](docs/Tracer-Recipes.md) - Framework adapters for 12 runtimes and
  frameworks
- [Roadmap](ROADMAP.md) - What is deliberately not built yet

## License

MIT
