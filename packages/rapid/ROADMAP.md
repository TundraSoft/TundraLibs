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
- **CLI** (`./cli`) — `init` / `upgrade` / `modules` / `health`. **`init`
  redesigned (2026-08-23):** the runtime (`deno|bun|node|workers`) is asked
  FIRST and shapes everything — exactly ONE primary config file (`deno.json`
  vs `package.json`; previously both were always written, so every project was
  Deno-shaped with a Node file bolted on), runtime-specific dev/start/test
  commands, and the deploy artifact. `--docker` now matches the org
  `tundrasoft/*` images' actual S6 contract (`ENV TASK=`/`SCRIPT=`, no
  `CMD`/`ENTRYPOINT`, `tundra` user, pinned major tag — the old template's
  `CMD ["deno task start"]` bypassed the supervisor, the user drop, and the
  permission mapping). `workers` gets `wrangler.toml` + `worker.ts`, never a
  Dockerfile. `--git` removed (it only ran `git init`, the CLI's sole
  subprocess — `git.ts` deleted); `--github` (opt-in) adds a runtime-correct
  CI workflow instead. **`--ai` (on by default, 2026-08-23):** AI-assistant
  instructions as ONE real `AGENTS.md` + two thin pointers (`CLAUDE.md`,
  `.github/copilot-instructions.md`) — mirroring how this monorepo wires them,
  so every tool resolves to a single source. Rendered for the project (runtime
  commands, module layout), stating rapid's verified API, the org
  CONVENTIONS.md fitted to an app (naming, `__`/`_` privacy, errors, barrels,
  JSDoc — library-only rules omitted), and the verified shape of eleven
  `@tundralibs/*` packages (guardian, radrouter, norm, oql, pact, cacher, id,
  crypt, restler, utils, slogger). Not built: a `rapid ai` REGENERATE
  subcommand — it would have to merge into a guide the user has since edited,
  a real design question; open follow-on if wanted.
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
  `ctx.serve()` / `serveStatic` stream files (compat's `readFileStream`, incl.
  byte ranges)
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
- **OpenAPI from the decorators (2026-08-23)** — routes take `summary` /
  `description` / `tags` / `operationId` / `security`; `@Module` takes
  `description` / `tags` / `security` as the defaults its routes inherit. A
  module's `name` is the default tag, its `namespace` the tag group
  (`x-tagGroups`; namespace = parent, module = sub-module), its `description`
  the top-level tag's. `payload(Schema)` (a schema OBJECT, anything with
  `.parse`/`.toOpenAPI`) validates AND documents the request body — body only,
  by decision: context-derived binders never document. `security` names emit
  requirements + `components.securitySchemes` (`bearerAuth` built in, others via
  `openapi({ securitySchemes })`); `[]` = public. `operationId` defaults to
  `<Module>_<method>` (the SDK generator's key). Version is no longer emitted
  as a tag — it is `x-version` per operation and `x-versions` at the root.
  Deferred (pact in flux): deriving `security` from the `authorize()`
  middleware itself.
- **Config in context + `config()` binder; complete `Application.yaml`
  (2026-08-23)** — `ctx.config` (= `app.config`, every set beside
  `Application`) on every context, and a `config(path, validate?)` binder on
  any transport (set = lowercased file basename, keys case-sensitive, missing
  → `undefined`; never documented in OpenAPI). `rapid init` now writes an
  `Application.yaml` listing EVERY option with its default and allowed values
  in comments; `secret`/`tls`/`unixSocketPath`/`uploads.path`/`tracer` are
  commented examples. The "ongoing maintenance" risk is enforced, not
  remembered: a CLI test boots an app from the scaffolded file AND asserts
  every option rapid defaults appears in the template — a new defaulted
  option fails CI until the template is updated.
  Transport rule, documented: both keys are HTTP-only and SILENTLY IGNORED on
  JOB/SOCKET (a redirect never becomes a 3xx there), so a multi-transport
  method returns them without branching.
- **`serveStatic` Range/206 + the small HTTP cleanups (2026-08-22)** —
  single-range `Range: bytes=a-b` / `a-` / `-n` → `206` + `Content-Range`
  (`416` + `bytes */size` when unsatisfiable; multi-range falls back to 200 per
  RFC 7233), `Accept-Ranges: bytes` advertised on every file response.
  `server.ignoreTrailingSlash` (default true) strips a stray trailing slash
  before routing AND version resolution; `false` makes the slash significant
  (distinct routes, exact match, 404 on a mismatch) — honoured by radrouter
  itself via its new `ignoreTrailingSlash` option, passed through from rapid,
  so strict mode is real on both registration and lookup. `coerceComparable` now
  accepts only plain decimals (`-?\d+(\.\d+)?`), consistent with
  `parsePaging`: `?n=gt:0x1F` / `1e3` stay strings instead of silently
  becoming 31 / 1000. **Brotli closed as infeasible**: `CompressionStream`
  rejects `'br'` on Deno, Bun and Node alike (verified); `node:zlib` would be
  runtime-divergent and a pure-JS encoder is a heavy dep — gzip stays.
- **File streaming promoted to compat (2026-08-22)** — rapid's private
  `fileStream` became `@tundralibs/compat` `readFileStream(path, { start?,
  end? })` (compat 2.5.0): Deno via `Deno.open().readable`, Bun/Node via
  `fs.promises.open` + `FileHandle.createReadStream` → `Readable.toWeb`
  (opening first so a missing file rejects as `FileNotFound` at the call site
  — the path form reports ENOENT asynchronously on the stream), a byte range
  validated up front (a bad range otherwise leaks an fd), Workers/browser
  degrade via `__unsupportedFs`. rapid deleted its copy; `ctx.serve()`,
  `serveStatic`, and Range/206 now run on the shared primitive — verified on
  all three runtimes.
- **Request-id generator (2026-08-23)** — the benchmark profile showed the
  per-request ULID mint at ~7.7% of CPU: a CSPRNG for a correlation id that
  never needed one. The default is now a shared `sequenceID()` (crypto-free,
  monotonic per process, ~10x cheaper: 53 vs 513 ns/op). The process-wide
  static `Application.requestIdGenerator` getter/setter lets the user choose
  (`ulid` for sortability, `nanoID`, their own); the setter BLIND-CALLS the
  candidate and rejects a non-function, a throw, or any output that is not a
  safe non-empty string (the same charset/length guard as inbound ids — a
  raw `sequenceID()` returning `bigint` is caught here). `instanceId` stays a
  ULID (a boot identity, minted once). **Ambient opt-out closed by decision**:
  `ambient.run` measured at 0.4% of CPU, and the bag is load-bearing for
  per-app DI isolation, event/invoke correlation, and log correlation — an
  opt-out would break all three for negligible gain.

## Backlog

No 1.0-vs-later split — everything here is in scope. A few items note a real
technical **dependency** (e.g. "needs the streaming model"); that is a
sequencing fact, not a deferral.

### Tooling & DX

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
- **SDK generator (via RESTler)** — a typed client SDK generated from the
  OpenAPI/decorator metadata — one typed method per route, schemas reused.
  Downstream of OpenAPI; likely its own tool/package.

### Auth & config (TODO — 🔍 user to review pact first, 2026-08-23)

One item left from the HMAC-auth discussion (its two rapid-only siblings —
`ctx.config` + `config()` binder, and the complete `Application.yaml` — shipped
2026-08-23); gated on the pact decision.

- **Signed-request auth scheme (HMAC) alongside Bearer.** `authenticate`
  grows scheme dispatch on the `Authorization` scheme word (RFC 7235):
  `authenticate({ schemes: [bearer(jwt(pact)), hmac(pact)] })`, with today's
  `authenticate({ verify })` ≡ a lone bearer scheme. **Verified:** pact's
  `sign`/`verify` are generic HMAC over bytes — there is NO request-signing
  protocol (no canonical string, header names, timestamp, replay window) and
  NO key storage (`groupResolver` / `isRevoked` / `strategies` / `oauth` are
  its only seams; API keys hand the app `{ id, secret, secretHash }` to
  persist id + hash). **Decision B (taken):** the protocol lives in **pact**,
  not rapid, so a client (restler's `headerProvider`) and the server share one
  definition — `signRequest` / `verifyRequest` over the existing `sign`/
  `verify`, `Authorization: HMAC KeyId=…, Ts=…, Sig=…` format/parse, skew
  check. **Open for the pact review:** a `keyResolver` option mirroring
  `groupResolver` (consumer-owned lookup, pact calls it; per-call override) so
  rapid hands pact only **headers + request material, never a secret** —
  rapid's `hmac(pact, { keys?: 'auth.hmac.keys', maxSkew? })` would supply a
  config-backed resolver when `keys` is set. Canonical string proposal:
  `METHOD \n path?query \n timestamp \n hex(sha256(body))`; raw body via
  `ctx.request.clone()` capped at `server.maxBodySize`. Per-caller keys need
  the plaintext secret server-side (pact's hash-only API-key storage cannot
  HMAC) — config-held (env-sourced) or app-resolved. Guard: reject a resolved
  key that still looks like an unresolved `${VAR}` placeholder (see item 3).
  pact change = own branch off `main` → PR → release, then rapid consumes.

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
- **Simple UI module. 🔍 design DECIDED 2026-08-23 — see
  [DESIGN-ui.md](DESIGN-ui.md); build pending.** A route names a
  **template by function** (`@GET('/users', { template: UserList })`); the
  handler keeps returning JSON-shaped data; a `rapid-swap` request header picks fragment vs not, and the route's
  `prefer` (`json` default, app-wide settable) picks JSON vs layout-wrapped
  page — `Accept` is NOT consulted (user decision); a ~80-line `data-*` client runtime
  (served from a string, Workers-safe) fetches and swaps fragments, auto-
  echoes the `csrf` cookie, and honours `rapid-redirect`. Auto-escaping
  `html`/`raw`/`render` primitives under a new `./ui` subpath; the
  representer runs at the innermost onion point so `etag`/`compress` see the
  final HTML; HTML error pages via `app.ui({ errorTemplate })` on the
  post-onion error path. Mechanism proven by the standalone
  `rapid-ui-demo` prototype (XSS-escaping verified). Not a React/Vite-class
  framework — polling/history/transitions explicitly deferred.

## Parked

- Browser as a rAPId **listener** surface — permanently out of scope (no server
  socket). Distinct from the **Simple UI module** above, which SERVES a UI to
  browsers. Cloudflare Workers is a best-effort HTTP-only target via
  `app.fetch()`: no filesystem, no socket commands, jobs via Cron Triggers.
