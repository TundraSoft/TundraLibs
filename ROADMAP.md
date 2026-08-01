# TundraLibs — Capability Roadmap

Proposed new packages that extend the TundraLibs suite, consolidated from the
two adversarial-review ideation passes. **Nothing here is built** — this is a
scoped roadmap for deciding what to take on.

**Every capability is listed as its own standalone package.** Where the review
discussion flagged that a capability _could_ instead be a module, a middleware,
or a fold into another package, that is captured under **Notes / open
questions** — the capability is not pre-merged; the decision is deferred.

---

## Naming

- **rAPId** (_rapid api development_) is the cross-runtime HTTP application
  framework — the keystone the HTTP half of the suite mounts into. It was
  sketched as `outpost` in the ideation; the canonical name is **rAPId**. An
  existing external `rAPId` project is a candidate to bring in-house as this
  package rather than build fresh.

---

## Dependency chains (the only hard sequencing constraints)

- **ambient → tracer** — tracer needs async-context for span propagation.
- **rAPId → blueprint** — blueprint needs route metadata to assemble the spec.
- **relay → herald, cadence** — both ride the queue for async fan-out / scheduling.
- **governor ⊇ fuse** — governor absorbs fuse's breaker/retry; build one, not both.

**Keystones:** **rAPId** (HTTP/request anchor) and **relay** (async/background
anchor). Most other capabilities gain value once one of these exists. A sensible
build order is: `ambient → rAPId → relay → governor → silo → tracer → keyring →
vitals → herald → cadence → blueprint`, with `strata`/`fuse` optional.

Everything not in a chain above is independent and can be built in any order.

---

## Capabilities

### rAPId — HTTP application framework _(keystone)_

Cross-runtime HTTP **application framework**: binds `compat/webserver` +
`radrouter` into a real app with a typed request context, a middleware pipeline,
and first-class hooks for `pact` (authN/authZ), `guardian` (body/query
validation), and `slogger` (request logging). `radrouter` is deliberately
context-agnostic and `compat` only exposes `./webserver`, so nothing today turns
request → route → middleware → response into a cohesive stack. rAPId is that
piece — it makes the HTTP half of the suite a _stack_ rather than _parts_.

- **Composes:** compat/webserver, radrouter, pact, guardian, slogger
- **New-pkg prereq:** none
- **Notes / open questions:** Keystone — `blueprint`, `vitals`, `ambient`, and
  the middleware form of `governor` all mount into or lean on rAPId. Naming is
  **rAPId** (not `outpost`); evaluate bringing the existing external rAPId
  project in as this package.

### relay — background job / message queue _(keystone)_

Background **job / message queue** + worker pool with swappable durable engines
(memory, Redis, Postgres, SQLite, SQS-style HTTP): enqueue/consume, ack/nack,
delayed & scheduled delivery, retry-with-backoff, concurrency limits, and
dead-letter handling — built in the `cacher`/`drivers` manager + `AbstractEngine`
mold. Payloads validate through `guardian`; at-least-once pairs with a `norm`
transactional-outbox engine. Fills the async/background-work gap — nothing in the
suite moves work off the request path today.

- **Composes:** drivers, norm, cacher, guardian, slogger
- **New-pkg prereq:** none
- **Notes / open questions:** Keystone for the async side — `herald` and
  `cadence` both ride it. `cadence`'s scheduling could live here as relay's
  scheduling half instead of a separate package (see cadence).

### silo — object / blob storage

