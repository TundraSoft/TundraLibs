# Tracer — Roadmap

What is deliberately not built yet, and the reasoning behind the choices that
shaped the package.

## Shipped

- **Kernel** — `Tracer`/`Span`, W3C `traceparent` propagation, head-based
  parent-inherited sampling, pluggable `IdGenerator`, Console/Memory exporters.
- **`@tundralibs/tracer/otlp`** — OTLP over HTTP with a JSON payload, POSTed to
  `<baseURL>/v1/traces`, built as a `RESTler` subclass so URL validation,
  timeouts and headers are inherited. JSON only — gRPC and protobuf-over-HTTP
  stay out of scope, because a collector accepts JSON on the front door and
  re-exports in whatever the backend wants.
- **`BatchSpanProcessor`** — bounded queue, size/timer flush, oldest-first drop
  on overflow. It _is_ a `SpanExporter` wrapping another one, so it needed no
  support from `Tracer` at all.
- **`SemConv`** — the attribute keys a service actually reaches for.

### Encoder: Guardian, decided by measurement

The encoder is a Guardian schema with `.transform()` rather than a hand-written
mapper, so the wire shape, the conversions and the validation are one
declaration and the output type is derived from it — there is no second
`types/otlp.ts` to drift.

The open question was its cost, and it was settled with
[encode.bench.ts](otlp/encode.bench.ts) rather than a guess: on a default
512-span batch, Guardian runs ~1.1ms against a hand-rolled baseline's ~408µs —
about **2.6x**, but under a millisecond more per flush, on a background timer,
off the request path. Immaterial next to a single source of truth. Re-run the
bench if that trade ever looks different.

The conversions that silently break collector ingest are covered by explicit
tests: ids as lowercase **hex, not base64** (an OTLP-specific override of
protobuf-JSON), `*TimeUnixNano` as **decimal strings**, attributes in the typed
`{ key, value: { stringValue | intValue | … } }` wrapper, and `kind` /
`status.code` as numeric enums.

## Verification against a real collector

Still worth doing: an `otel/opentelemetry-collector` service container in CI,
asserting a real collector _accepts_ the payload rather than only that it
matches our own fixtures. The repo already runs live service containers, so
this is house style. The encode tests pin the shape meanwhile.

## Framework middleware

Deliberately **not** shipped in-tree beyond what
[RECIPES.md](RECIPES.md) documents. RadRouter and RPC are both generic over
their middleware type and never read `ctx` themselves, so there is no canonical
context to write an adapter against; and a generic adapter cannot _write_ to a
context it does not know (`ctx.span = span`), which is exactly what an
application wants. A ~10-line adapter in the app keeps full type knowledge.

Planned once `rAPId` exists: a first-class `rAPId/tracing` middleware, since
rAPId is the package that will own a typed request context. A convenience
`handleTrace(info, fn)` wrapper in this package is also on the table if the
recipes prove repetitive in practice.

## Semantic conventions

`SemConv` covers the groups a service actually reaches for — service/resource,
HTTP, database, RPC/messaging, exception. Shipping the whole specification is
**not** planned: it is large, it churns, and almost all of it is irrelevant to
any one service. Attributes are plain strings, so anything missing can be passed
inline.

## Not planned

- **W3C `baggage`** — separate spec from `traceparent`; add only on demand.
- **Tail-based sampling** — requires buffering whole traces and a collector-side
  decision. Head-based sampling is what an in-process SDK can do correctly; tail
  sampling belongs in the OTel Collector.
- **Auto-instrumentation** (monkey-patching `fetch`, DB drivers) — implicit
  global patching is at odds with the suite's explicit-composition style. Manual
  wrappers are documented in RECIPES instead.
- **Metrics/logs over OTLP** — `metro-man` and `slogger` own those. Tracer
  exports spans only.

## Decisions worth not relitigating

- **No `compat/async`.** The `AsyncLocalStorage` primitive stays in `ambient`,
  and tracer depends on `ambient` for `createContext`. Moving it to `compat`
  would make a leaf primitive depend on a 47-file package that pulls `ws`, and
  buys nothing: `ambient/createContext.ts` is already the one-file seam a future
  TC39 `AsyncContext` migration would touch. Revisit only if a runtime appears
  that needs an ALS shim (making it a genuine _compat_ concern), or if a package
  that cannot depend on `ambient` needs raw ALS.
- **Ids via `crypto.getRandomValues`, not `@tundralibs/id`.** W3C needs raw
  uniform hex of a fixed byte width; `id` ships no such generator, and using it
  would mean adding one there to replace ten lines here. There is no id
  _semantics_ to reuse — it is just random bytes.
- **Sampling is head-based and parent-inherited.** Child spans never re-sample;
  a partially-sampled trace renders as a waterfall with holes. `ratioSampler`
  derives its verdict from the trace id so independent services agree.
