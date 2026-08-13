# Tracer Concepts

How a trace is built, and why spans nest without being passed around.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Spans and traces](#spans-and-traces)
- [The span lifecycle](#the-span-lifecycle)
- [Why nesting is automatic](#why-nesting-is-automatic)
- [startSpan vs startActiveSpan](#startspan-vs-startactivespan)
- [Span kind](#span-kind)
- [Status and exceptions](#status-and-exceptions)
- [Nothing on a span throws](#nothing-on-a-span-throws)

## Spans and traces

A **span** is one unit of work: a name, a start and end time, and a parent. A
**trace** is the tree of spans that share a `traceId`.

```text
checkout ──────────────────────────────── 210ms   trace 4bf92f…, span aaa…
  auth.verify      ──── 40ms                      trace 4bf92f…, span bbb…, parent aaa…
  db.query           ──────── 120ms               trace 4bf92f…, span ccc…, parent aaa…
```

Every span carries a {@linkcode SpanContext}: the `traceId` it belongs to, its
own `spanId`, and the sampling flag. That triple is the _only_ thing that has to
travel between processes — see [Tracer-Propagation](Tracer-Propagation.md).

The distinction that matters when reading a trace: a **child span** measures a
duration, whereas an **event** marks an instant. Use a child span for "this took
this long", an event for "this happened".

## The span lifecycle

```typescript
import { SpanStatusCode, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });

const span = tracer.startSpan('db.query'); // 1. created, clock starts
span.setAttribute('db.system', 'postgres'); // 2. described
span.addEvent('cache.miss'); //    …and annotated
span.setStatus(SpanStatusCode.ERROR, 'timeout');
span.end(); // 3. clock stops, handed to the exporter
```

`end()` is what queues the span for export, and it is **idempotent** — a second
call is ignored, so `finally { span.end() }` is always safe. After it, the span
is inert: further writes are silently dropped rather than throwing or
retroactively changing an exported span.

Exporters never receive the live `Span`. They receive an immutable
{@linkcode SpanData} snapshot, so a slow or asynchronous exporter cannot observe
a span mid-write or mutate trace state.

## Why nesting is automatic

The usual way to build a span tree is to thread the parent through every call:

```typescript
import { type Span, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });

async function checkout(span: Span) {
  await charge(span); // must pass it
}
async function charge(parentSpan: Span) {
  const s = tracer.startSpan('charge', { parent: parentSpan.context });
  // …
}
```

Tracer keeps the **active span** in an
[`ambient`](../../ambient/README.md) async context instead. `startSpan` reads it
and parents itself automatically:

```typescript
import { Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });

await tracer.startActiveSpan('checkout', async () => {
  await charge(); // no span parameter
});

async function charge() {
  const s = tracer.startSpan('charge'); // parents to `checkout` anyway
  s.end();
}
```

This works across `await`, at any call depth, and keeps concurrent requests
isolated — request A and request B each see their own active span even though
they interleave on one event loop. That property is `AsyncLocalStorage`'s, and
it is the entire reason `ambient` is a dependency.

Tracer keeps the active span in its **own** context store, separate from
`ambient`'s shared `RequestContext`. Span lifecycle is tracer's concern; the
request bag is the application's.

### Runtimes without `AsyncLocalStorage`

That store is built on **first use**, not at import, so importing
`@tundralibs/tracer` succeeds everywhere — including a browser bundle, where
`node:async_hooks` does not exist. What changes there is only what genuinely
depends on a scope:

- `tracer.active()` returns `undefined`, and `tracer.logContext()` /
  `tracer.propagation()` return `{}` — exactly what they return outside any
  span, so callers need no branch.
- `startActiveSpan` (and the `wrap` / `wrapClient` witnesses built on it)
  throws a `TypeError`. Establishing a scope is the one thing that cannot
  degrade quietly: silently running the callback with no active span would
  turn a nested trace into orphaned roots.
- `startSpan`, `span.end()`, exporters and `inject` / `extract` need no
  context at all, so manual span lifecycles and propagation keep working.

On every supported runtime — Deno, Bun, Node >= 22 and Cloudflare Workers
under `nodejs_compat` — the store is a single process-wide instance shared by
every caller, so nesting behaves identically to a store built at import time.

## startSpan vs startActiveSpan

|                       | `startSpan`             | `startActiveSpan`                |
| --------------------- | ----------------------- | -------------------------------- |
| Makes the span active | no                      | yes, for the callback's duration |
| Ends the span         | you must call `end()`   | automatic, including on throw    |
| Spans created inside  | do **not** parent to it | parent to it                     |

Reach for `startActiveSpan` by default. `startSpan` is for the case where a
span's lifetime genuinely does not match a function call — a span you open in
one callback and close in another (see the Express recipe in
[RECIPES.md](Tracer-Recipes.md), where the response event ends the span).

`startActiveSpan` handles async callbacks correctly: it keeps the span open
until the returned promise settles, so the duration covers the real work rather
than just the synchronous head. If the callback throws or rejects, the exception
is recorded on the span and re-thrown unchanged.

## Span kind

{@linkcode SpanKind} tells a backend how to draw the span, and its numeric values
are OTLP's:

| Kind                    | Use for                                       |
| ----------------------- | --------------------------------------------- |
| `INTERNAL`              | work with no remote counterpart (the default) |
| `SERVER`                | handling an inbound request                   |
| `CLIENT`                | making an outbound request                    |
| `PRODUCER` / `CONSUMER` | asynchronous message publish / handle         |

`SERVER` and `CLIENT` are what let a backend pair the two halves of a remote
call and show network time between them, so setting them is worth the keystrokes
at request boundaries.

## Status and exceptions

`UNSET` is the default and means "no explicit judgement" — it is **not** a
failure. Set `ERROR` only for genuine failures, so error-rate panels stay
meaningful.

`recordException()` adds an `exception` event using the OpenTelemetry attribute
names (`exception.type`, `exception.message`, `exception.stacktrace`) so
backends render it as an error. It deliberately does **not** set the span status:
a caught and handled exception is not necessarily a failed operation. Set the
status yourself when it is:

```typescript
import { SpanStatusCode, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });
const span = tracer.startSpan('risky');
const risky = () => Promise.resolve();

try {
  await risky();
} catch (err) {
  span.recordException(err);
  span.setStatus(SpanStatusCode.ERROR, 'risky() failed');
  throw err;
}
```

## Nothing on a span throws

Tracing is observability. It must never be able to break the code it observes,
so every span operation is total:

- writes after `end()` are ignored
- writes to a span that sampling dropped are ignored
- export failures are swallowed (the exporter reports them out of band)
- a malformed inbound `traceparent` just means "start a new trace"

The one place tracer _does_ throw is **construction** — an invalid
`serviceName`, `sampler`, `exporter`, or `idGenerator` raises
{@linkcode TracerConfigError} immediately. A misconfiguration is cheap to
surface at startup and expensive to discover as missing traces later.
