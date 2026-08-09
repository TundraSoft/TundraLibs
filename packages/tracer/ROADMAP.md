# Tracer — Roadmap

What is deliberately not built yet, and the reasoning behind the choices that
shaped the package. The kernel ships first; export and framework glue follow.

## OTLP exporter (next)

The only exporters in-tree are `ConsoleExporter` and `MemoryExporter` — enough
for development and tests, but not for a real backend. Next is
`@tundralibs/tracer/otlp`: **OTLP over HTTP with a JSON payload**, POSTed to
`<endpoint>/v1/traces`, built as a `RESTler` subclass so it inherits URL
validation, timeouts and retries.

Decided: **write the encoder in-house rather than depend on
`@opentelemetry/otlp-*`** — that keeps the suite dependency-light and
cross-runtime, and conformance here is verifiable rather than a matter of
judgement. It is pinned to a named `opentelemetry-proto` version, and verified
two ways: fixture tests, plus a real `otel/opentelemetry-collector` service
container in CI asserting our payload is actually accepted (the repo already
runs live service containers, so this is house style).

The encoder will be built as a **Guardian schema with `.transform()`** rather
than a hand-written mapper, so shape, conversion, defaults and validation live
in one declaration and `GuardianInfer` derives the output type — no separately
maintained `types/otlp.ts` to drift. **Open question to settle with a benchmark,
not a guess:** guardian's per-value cost on a batch flush (~512 spans × ~10
attributes) versus a hand-rolled encoder. If it is badly slower, fall back to
guardian-as-test-schema with a hand-rolled fast path. The repo has `.bench.ts`
conventions and a `bench` task for exactly this.

Spec gotchas to encode carefully (each silently breaks ingest): trace/span ids
are **lowercase hex, not base64** (an OTLP-specific override of protobuf-JSON);
`startTimeUnixNano`/`endTimeUnixNano` are **decimal strings**, not numbers;
attributes use the typed `{ key, value: { stringValue | intValue | … } }`
wrapper; `kind` and `status.code` are numeric enums.

**Out of scope:** OTLP over gRPC, and protobuf-over-HTTP. Anyone needing those
runs the OTel Collector, which accepts JSON on the front door and re-exports in
any format.

## Batch span processor

Spans are currently exported one at a time, as each ends. That is fine for
console/memory, and wrong for a network exporter — the OTLP work will add a
batching processor (queue, size/time flush thresholds, drop policy on overflow)
and route exports through it.

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

Attribute names follow OpenTelemetry semantic conventions by hand
(`http.method`, `db.system`, `exception.type`). Typed helpers/constants for the
common groups may follow; shipping the whole spec is not planned — it is large,
churns, and most of it is irrelevant to any one service.

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
