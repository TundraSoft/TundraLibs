# Tracer OTLP

Shipping spans to a real backend, and the wire-format details that decide
whether they arrive.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [What OTLP is](#what-otlp-is)
- [Setup](#setup)
- [Seeing failures](#seeing-failures)
- [The four encodings that silently break ingest](#the-four-encodings-that-silently-break-ingest)
- [How the encoder is built](#how-the-encoder-is-built)
- [Running a collector locally](#running-a-collector-locally)
- [Scope](#scope)

## What OTLP is

OTLP is the OpenTelemetry Protocol — the wire format essentially every backend
accepts: Jaeger, Tempo, Honeycomb, Datadog, New Relic, and the OTel Collector,
which can forward to the rest. Emit OTLP and you are not locked to a vendor.

Tracer speaks **OTLP over HTTP with a JSON payload**, POSTed to
`<baseURL>/v1/traces`.

## Setup

The exporter lives behind its own subpath, so importing the tracer never pulls
an HTTP client into a CLI or worker that only creates spans:

```typescript
import { BatchSpanProcessor, Tracer } from '@tundralibs/tracer';
import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';

const tracer = new Tracer({
  serviceName: 'orders',
  exporter: new BatchSpanProcessor(
    new OTLPExporter({ baseURL: 'http://localhost:4318' }),
  ),
});
```

`baseURL` is the collector **root**, not the signal path — `/v1/traces` is
appended. Batching is not optional in practice: without it every ending span
costs one HTTP round-trip.

Because `OTLPExporter` is a `RESTler` subclass it inherits that package's URL
validation, timeouts and header handling, so a hosted backend's auth is just a
header:

```typescript
import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';

const apiKey = 'hcaik_…';

new OTLPExporter({
  baseURL: 'https://api.honeycomb.io',
  headers: { 'x-honeycomb-team': apiKey },
  timeout: 10,
});
```

## Seeing failures

Export failures are **silent by design** — telemetry must not surface as an
application error. `onExportError` is the only way to see them, and a production
deployment should always set it:

```typescript
import { OTLPExporter } from '@tundralibs/tracer/exporters/otlp';

const baseURL = 'http://localhost:4318';
const log = { error: (_msg: string, _meta: Record<string, unknown>) => {} };

new OTLPExporter({
  baseURL,
  onExportError: (err, spans) =>
    log.error('otlp export failed', { err, dropped: spans.length }),
});
```

It fires for a span that cannot be encoded, for a non-2xx response, and for a
transport failure. Without it, a misconfigured endpoint looks exactly like
"nothing is being traced".

A span that fails to encode is **skipped**, not fatal to its batch — one bad
span must not cost the other 511.

## The four encodings that silently break ingest

OTLP/JSON is not plain protobuf-JSON, and the differences are the kind a
collector rejects with a 400 that nothing in your application sees:

| Field                                   | Requirement                              | Wrong version                                |
| --------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| `traceId` / `spanId`                    | lowercase **hex**                        | base64 (protobuf-JSON's default for `bytes`) |
| `startTimeUnixNano` / `endTimeUnixNano` | decimal **string**                       | a JSON number                                |
| attribute values                        | typed `{ stringValue \| intValue \| … }` | the bare value                               |
| `kind`, `status.code`                   | numeric enums                            | the enum's name                              |

`intValue` is itself a string, for the same reason the timestamps are: an int64
does not survive a JSON number.

Each of these is pinned by a test in `encode.test.ts`, and two of them are
additionally pinned against a **real collector** in `collector.test.ts`.

One caveat worth knowing: a collector accepts a numeric `*TimeUnixNano`
(protobuf-JSON permits int64 as number _or_ string), so the collector check
cannot catch that one — even though emitting a number loses precision past
2^53. That assertion only exists as a fixture test. The collector check
complements the fixtures; it does not replace them.

## How the encoder is built

The encoder is a Guardian schema with a `.transform()`, so the wire shape, the
conversions and the validation are one declaration rather than three things to
keep in step.

That costs about **2.6×** a hand-written mapper — ~1.1ms against ~408µs for a
512-span batch (`encode.bench.ts` keeps the measurement reproducible). Under a
millisecond more per flush, on a background timer, off the request path; the
single declaration is worth more than the microseconds.

One deliberate exception: the OTLP `AnyValue` wrapper is chosen by an
attribute's **runtime type**, not by a discriminator field, so it is a `typeof`
dispatch rather than schema.

The output type is restated explicitly instead of being inferred from the
schema, because JSR's slow-types gate rejects an inferred schema type in a
package's public API (it would also block `.d.ts` generation for Node). The
schema stays the runtime authority, and the tests assert every field, so the two
cannot drift silently.

## Running a collector locally

The stock image needs no configuration — its default config already exposes
OTLP on 4317 (gRPC) and 4318 (HTTP):

```bash
docker run --rm -p 4318:4318 otel/opentelemetry-collector:0.158.0
```

Point `baseURL` at `http://localhost:4318` and spans will flow. CI runs the same
image as a service container; `collector.test.ts` probes it and **skips** when
none is reachable, so a contributor without one still gets a green suite.

## Scope

**JSON over HTTP only.** OTLP over gRPC and protobuf-over-HTTP are deliberately
out of scope: a collector accepts JSON on its front door and re-exports in
whatever a backend wants, so implementing them here would duplicate the
collector for no gain.

Tracer exports **spans** only. Metrics belong to
[`metro-man`](../../metro-man/README.md) and logs to
[`slogger`](../../slogger/README.md).
