# rAPId Roadmap

Forward-looking build plan. Completed work is summarized under **Shipped**;
everything below it is the **Backlog** — one pool, no 1.0-vs-later gate, all in
scope and up for scheduling. Full build-history detail lives in git and the
project memory. Last updated **2026-08-22**.

## Shipped

Core and the current capability set are built and green on Deno / Bun / Node
(the fetch adapter is also verified on Cloudflare workerd):

- **Core** — `Application.initialize()` (the single async factory; private
  constructor + runtime brand, config-driven or programmatic); the single
  `Transport._invoke` spine
  (ambient correlation, optional tracer, the middleware onion, error
  disclosure, and metrics, with a sync-through fast path); `Application.fetch()`
  (no listener / Workers); HTTP + WebSocket(RPC) + cron transports.
- **Routing** — radrouter-native params (`/users/:id:`), wildcards, and
  **versioning** (`server.versioning { mode: header|accept|path, identifier,
  default }`; `@GET`/`@Module` `{ version }` override).
- **Middleware** — universal `use()`, scope helpers (`onlyHTTP`/`guardHTTP`/…),
  and the catalog: cors, secureHeaders, compress, etag, rateLimit (store-
  injection), requestId, requestLogger, responseTimer, serveStatic,
  healthCheck, timeout, auth (`authenticate`/`authorize`/`permission`/`jwt`),
  **session** (store-injection, signed id, rolling + absolute TTL, regenerate /
  destroy, read via `getSession`), and **csrf** (stateless signed
  double-submit). `Store` gained an optional `delete`.
- **Decorators + modules** — `@GET/@POST/@PUT/@PATCH/@DELETE/@SOCKET/@JOB`,
  binders (`param`/`payload`/`query`/`paging`/`header`/`cookie`/`auth`/
  `session`/`connection`), `@Module`, `@On`/`@Use`, `RapidModule` +
  `initModules` + `app.modules()` (namespace scan, doctor-constructed zero-arg
  modules, instance mounting).
- **Endpoints catalog** (`./endpoints`) — `health`, `metrics`, `openapi`,
  `login`.
- **Request surface** — cookies, query/paging parsing with caps, body parsing
  (json/text/form/multipart) with size limits + an upload magic-byte gauntlet,
  `ctx.serve()` file download, MIME resolution, content negotiation
  (`ctx.accepts(...types)` over the `Accept` header).
- **Auth seam** — `ctx.auth` (per-invocation, set-once, read-only bag) riding
  the module invoke seed.
- **Observability** — slogger always-on, tracer opt-in (OTLP + propagation),
  metro-man metrics opt-in (`app.meter`, `metrics()` endpoint).
- **Pub/sub** — `app.channel()` / `app.publish()` / `ctx.publish()` over the
  shared `/ws` socket (cross-process via an rpc `PubSubAdapter`).
- **DI** — doctor `label` / `stock` (ready-made values under typed labels,
  `inject()`), used by the module system.
- **Testing** (`./testing`) — `harness()` (stub via doctor, boot, restore) +
  `client()` (drive routes over `app.fetch`).
- **CLI** (`./cli`) — `init` / `upgrade` / `modules` / `health`.
- **Cluster seam** — `app.instanceId` (boot ULID) + a nullable `app.cluster`
  slot; the master/worker implementation is in the backlog (Scaling & ops).