Object/**blob storage** abstraction with swappable engines (local FS via
`compat/file`, in-memory, S3, GCS, Azure Blob) behind one put/get/stat/list/
delete API, mirroring the `cacher`/`drivers` pattern; presigned URLs, streaming
bodies, and content-addressed keys are first-class. `crypt` supplies envelope
encryption-at-rest (`norm` already does at-rest column encryption, so the
primitive exists). The suite covers cache, DB, and queue-adjacent concerns but
has nowhere to put files — silo is that missing primitive.

- **Composes:** restler (cloud transport), crypt, id, compat/file, slogger
- **New-pkg prereq:** none
- **Notes / open questions:** none material — cleanly standalone.

### herald — messaging / notification dispatch

Transactional **messaging / notification** dispatch: email (SMTP + provider APIs
— SES, SendGrid, Postmark, Mailgun), SMS, webhooks, and push, behind one `send`
API with swappable provider engines (thin `restler` subclasses), templating, and
delivery events. Payloads validate via `guardian`; async fan-out rides `relay`
for retries and dead-lettering. Rounds out the outbound-communication side
`restler` enables but doesn't package.

- **Composes:** restler, guardian, slogger
- **New-pkg prereq:** relay (for durable async fan-out)
- **Notes / open questions:** Synchronous send works without relay; the
  retry/dead-letter guarantees are what pull in relay.

### keyring — secrets provider

**Secrets-provider** abstraction: read secrets uniformly from env, `.env`/Docker
secrets, files, or a remote store (Vault / cloud KMS via `restler`) under one
resolver API, with optional envelope decryption via `crypt` so encrypted-at-rest
secrets are transparent to callers. Extends what `utils`' `envArgs` starts —
adds caching (`cacher`), lazy resolution, and rotation hooks (`crypt` already
ships `rotateKey`). Centralizes the credential handling that `drivers`, `pact`,
and `restler` each do ad hoc today.

- **Composes:** crypt, utils, cacher, restler
- **New-pkg prereq:** none
- **Notes / open questions:** none material — cleanly standalone; genuinely
  cross-cutting (used by drivers/pact/restler).

### governor — rate-limiting + circuit-breaker

**Rate-limiting + circuit-breaker** primitives: token-bucket / sliding-window /
fixed-window limiters plus a breaker state machine, with a pluggable store so
counters are process-local (memory) or cluster-wide (Redis via `cacher`). A
storage-agnostic _kernel_ — it decides, you supply the store and key function.
Mounts as `radrouter`/`rpc`/`rAPId` middleware (inbound protection) and wraps
`restler`/`drivers` (outbound resilience). `rpc`'s docs already name
rate-limiting as a use case but ship none.

- **Composes:** cacher, radrouter, rpc, restler, drivers
- **New-pkg prereq:** none
- **Notes / open questions:** _This is a "just middleware?" candidate — and the
  answer is no._ The **value is the framework-agnostic decision kernel**
  (algorithm + store), reused inbound (as middleware), outbound (as a call
  wrapper), and inside `relay` workers — so it should **not** be buried inside
  rAPId as a middleware module, or `rpc` and outbound code couldn't reuse it. The
  middleware is a thin adapter over the kernel. **Absorbs `fuse`** (build
  governor's breaker/retry once).

### fuse — resilience primitives

**Resilience primitives** — retry with backoff/jitter, timeout, circuit-breaker,
bulkhead — as small composable wrappers around any async call. Pure algorithmic
logic, zero dependencies.

- **Composes:** none (zero-dep)
- **New-pkg prereq:** none
- **Notes / open questions:** _Another "just middleware?" candidate — and again
  no:_ fuse wraps **outbound** calls (a `restler` request, a `drivers` query) and
  arbitrary async functions; the inbound request pipeline never sees it, so it is
  not middleware. But it is tiny and overlaps governor's breaker/retry —
  **recommendation is to fold it into `governor`** rather than ship separately.
  Keep standalone only if a zero-dep resilience micro-package is wanted on its
  own.

### tracer — distributed tracing

OpenTelemetry-compatible **distributed tracing** (spans, timing, W3C
`traceparent` propagation), completing the observability triad with `slogger`
(logs) and `metro-man` (metrics). Storage-agnostic exporter (OTLP over
`restler`, console, or in-memory for tests); drops in as `radrouter`/`rpc`
middleware (span-per-request) and wraps `restler`/`drivers` for outbound
propagation.

- **Composes:** slogger, metro-man, radrouter, rpc, restler, drivers
- **New-pkg prereq:** ambient (for span context across `await`)
- **Notes / open questions:** _"Part of slogger?" — no._ Tracing is a **distinct
  data model**: a span has a start/end, a parent, and propagates across process
  boundaries; a log line is a discrete event. slogger models an OTel _log_
  record, not a span. The relationship is **integration**: tracer owns the active
  span (via `ambient`), and slogger _reads_ that context to stamp
  `trace_id`/`span_id` onto every line (log↔trace correlation). **Scope caution:**
  full OTel tracing is a large interop-driven spec — this is the one item where
  building from scratch is least justified. Prefer a **thin integration layer**
  (ambient wiring + slogger correlation + a small span helper + middleware) over
  a from-scratch OTel implementation; consider sitting on `@opentelemetry/*`.

### ambient — async-context propagation

Cross-runtime request/**async-context propagation** over `AsyncLocalStorage`:
correlation IDs, request-scoped state, and context that survives `await`. ALS is
now uniform across Deno/Bun/Node. This is the foundation `tracer` needs for span
context and `slogger` needs for automatic request-ID correlation — today there's
no way to carry a correlation ID from a rAPId handler into slogger lines, drivers
queries, and restler calls without threading it by hand.

- **Composes:** compat (ALS); consumed by rAPId, rpc, slogger, tracer, doctor
- **New-pkg prereq:** none
- **Notes / open questions:** Small but load-bearing — `tracer` and automatic
  slogger correlation both depend on it. Cross-runtime ALS edge cases are the
  only real complexity.

### vitals — health-check aggregator

Liveness/readiness **health-check aggregator**: register named dependency probes
(DB, cache, queue, blob), run them with per-probe timeouts, and expose a
rolled-up status with a Kubernetes-friendly `/healthz` + `/readyz` shape.
`drivers` already expose `ping`, so most probes are near-free wrappers; mounts as
a `radrouter`/`rAPId` route; `metro-man` emits probe latency.

- **Composes:** drivers, cacher, radrouter, metro-man
- **New-pkg prereq:** silo, relay (optional — only to probe those subsystems)
- **Notes / open questions:** _"Just middleware?" — closest of the three, but
  still no:_ vitals is a probe **registry + runner** that produces a status
  object; it is _exposed_ via a route but is useful in a CLI or cron too. It is
  the **smallest** candidate and could reasonably be a module (e.g.
  `rAPId/health`) rather than its own package — flagged as a fold candidate, but
  kept standalone here per the "don't merge" decision.

### blueprint — OpenAPI / JSON-Schema generation

Generate **OpenAPI 3.1** (and JSON Schema) directly from `guardian` schemas and
`radrouter`/`rAPId` route definitions — turns validated routes into
self-documenting APIs and pairs with `restler` for client generation.

- **Composes:** guardian, radrouter, restler
- **New-pkg prereq:** rAPId (route metadata must be reachable)
- **Notes / open questions:** _"Doesn't guardian already do OpenAPI?" — it does
  the **schema level** (one validator → one JSON-Schema/OpenAPI object)._
  blueprint is the **document level**: walk the route table, pair each
  `method + path` with its request/response guardian schemas, split parameters by
  in:`query`/`path`/`header`, attach `pact` security schemes, dedupe `$ref`s into
  `components`, emit `operationId`s — the whole spec, not fragments. Because that
  assembly is bound to route metadata only rAPId/radrouter have, it is a strong
  candidate to be an **`rAPId/openapi` module** rather than a standalone package.
  Kept standalone here per "don't merge"; flagged as a fold candidate.

### cadence — job scheduler

Cross-runtime **job scheduler**: cron expressions, fixed intervals, and one-shot
delayed jobs, with a pluggable persistence/lock store so only one instance in a
cluster fires a given job (leader election via `cacher` or a `drivers` backend).
Composes with `relay` to enqueue scheduled work and `vitals` to surface last-run
health.

- **Composes:** cacher, drivers, metro-man
- **New-pkg prereq:** relay (to enqueue scheduled work)
- **Notes / open questions:** **Overlaps `relay`'s scheduling.** Round-1 folded
  scheduling into relay; round-2 split it out. Decide whether cadence is its own
  package or **relay's scheduling half** — kept separate here per "don't merge."

### strata — standalone schema-migration runner

Standalone **schema-migration runner** for the data layer: ordered, versioned
up/down migrations with a tracked migrations table, locking against concurrent
runners, and dry-run/diff output; executes DDL through `drivers` and authors
migrations via `oql`'s builder. Ships a small Deno/Bun/Node CLI.

- **Composes:** norm, oql, drivers
- **New-pkg prereq:** none
- **Notes / open questions:** **Overlaps norm's existing `Migrator`, but a
  different paradigm.** norm's Migrator is **state-based / declarative** (snapshot
  your entity schema; the diff between snapshots _is_ the migration; coupled to
  norm). strata is **imperative / version-based** (hand-written ordered up/down
  files, Flyway/Alembic style; decoupled from norm, for raw `drivers`/`oql`
  users). Only earns its place if there is demand for non-norm imperative
  migrations. **Alternatives:** drop it, or reframe as "extract norm's Migrator
  into a standalone engine that norm itself re-consumes" (one engine, two entry
  points) rather than a second, differently-shaped tool.

---

## Cross-cutting engineering

Not new packages — monorepo-wide hardening passes that touch existing packages.

### Edge-safe barrel hygiene

Make the `@tundralibs/compat` and `@tundralibs/utils` package **barrels**
(`mod.ts`) net-free, so any consumer is edge/serverless-bundle-safe **by
default**. Today both barrels statically re-export runtime-only helpers whose
`node:*` imports (lazy, runtime-gated inside `compat/net.ts`, but still
_statically reachable_) land in every consumer's import graph:

- **compat** barrel re-exports `net` / `udp` / `webserver` / `websocket`
  (→ `node:net`/`node:tls`/`node:dgram`/`node:http`/`node:https`).
- **utils** barrel re-exports `getFreePort` (→ `compat/net`), `envArgs`,
  `isInSubnet` / `isPublicIP` / `isSubnet`.

Any package that imports either barrel for a _pure_ symbol (e.g. `BaseError`,
`Options`, `variableReplacer`, `StatusCode`) drags the whole socket stack into
its static graph. The Neon HTTP driver was made edge-clean **surgically** —
narrowing only its own spine's barrel imports (drivers error classes +
`ConnectionEngine`/`SQLEngine` → `@tundralibs/utils/*` subpaths;
`utils/BaseError` → `@tundralibs/compat/file`) — and pinned with an
`check:edge-safety` import-smoke check. Doing it **everywhere** means relocating
the net symbols **off the barrels onto subpaths** and repointing all consumers.

- **Composes:** compat, utils (+ every consumer)
- **New-pkg prereq:** none
- **Notes / open questions:** This is a **breaking** change (consumers of the
  relocated symbols must switch to subpaths), so it's a deliberate coordinated
  pass, not incremental. Enforce with the import-smoke check across every
  edge-targeted package (drivers edge engines, `restler`, `cacher` HTTP engines,
  future `silo`/`relay`/`herald` HTTP engines). Pairs directly with the
  edge/serverless driver push (Neon shipped; Turso / D1 / PlanetScale-HTTP next)
  — the barrels are the last thing between "edge-safe in practice" and
  "edge-safe by construction, CI-enforced." Same barrel-pull anti-pattern also
  bloats non-edge bundles (every `drivers` consumer pulls all engines) — see the
  related `norm`/dialect-factory subpath item.

---

## Summary

| Package   | New-pkg prereq | Fold/decision flagged?                                     |
| --------- | -------------- | ---------------------------------------------------------- |
| rAPId     | —              | keystone; rename from `outpost`; evaluate external project |
| relay     | —              | keystone                                                   |
| silo      | —              | —                                                          |
| herald    | relay          | —                                                          |
| keyring   | —              | —                                                          |
| governor  | —              | absorbs `fuse`                                             |
| tracer    | ambient        | scope as thin OTel layer, not from-scratch                 |
| blueprint | rAPId          | fold candidate → `rAPId/openapi`                           |
| cadence   | relay          | overlaps relay scheduling                                  |
| strata    | —              | overlaps norm Migrator                                     |
| ambient   | —              | —                                                          |
| vitals    | (silo, relay)  | fold candidate → `rAPId/health`                            |
| fuse      | —              | fold candidate → `governor`                                |

_Generated from the adversarial-review new-package ideation. Proposals only —
nothing here is built._
