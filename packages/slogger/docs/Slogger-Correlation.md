# Slogger Correlation

Logs that know their request and their trace — `contextProvider`, ambient,
tracer, and the OTel formatter, wired end to end.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [What correlation buys you](#what-correlation-buys-you)
- [The seam: contextProvider](#the-seam-contextprovider)
- [Request context via ambient](#request-context-via-ambient)
- [Trace identity via tracer](#trace-identity-via-tracer)
- [The payoff: otelLogFormatter hoisting](#the-payoff-otellogformatter-hoisting)
- [The full wiring, in one place](#the-full-wiring-in-one-place)

## What correlation buys you

An uncorrelated log line answers "what happened". A correlated one answers
"what happened **to this request**" — you grep one `correlationId` and read the
request's whole story, or click a log line in an OTel backend and land on its
trace waterfall.

Slogger stays decoupled throughout: it imports neither `ambient` nor `tracer`.
Every integration below is one line of **application** wiring through a generic
hook. Use any of them independently; they compose when used together.

## The seam: contextProvider

`contextProvider` (a `SloggerOptions` field) is a thunk invoked per emitted
record and merged **under** the call/scope context — explicit fields always
win, and precedence is `provider < scope < per-call`:

```typescript
import { LogManager, SyslogSeverities } from '@tundralibs/slogger';

const log = LogManager.createSlogger({
  appName: 'orders',
  level: SyslogSeverities.INFO,
  contextProvider: () => ({ region: 'eu-1' }),
});
```

Two properties to rely on:

- **Lazy** — it runs only for records that pass the level/handler filters;
  muted lines never invoke it.
- **Reference identity** — `LogManager` caches logger configs by comparing
  function members by reference (same rule as formatters). Hoist the provider
  to a `const`; a fresh arrow per `createSlogger` call is a _different_ config.

## Request context via ambient

[`ambient`](../../ambient/README.md) carries a request-scoped bag across every
`await`. Hand its live bag to the provider and every line in the request
carries the request's context, with no per-call argument:

```typescript ignore
import { ambient } from '@tundralibs/ambient';

contextProvider: () => ambient.get() ?? {},
```

Anything enriched mid-request (`ambient.set('userId', …)` after
authentication) appears on subsequent lines automatically — the provider reads
the live bag at log time, not a snapshot.

## Trace identity via tracer

[`tracer`](../../tracer/README.md) keeps its active span in its own store —
it writes nothing into the request bag. Read it in the same provider:

```typescript ignore
import { tracer } from './telemetry.ts'; // your Tracer instance

contextProvider: tracer.logContext, // ← the whole integration (tracer >= 0.4)
```

`tracer.logContext` is the bound adapter tracer ships for exactly this seam:
it returns `{}` outside a span, still reports ids for **unsampled** spans
(correlation keeps working when nothing is exported), and emits the
**canonical key names** — `traceId` / `spanId` (camelCase), which is what
`otelLogFormatter` hoists by default (see the next section). The names are
load-bearing, which is exactly why they're encoded in the adapter rather than
retyped in every app. Other names work, but then the formatter needs a
matching `traceFields` override.

## The payoff: otelLogFormatter hoisting

`otelLogFormatter` emits each record as an OpenTelemetry log record — and it
**hoists** `context.traceId` / `context.spanId` / `context.traceFlags` out of
the attributes and into the log record's **first-class `TraceId` / `SpanId`
fields**:

```typescript ignore
handlers: [{
  name: 'otel',
  type: 'HTTPHandler',
  level: SyslogSeverities.INFO,
  formatter: otelLogFormatter({
    resource: { 'service.version': '1.4.2', 'deployment.environment': 'prod' },
    // defaults: { traceId: 'traceId', spanId: 'spanId', traceFlags: 'traceFlags' }
    // pass `traceFields: null` to disable hoisting entirely
  }),
  url: 'https://collector.internal/v1/logs',
}],
```

First-class fields are what OTel backends key their log↔trace linking on — an
id sitting in `attributes` is just a string, an id in `TraceId` is a **link**.
With the wiring above, logs arrive in the backend already attached to their
traces. Severity is mapped for you (syslog 0–7 → OTel `SeverityNumber` 1–24),
and `service.name` / `host.name` are derived from the logger's
`appName` / `hostname`.

## The full wiring, in one place

Request context, trace identity, and OTel-linked output — three sources, one
provider, still zero coupling:

```typescript
import { LogManager, SyslogSeverities } from '@tundralibs/slogger';
import { ambient } from '@tundralibs/ambient';
import type { Tracer } from '@tundralibs/tracer';

declare const tracer: Tracer; // your Tracer instance, e.g. './telemetry.ts'

const contextProvider = () => ({
  ...ambient.get(), // correlationId, userId, …
  ...tracer.logContext(), // trace identity, canonical keys
});

const log = LogManager.createSlogger({
  appName: 'orders',
  level: SyslogSeverities.INFO,
  contextProvider,
  handlers: [/* console for humans, otelLogFormatter over HTTP for backends */],
});
```

The composition-root pattern behind this — who owns which store, and why none
of these packages import each other — is documented once, canonically, in
[Ambient-Integration](../../ambient/docs/Ambient-Integration.md).