- **Review hardening (2026-08-22)** — the straightforward/unblocked fixes from
  the adversarial review, shipped one cross-package dependency at a time
  (radrouter 1.2.0, doctor 1.4.0 + 1.5.0, compat 2.4.0):
  - HTTP method correctness — auto-HEAD (`server.autoHead`, default on), 405 +
    `Allow` and generic OPTIONS (`server.methodNotAllowed`) off radrouter's
    `allowedMethods`.
  - Validation → 400 — a guardian failure is recognized structurally;
    `validated()` exported to opt other validators' throws into a 400.
  - Graceful drain — `app.stop()` drains in-flight requests up to
    `shutdownTimeout` (compat 2.4.0 `WebServer.stop(true, timeout)`), then
    force-closes; exit backstop at `1.1×`.
  - `app.onError()` — central disclosure-envelope override hook.
  - Per-app DI — `app.container` (a child of the global doctor), request-scoped
    `inject()` (resolves against the app even after an `await`), harness stubs
    isolated to a fresh child container.
  - `serveStatic` realpath symlink guard + weak `ETag` / `If-None-Match` /
    `Last-Modified`; Context transport-leak removed (`ctx.metrics`/
    `socketMetrics` off the base); publish-exclude hygiene.
- **Error taxonomy (2026-08-22)** — `utils/` uniformly throws `RapidError` with
  the status-mapping code for a condition it detects; a helper that runs
  caller-supplied code propagates unwrapped to the disclosure boundary. Codified
  in CONVENTIONS.md.
- **Streaming response model (2026-08-22)** — the keystone. `content` accepts a
  `ReadableStream<Uint8Array>` or any async iterable (strings encoded), handed
  to the client unbuffered; `ctx.sse(events)` frames Server-Sent Events;
  `ctx.serve()` / `serveStatic` stream files (`fileStream`, incl. byte ranges)
  with a stat-derived `content-length`; a module reply may be a stream. Stream
  bodies are HTTP-only (JOB/SOCKET reject) and opaque to body middleware
  (`etag` skips, `compress` pipes through `CompressionStream`). Added
  `ctx.deleteHeader()` — `responseHeaders` is a defensive copy, so dropping a
  now-wrong header needs a real mutator.
- **Signed cookies + the app `secret` (2026-08-22)** — one `secret` option
  (≥ 32 chars, validated at boot; `app.secret` throws `RAPID_CONFIG` when a
  signing feature is used without it) is the HMAC key for everything that
  signs: `ctx.setCookie(..., { signed })` / `ctx.signedCookie()` (verifies,
  forged → `undefined`), the reply envelope's `cookies` key (plain or signed,
  HTTP-only, ignored on JOB/SOCKET), and `session()` / `csrf()`, which dropped
  their own `secret` options. The sign/verify helpers live in `utils/cookies`.
  The reply-cookie apply is SYNC-THROUGH — only a signed cookie yields a
  promise, so the plain-request hot path stays promise-free.
- **Reply envelope output side complete (2026-08-22)** — with `cookies` and
  the new `redirect` key (string → 302, `{ url, permanent }` → 301, `location`
  set, precedence over `status`), the Module HTTP ergonomics item is done:
  input binders (`cookie`/`auth`/`session`) in, cookies/redirect/stream out.
  Transport rule, documented: both keys are HTTP-only and SILENTLY IGNORED on
  JOB/SOCKET (a redirect never becomes a 3xx there), so a multi-transport
  method returns them without branching.

## Backlog

No 1.0-vs-later split — everything here is in scope. A few items note a real
technical **dependency** (e.g. "needs the streaming model"); that is a
sequencing fact, not a deferral.

### Request / response & HTTP

- **`serveStatic` Range/206** (`Accept-Ranges`) — `fileStream` already takes an
  inclusive byte range; what's left is the `Range` header parse, the `206` /
  `Content-Range` response, and `416` on an unsatisfiable range.
- **Small:** trailing-slash request policy; brotli in `compress`;
  `coerceComparable` hex/exp coercion made consistent with `parsePaging`.

### Tooling & DX

- **CLI `build`** — a scaffolded deno task wrapping `deno compile` / the
  fetch-adapter bundle, rather than a heavy CLI command.
- **AI-agent instructions in the CLI** — `rapid init` scaffolds rapid-specific
  assistant guidance (`CLAUDE.md` / `AGENTS.md` /
  `.github/copilot-instructions.md`), and/or a `rapid ai` subcommand to
  (re)generate them, so an AI-assisted project starts with rapid's conventions,
  API surface, and idioms pre-configured. New `cli/templates.ts` files + a
  `cli/mod.ts` dispatch entry.
