# Tracer Sampling

Deciding which traces to keep, without producing traces full of holes.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Head-based sampling](#head-based-sampling)
- [Children inherit, never re-sample](#children-inherit-never-re-sample)
- [Deterministic ratio sampling](#deterministic-ratio-sampling)
- [Unsampled spans still propagate](#unsampled-spans-still-propagate)
- [Writing a sampler](#writing-a-sampler)
- [Tail-based sampling](#tail-based-sampling)

## Head-based sampling

The decision is made **once, when a span is created**, before anything about its
outcome is known. That is what "head-based" means, and it is the only kind an
in-process SDK can do correctly: to decide based on a trace's _outcome_ you
would have to buffer every span of every trace until it completed.

The consequence to design around: **you cannot sample on "was it slow" or "did
it error"** here. If you need that, see
[tail-based sampling](#tail-based-sampling).

```typescript
import { ratioSampler, Tracer } from '@tundralibs/tracer';

new Tracer({ serviceName: 'orders', sampler: ratioSampler(0.1) });
```

The built-ins are `alwaysOnSampler` (the default), `alwaysOffSampler`, and
`ratioSampler(fraction)`.

## Children inherit, never re-sample

A sampler is consulted for **root spans only**. Every child inherits its
parent's decision, including a parent that arrived from another service via
`traceparent`.

This is not an optimisation, it is a correctness requirement. If each span
sampled independently at 10%, a five-span trace would keep roughly one span in
two traces and drop the rest — producing waterfalls with holes in the middle,
where a parent exists but its children vanished. A trace is only useful sampled
**whole or not at all**.

```typescript
import { Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });

tracer.startActiveSpan('root', () => { // sampler runs here, once
  tracer.startSpan('child-1').end(); // inherits
  tracer.startSpan('child-2').end(); // inherits
});
```

The same applies across services: an inbound `traceparent` whose flags say
"unsampled" means this service records nothing for that trace either, so the
upstream decision holds end to end.

## Deterministic ratio sampling

`ratioSampler` derives its verdict from the **trace id itself**, never from a
random draw:

```typescript
import type { Sampler } from '@tundralibs/tracer';

const ratioSampler = (ratio: number): Sampler => {
  const threshold = Math.floor(ratio * 2 ** 32);
  return ({ traceId }) => Number.parseInt(traceId.slice(-8), 16) < threshold;
};
```

Because trace ids are uniformly random, reading a fixed 32-bit window of one
gives a uniformly distributed value — so comparing it against a threshold keeps
exactly `ratio` of traces. And because the input is the trace id rather than a
random number, **every service that uses the same ratio reaches the same verdict
for a given trace**.

That matters when a trace crosses a service that starts its own root span (a
queue consumer, say, that lost the header). With a random sampler the two halves
of the system would disagree and you would collect fragments. With a
deterministic one they agree without coordinating.

Edge values collapse to the constant samplers: `ratio <= 0` (and `NaN`) become
`alwaysOffSampler`, `ratio >= 1` becomes `alwaysOnSampler`.

## Unsampled spans still propagate

A dropped span is not a no-op object. It still has a real `SpanContext`, and its
`traceparent` still serialises — with the sampled flag **clear**:

```typescript
import { alwaysOffSampler, inject, Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({
  serviceName: 'orders',
  sampler: alwaysOffSampler,
});

const span = tracer.startSpan('dropped'); // sampler said no
span.isRecording(); // false
span.context.traceId; // a real trace id
inject(span.context); // 00-…-…-00  ← flag clear
```

So correlation keeps working even when nothing is exported: log lines can still
carry `traceId` (`tracer.logContext` reports ids for unsampled spans too), and
a downstream service still learns that this trace is not being sampled rather
than deciding again for itself.

Use `isRecording()` to skip work you would only do for the exporter's benefit:

```typescript
import { Tracer } from '@tundralibs/tracer';

const tracer = new Tracer({ serviceName: 'orders' });
const span = tracer.startSpan('db.query');
const sql = 'SELECT 1';
const expensiveToRedact = (q: string) => q;

if (span.isRecording()) {
  span.setAttribute('db.query.text', expensiveToRedact(sql));
}
```

## Writing a sampler

A {@linkcode Sampler} is a plain function of {@linkcode SamplingInput}:

```typescript
import { type Sampler, SemConv } from '@tundralibs/tracer';

// Always keep health checks out, keep everything else.
const skipHealthChecks: Sampler = ({ attributes }) =>
  attributes[SemConv.URL_PATH] !== '/healthz';
```

Two constraints the built-ins respect and a custom one should too:

1. **Be deterministic for a given trace id**, or independent services will
   disagree and traces will fragment.
2. **Be cheap.** It runs on the creation of every root span, on the request
   path.

Note the sampler sees only what is knowable at creation: trace id, name, kind,
the attributes passed to `startSpan`, and the parent. There is no duration or
status to branch on.

## Tail-based sampling

Deciding _after_ a trace finishes — "keep every trace that errored or took over
a second" — requires buffering complete traces across every service that
contributed to them. That is a collector's job, not an in-process SDK's, and it
is explicitly out of scope here.

The standard arrangement: sample everything at the SDK (`alwaysOnSampler`), send
it to an OTel Collector, and configure the tail-sampling processor there. See
[Tracer-OTLP](Tracer-OTLP.md) for pointing tracer at a collector.
