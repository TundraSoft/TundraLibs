# rAPId Roadmap

Forward-looking build plan. Completed work is summarized under **Shipped**;
everything below it is pending. Full build-history detail lives in git and the
project memory. Last updated **2026-08-22**, after the full adversarial review
(`reviews/rapid-review-2026-08-22.md`).

## Shipped

Core + the 1.0 capability set are built and green on Deno / Bun / Node (the
fetch adapter is also verified on Cloudflare workerd):

- **Core** — `rapid()` / `Application`; the single `Transport._invoke` spine
  (ambient correlation, optional tracer, the middleware onion, error
  disclosure, and metrics, with a sync-through fast path); `Application.fetch()`
  (no listener / Workers); HTTP + WebSocket(RPC) + cron transports.
- **Routing** — radrouter-native params (`/users/:id:`), wildcards, and
  **versioning** (`server.versioning { mode: header|accept|path, identifier,
  default }`; `@GET`/`@Module` `{ version }` override).
- **Middleware** — universal `use()`, scope helpers (`onlyHTTP`/`guardHTTP`/…),
  and the catalog: cors, secureHeaders, compress, etag, rateLimit (store-
  injection), requestId, requestLogger, responseTimer, serveStatic,
  healthCheck, timeout, and auth (`authenticate`/`authorize`/`permission`/`jwt`).
- **Decorators + modules** — `@GET/@POST/@PUT/@PATCH/@DELETE/@SOCKET/@JOB`,
  binders (`param`/`payload`/`query`/`paging`/`header`/`connection`), `@Module`,
  `@On`/`@Use`, `RapidModule` + `initModules` + `app.modules()` (namespace scan,
  doctor-constructed zero-arg modules, instance mounting).
- **Endpoints catalog** (`./endpoints`) — `health`, `metrics`, `openapi`,
  `login`.
- **Request surface** — cookies, query/paging parsing with caps, body parsing
  (json/text/form/multipart) with size limits + an upload magic-byte gauntlet,
  `ctx.serve()` file download, MIME resolution.
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
  slot; the master/worker implementation is post-1.0.

## Open decisions

- **Should `utils/` throw `RapidError` or generic errors?** Today it is MIXED:
  `parseBody`/`parseQueryFilters`/`buildExporter`/`mountModule` throw
  `RapidError` (codes map straight onto response statuses), while `compose`
  throws a plain `Error` the cycle launders into 500. The trade: framework
  errors keep status/disclosure mapping and a stable code for callers, but
  couple otherwise-pure functions to the taxonomy. Alternative: utils throw
  plain/typed errors and the caller wraps at the boundary. Decide before the
  docs freeze the `@throws` contracts.

## Pending — from the 2026-08-22 adversarial review

Missing functionality and gated fixes surfaced by the full-package review.
"Gated" items have a recommended fix in the review doc and await a product
decision; everything else is a straightforward build.

**P0 — targeted for 1.0**

- **HTTP method correctness — auto HEAD, 405, generic OPTIONS.** A HEAD to a
  GET route 404s; a wrong method 404s (not 405); OPTIONS is answered only for
  CORS preflight. Transport semantics; belongs in `HTTPTransport.handle` +
  a radrouter method-set query.
- **Validation → 400 wiring** (gated). A thrown `GuardianError` from a bound
  validator currently maps to `RAPID_UNHANDLED`/500, not 400 — a malformed
  body 500s out of the box. Export a `validated()` bridge (today only in
  `examples/validated.ts`), or teach `RapidError.from` to recognize
  `GuardianError`.

**P1 — important**

- **Graceful request drain on shutdown** (gated). `stop()` force-closes HTTP;
  drain in-flight up to `shutdownTimeout`, force-close only the never-draining
  socket. Verify the compat `WebServer.stop(graceful)` contract first.
- **Per-request error hook** (gated). An `app.onError(handler)` to customize
  the disclosure envelope / remap statuses centrally (cf. NestJS exception
  filters, Fastify `setErrorHandler`).
- **Sessions + CSRF** catalog middleware, on the store-injection shape.
- **Static hardening** — ETag / If-None-Match / Range for `serveStatic`
  (Range depends on the streaming response model).
- **Content negotiation** — `Accept` parsing / `ctx.format`.
- **Cron exactly-once under N replicas** (gated). The scheduler is per-process;
  N replicas fire every `@JOB` N times. Ship the `onlyIfCronLeader()` gate (see
  Distributed deployment) or document the single-scheduler requirement loudly.
- **AI agent instructions in the CLI.** `rapid init` scaffolds rapid-specific
  AI-assistant guidance into the new project — a `CLAUDE.md` / `AGENTS.md` /
  `.github/copilot-instructions.md` (mirroring how this monorepo wires them),
  and/or a `rapid ai` subcommand to (re)generate them — so anyone building the
  project with an AI assistant starts with rapid's conventions, API surface,
  and idioms pre-configured. New template files in `cli/templates.ts` + a
  dispatch entry in `cli/mod.ts`.

**P2 / smaller (mostly gated)**

- **Context base transport-leak** — move `ctx.metrics`/`ctx.socketMetrics`/
  `ctx.publish` off the base `Context` onto `HTTPContext`/`SOCKETContext`
  (breaking; a `JOBContext` shouldn't carry HTTP-server surface).
- **`serveStatic` symlink escape** — a `realpath` re-check (adds a stat/request)
  or document that `root` must contain no untrusted symlinks.
- **Module/DI isolation** — the `app.modules()` path resolves through the
  process-global doctor; document the constraint or scope a container per
  runtime (pending doctor 2.0).
- **Streaming / SSE response model** — the one large structural change; unblocks
  SSE, Range, zero-copy static, proxy passthrough. Already post-1.0 (below).
- Trailing-slash request policy; brotli in `compress`; `coerceComparable`
  hex/exp numeric coercion made consistent with `parsePaging`.

## Pending 1.0 build items (pre-review)

- **CLI `build`** — a scaffolded deno task wrapping `deno compile` / the
  fetch-adapter bundle, rather than a heavy CLI command.
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

## Post-1.0.0

- **Streaming / SSE responses.** A stream-body response model (SSE, Range,
  large-file static, proxy passthrough); today `content` is
  `string | Record | Uint8Array` and static reads whole files into memory.
- **SDK generator (via RESTler).** A typed client SDK generated from the
  OpenAPI/decorator metadata — one typed method per route, schemas reused.
  Downstream of OpenAPI; likely its own tool/package.
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
    schedules the cron, only the leader's fires run. No core change.
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
- **Simple UI module.** A deliberately MINIMAL client-side UI helper served
  from the static layer — enough for AJAX + basic wiring. Not a
  React/Vite-class framework.

## Parked

- Browser as a rAPId **listener** surface — permanently out of scope (no server
  socket). Distinct from the post-1.0 "Simple UI module", which SERVES a UI to
  browsers. Cloudflare Workers is a best-effort HTTP-only target via
  `app.fetch()`: no filesystem, no socket commands, jobs via Cron Triggers.