- **Dev console (TUI). 🎨 design frozen 2026-08-22; build pending.** A
  full-screen alternate-buffer terminal console that replaces plain log spew on
  a TTY. Regions each back onto an existing getter (banner + bind line;
  registered totals; an HTTP-metrics KPI grid from `app.metrics`/`socketMetrics`
  with a status-class bar; scheduled jobs from `jobMetrics`; a rolling request
  stream via a small finalize-tap ring buffer; a module-scoped log tail).
  Layout capped ~120 cols and centred; four behaviours gated on `isatty`
  (DEV+TTY on by default, PROD+TTY `--console`, no-TTY plain, `--no-console`
  forces plain); it **tees** (handlers still get the full stream). Reads
  `app.cluster ?? app.metrics`, so a clustered node shows the fleet for free.
  Built on compat (`isTTY`/`consoleSize`/raw stdin) + three new `compat/cli`
  primitives (alt-screen escapes, keypress reader, size polling). In DEV it
  also watches `modules/` and regenerates the barrel on change. Open build
  calls: core-vs-CLI home, latency percentiles, the in-core request ring,
  repaint cadence, a zero-dep renderer.
- **SDK generator (via RESTler)** — a typed client SDK generated from the
  OpenAPI/decorator metadata — one typed method per route, schemas reused.
  Downstream of OpenAPI; likely its own tool/package.

### Scaling & ops

- **Distributed deployment & management. 🧭 architecture converged 2026-08-22.**
  A **master + workers** model, built as modules/middleware/routes with **one
  small core seam** (`app.cluster`, already shipped):
  - A single app-agnostic **MASTER** (control-plane, never serves external
    traffic) and N **WORKERS** (the full app). Workers dial the master over an
    authed WS (shared secret on upgrade), register, and send pings + stat
    summaries + a sampled log tail.
  - **Exactly-once cron** by a master-designated leader (lowest instance-ULID;
    sticky through a master outage), enforced by an `onlyIfCronLeader()` job
    middleware reusing the skipped-by-middleware outcome — every worker
    schedules the cron, only the leader's fires run. No core change. (Until this
    ships, the scheduler is per-process: N replicas fire every `@JOB` N times —
    run the scheduler on a single replica, or make jobs idempotent.)
  - **Telemetry gateway (opt-in per stream)** — workers stream logs (and
    optionally metrics/traces) to the master, which transforms
    (filter/sample/redact/dedup/enrich) and fans out to pluggable sinks.
    **Async, buffered, drop-safe, replay-on-reconnect — never in the request
    path.** Coordination always via the master; traces go direct to OTLP.
  - **Fleet view** — the master collates a `ClusterSnapshot { seq, at, leader,
    members[] }` and broadcasts it; any node (and the dev console) shows the
    fleet.
  - Most of it **composes** on `@tundralibs/rpc` (channel/publish/connections/
    upgrade-auth/reconnect); net-new build = the two seams (shipped), the WS
    log-tail handler + master pipeline, a `/metrics` aggregator, leader
    designation + `onlyIfCronLeader`, and the views. **Rejected:** worker-side
    leader election / peer mesh / cacher-lease — the static master removes the
    need.
  - Later: drain-aware rolling deploys, fleet cron pause / remote trigger,
    config & feature-flag broadcast, alerting webhooks, a TUI `reqId`→trace
    jump, multi-master HA via rpc's Redis `PubSubAdapter`.
- **Simple UI module** — a deliberately MINIMAL client-side UI helper served
  from the static layer — enough for AJAX + basic wiring. Not a
  React/Vite-class framework.

## Parked

- Browser as a rAPId **listener** surface — permanently out of scope (no server
  socket). Distinct from the **Simple UI module** above, which SERVES a UI to
  browsers. Cloudflare Workers is a best-effort HTTP-only target via
  `app.fetch()`: no filesystem, no socket commands, jobs via Cron Triggers.
