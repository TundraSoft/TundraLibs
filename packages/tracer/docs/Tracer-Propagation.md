# Tracer Propagation

Carrying a trace across process boundaries with W3C Trace Context.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)

## Table of Contents

- [The traceparent header](#the-traceparent-header)
- [Inbound: extract](#inbound-extract)
- [Outbound: inject](#outbound-inject)
- [A complete hop](#a-complete-hop)
- [Why extract never throws](#why-extract-never-throws)
- [What is not propagated](#what-is-not-propagated)

## The traceparent header

In-process, the active span travels through `ambient`. Across a network
boundary it travels as a single header, defined by
[W3C Trace Context](https://www.w3.org/TR/trace-context/):

```text
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ├┘ ├──────────────────────────────┘ ├──────────────┘ ├┘
             │  trace-id (16 bytes, 32 hex)      span-id (8B/16h) flags
             version
```

- **trace-id** — the whole trace. Reused by every service in it.
- **span-id** — the _caller's_ span, which becomes the callee's parent.
- **flags** — bit 0 is the sampled flag; see
  [Tracer-Sampling](Tracer-Sampling.md).

All hex is lowercase, and neither id may be all-zero. Both rules are enforced on
parse and on generation.

## Inbound: extract

`extract` turns headers into a `SpanContext` to use as a
parent:

```typescript
import { extract, type Span, SpanKind, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'payments' });
const request = new Request('https://payments.internal/charge', {
  method: 'POST',
});
const route = '/charge';
const handler = (_span: Span) => {};

const parent = extract(request.headers);

tracer.startActiveSpan(
  `${request.method} ${route}`,
  { kind: SpanKind.SERVER, parent },
  handler,
);
```

`parent` being `undefined` is not an error — it means no usable header arrived,
so this service starts a new trace. Passing `undefined` as `parent` is exactly
equivalent to omitting it.

`extract` accepts anything header-shaped, because it never assumes a framework:

- a Web-standard `Headers`
- Node's `IncomingHttpHeaders` (a plain object, values possibly arrays)
- any `Record<string, string>` — an RPC envelope's metadata, a queue message's
  attributes

Lookup is case-insensitive, and an array-valued header uses its first entry.

## Outbound: inject

`inject` serialises a span's context back into a header value, so the
callee's `extract` picks up where you left off:

```typescript
import { inject, SpanKind, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });
const url = 'https://payments.internal/charge';

await tracer.startActiveSpan(
  'POST /charge',
  { kind: SpanKind.CLIENT },
  async (span) => {
    await fetch(url, {
      method: 'POST',
      headers: { traceparent: inject(span.context) },
    });
  },
);
```

Inject the **current span's** context, not the parent's — the callee's root span
should be a child of the span that made the call, otherwise the waterfall loses
a level.

## A complete hop

```typescript
import { extract, inject, SpanKind, Tracer } from '@tundralibs/tracer';

const a = new Tracer({ serviceName: 'orders' });
const b = new Tracer({ serviceName: 'payments' });

// ---- service A ----
let header = '';
await a.startActiveSpan('checkout', { kind: SpanKind.CLIENT }, (span) => {
  header = inject(span.context); // 00-4bf92f…-aaa…-01
});

// ---- over the wire ----

// ---- service B ----
const parent = extract({ traceparent: header });
await b.startActiveSpan(
  'POST /charge',
  { kind: SpanKind.SERVER, parent },
  async () => {/* handle the request */},
);
```

Service B's span now shares A's `traceId` and lists A's `spanId` as its parent,
so a backend renders both services in one waterfall. Both must be sampled for
that to be true — which is why the flag rides along and why children inherit it.

## Why extract never throws

A `traceparent` is attacker-controllable in exactly the same way any request
header is. `extract` therefore returns `undefined` rather than throwing for
every malformed case: wrong field count, non-hex characters, uppercase hex, the
reserved `ff` version, or an all-zero id.

The consequence is deliberate — a broken or hostile upstream header costs you
trace _continuity_ (this service starts a fresh trace) but never availability.
Tracing must not be a way to break request handling.

Forward compatibility works the same way: the parser reads the first four fields
positionally, so a future `traceparent` version with extra fields still yields a
usable trace id and span id instead of being rejected.

## What is not propagated

- **W3C `baggage`** — a separate specification for propagating arbitrary
  key/value pairs alongside the trace. Not implemented; see
  [ROADMAP.md](../ROADMAP.md).
- **`tracestate`** — vendor-specific trace metadata. Not implemented.
- **Application context** — a user id, tenant, or correlation id is
  [`ambient`](../../ambient/README.md)'s job in-process, and yours to put on the
  wire if you want it there.

Tracer propagates trace identity, and nothing else.
