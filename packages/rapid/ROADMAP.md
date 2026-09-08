# rAPId Roadmap

Forward-looking build plan. Completed work is summarized under **Shipped**;
everything below it is the **Backlog** — one pool, no 1.0-vs-later gate, all in
scope and up for scheduling. Full build-history detail lives in git and the
project memory. Last updated **2026-09-08**.

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
  and the catalog: cors, secureHeaders, compress, etag, rateLimit,
  timeout, **idempotency** (identity-scoped, fingerprinted
  replays), **session** (signed id, rolling + absolute TTL, regenerate /
  destroy, loaded LAZILY on the first `await getSession(ctx)`), **csrf**
  (signed double-submit, session-bound) and the pact adapter
  (`middlewares/pact`, `pactAuth(pact) → { authenticate, authorize }`).
  Durations are seconds, non-standard header names are options, and the
  stateful three take pact-style `hooks` with bounded in-memory defaults
  (the `Store` seam, the generic `auth`, `requestId`, `responseTimer`,
  `requestLogger` and `healthCheck` middlewares were retired 2026-09-08 —
  the id/timer/logger live in core `headers` + `logger.access` config,
  health is the `health()` endpoint).
  Static serving is no longer a middleware — see `server.static` below.
- **Decorators + modules** — `@GET/@POST/@PUT/@PATCH/@DELETE/@SOCKET/@JOB`,
  binders (`param`/`payload`/`query`/`paging`/`header`/`cookie`/`auth`/
  `session`/`connection`), `@Module`, `@On`/`@Use`, `RapidModule` +
  `initModules` + `app.modules()` (namespace scan, doctor-constructed zero-arg
  modules, instance mounting).
- **Endpoints catalog** (`./endpoints`) — `health`, `metrics`, `openapi`
  (the `login` endpoint was removed 2026-09-08: a login route is app code
  over `pact.login()`, documented in Rapid-Auth.md).
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
- **Metric families (2026-09-08)** — `server.metrics: true | { requests,
  errors, jobs, sockets, middleware, bodies, ui }`; `Meter` declares only
  the enabled families and records error codes at disclosure, job outcomes
  and drift, socket upgrades and channel subscriptions, each middleware's
  decisions, request bytes and uploads, UI representations and static
  outcomes; the latency histogram now uses the transport's arrival clock
  (the metro-man tidy-up's "unify clocks" item).
- **First-release prep (2026-09-08)** — six read-only audits (UI runtime,
  docs-vs-API, config-vs-scaffold, middleware/app/module option types)
  actioned: swap-redirect guarded server-side, response-origin check and
  `defaultPrevented` in the runtime, self-referencing `data-load` skipped,
  live-bridge jitter, `server.socketOrigins` (browser upgrades are
  same-origin unless listed), `ctx.rawPayload` order-independent of
  `payload`, boot validation for `stateMode` / `versioning` / `trustProxy` /
  sizes, bounded `memoryRateLimitHooks`, export gaps closed, JSDoc lint at
  zero. Docs: `Rapid-Configuration.md`, `Rapid-Middleware.md`,
  `Rapid-Errors.md`, `examples/README.md`; the scaffold's `Application.yaml`
  annotates every key with its consumer; `rapid init` ALWAYS writes
  `AGENTS.md` + `CLAUDE.md` (generated middleware catalog, error table and
  version-pinned doc links) with a drift-guard test that fails when the
  public surface grows without the guide.
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
- **UI layer (`./ui`) — SHIPPED 2026-08-27** (design record: DESIGN.md "The UI layer", decided
  2026-08-23): a route names a **template by function** (`@GET('/users',
  { template: UserList })`, plain-API verb helpers gained the same options
  slot); the handler keeps returning JSON-shaped data. Deterministic
  representation — `rapid-swap` header → fragment, else route/app `prefer`
  → JSON (default) or layout-wrapped page; `Accept` never consulted;
  `Vary: rapid-swap` stamped. Auto-escaping `html`/`raw`/`render`/
  `template` primitives (symbol-branded `Html`); layouts resolve route →
  `@Module` → app-level `ui` config; the frozen `view` bag exposes NOTHING from
  `ctx.auth` without the opt-in projection. The ~300-line `data-*` runtime
  is served from a string at `/__rapid/ui.js` (content-keyed ETag,
  always-revalidate no-cache, Workers-safe), echoes the `csrf` cookie, follows
  `rapid-redirect` same-origin only, emits `rapid:swapped`/`rapid:error`.
  Swap-side redirects become `200` + `rapid-redirect`; HTML error pages via
  `ui.errorTemplates` under the same disclosure rules; templated
  routes advertise both media types in OpenAPI. Docs: docs/Rapid-UI.md +
  README "UI"; runnable `examples/dashboard/main.ts`. History shipped in the
  tiers round (below); polling/transitions stay deferred.
- **UI tiers round (2026-08-31; DESIGN.md UI layer, tiers)** — three fixed layout
  tiers (core document > module/route layout > fragment; `layout: false`
  opts out); UI config split BY NATURE — the serializable half under YAML
  `ui:` (`enabled`, `runtimePath`, `live`, `history`, `prefer`, contract
  headers), the code half (`core`/`layout`/`view`/`errorTemplates`/`assets`)
  on `Application.initialize({ ui })` — "config names code, never imports
  it"; `app.ui()` deprecated sugar. A CLOSED error registry (exact status /
  `4xx`/`5xx` / `default` → `DefaultErrorPage`). Static serving became
  CONFIG: `server.static` (prefix → dir, served on route miss, routes win;
  `serveStatic` removed) with LAZY per-path fingerprinting (`view.asset()`,
  immutable `?v=` URLs, no boot walk). Route `title`/`meta` flow to the
  tiers. The opt-in **history module** (`ui.history`, `data-push`,
  popstate re-fetch, no DOM cache). Sessions load lazily (`getSession` →
  promise). `rapid init --ui` scaffolds the three-tier starter, `--with
  bootstrap|pico` self-hosts a CSS framework. Examples restructured into a
  showcase (blog: permission-driven nav via the `view` projection; kanban:
  history + `formState`; dashboard).
- **Adversarial review + hardening (2026-09-01 → 04)** — 23 findings
  dispositioned (the review notes were not kept in the repo), then
  a same-day pass over the fixes caught and corrected 8 regressions. The
  keepers: `idempotency()` REQUIRES an identity `scope` (`false` = explicit
  shared space), caps keys, skips unmatched requests, snapshots records
  wire-faithfully (JSON round-trip — `toJSON` honoured on replay) and
  never evicts an in-flight `pending` marker; `session()` saves only after
  a COMPLETED load, clones at load AND save, runs its save phase on the
  throw path; config fails LOUDLY (closed key sets for `ui:`/`server.static`,
  boolean gates, `mode` normalised, late `route()`/`use()` after the router
  snapshot throws); cookies queue and apply in CALL ORDER (signed ones
  included — a later delete wins); `compress` skips 206; malformed multipart
  → 400; SSE strips bare CRs; graceful stop drains jobs AND HTTP
  concurrently within one window, removes the uploads dir only after;
  unmatched-request errors negotiate `Accept` when `errorTemplates` exist;
  identity-bearing pages stamp `Vary: Cookie` + `Cache-Control: private`;
  `formState` rethrows unrecognised throws; the runtime origin-gates its
  fetch and survives a double load; compat twins (`negotiate`/`parseRange`/
  `parseCookies`) deduplicated; the false docs corrected.
- **Beta feedback round (2026-09-04/05)** — `when()` / `each()` template
  helpers (value-truthiness branches — `0 && …` rendered "0" — and lists
  with an empty state) + a "keeping large pages readable" guide;
  `data-load` lazy regions (skeleton first — the answer to "partial
  prerendering"; D10 amended); csrf tokens session-bound (cookie tossing
  closed). JSX authoring parked (below).
- **Surfaces — API and UI in one app (2026-09-06; DESIGN.md UI layer, surfaces)** —
  `server.api: { hosts, prefix }` names the API surface; every HTTP
  request resolves to `'ui' | 'api'` BEFORE routing (prefix stripped,
  then a path-mode version) and `ctx.surface` / `ctx.basePath` /
  `ctx.path` / `ctx.href()` carry it. The api surface is a SMALLER route
  table: pages (`prefer: 'html'`), `server.static` and the `/__rapid/*`
  runtime are true no-matches (no route middleware, absent from
  405/`Allow`), API-first templates serve JSON with no `Vary`; the ui
  surface is unchanged. `ui.enabled: false` ≡ every request is api (the
  old "JSON unconditionally" semantics and their field-filter exposure
  are gone). `onlyApi()` / `onlyUi()` scope middleware (pass-through
  off-HTTP). Bundled fixes: bare routes keep JSON errors in a
  pages-first app; a scheme-relative `redirect` is refused; the UI
  runtime scripts load lazily (an API-only app no longer hashes 15 KB of
  client script at import); OpenAPI omits pages when an api surface
  exists and lists a page as `text/html` only; `x-forwarded-host` under
  `trustProxy`; idempotency keys are per surface. Two adversarial passes
  (security + design, 25 findings) shaped it — the register lives in
  the session spec; the decisions in DESIGN.md, UI layer, surfaces. Docs: Rapid-UI.md
  "Surfaces".
- **Adversarial review #3 + fixes (2026-09-07)** — 7 high / 16 medium / ~28 low
  dispositioned the same day, all but the pact-adapter high (rides the
  pact rewrite) fixed with regression tests. Headline fixes: the
  redirect guard resolves against a sentinel origin (tab bypass);
  `idempotency()` keeps a timed-out key PENDING in either order (the
  poisoned-504-replay finding surfaced while fixing); route-bound
  `RapidModule` methods seed the invoke frame (`ctx.auth` reaches `@Use`
  guards); rolling sessions `Store.touch()` instead of overwriting a
  concurrent write; `csrf()` re-binds on the rotating response and
  `view.csrfToken` is the effective token; the `--module`/`--norm`/npm
  scaffolds install and type-check (generate-then-check test);
  `uploads.maxFiles`; static nested `index`, re-pointed symlink roots,
  `If-Range`; `server.api.trustForwardedHost` explicit; app-level
  durations in SECONDS (`shutdownTimeout` 1–30). Deferred to the
  pact/middleware round: BREACH token masking, middleware duration units.
- **pact adapter rebuilt for pact 0.7 (2026-09-07)** — `middlewares/pact.ts`
  is ONE factory, `pactAuth(pact, options) → { authenticate, authorize }`,
  in the shape of pact's own hono/oak adapters: `authenticate` fills
  `ctx.auth` with the `PactAuthContext` (Bearer with a configurable
  prefix or a cookie, Basic, ApiKey via `Authorization` or split
  headers, HMAC over an async `canonical(ctx)`), absent → anonymous
  (`optional: false` → 401), present-but-invalid → 401 never anonymous,
  one `WWW-Authenticate` challenge shared by both middlewares;
  `authorize(module, permission)` is typed by the instance and checked
  against its catalog at the call site. The `pact()` initializer, doctor
  label, `TOKEN` scheme and per-scheme `respond` hook are gone.
  A `login()` endpoint shipped here and was removed 2026-09-08 in favour
  of a documented app-side route. Both deferrals landed 2026-09-08 with pact 0.8's middleware
  core: RFC 9421 template signing both ways and `createPactMiddleware`.
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
  Deriving `security` from the `authorize()` middleware itself SHIPPED
  2026-09-08: a guard carries OpenAPI metadata (`markOpenApi`), `app.route()`
  fills the route's requirement and declares the schemes from it.
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
- **Per-request hot-path perf — the plan is closed (2026-08-24).** The
  `bench/REPORT.md` ranked plan (R1–R5) is landed or deliberately dropped, and
  the autocannon framework comparison was re-run on compat 2.7.0:
  - **Async-spine collapse (R1).** `_invoke`/`__runInvoke` run the onion
    SYNCHRONOUSLY on the zero-middleware/no-tracer happy path — the thenable
    branch enters the promise lane only when the handler actually returns one,
    so a bare sync handler finalizes without allocating a single request
    promise. Same ambient scope, error disclosure, and finalize order — no
    behavior change. (~−0.7/−0.9/−1.0µs Deno/Bun/Node.)
  - **`ctx.args.params` freed.** Reading it cost ~2.5µs/req on Node building
    the frozen `args` wrapper (a per-request object literal with inline
    `query`/`paging` accessor getters + `Object.freeze`) for a param the router
    had already resolved into `this.params`. Now an `HTTPArgs` class with the
    getters on the PROTOTYPE — one cheap allocation; `params` frozen and
    `query`/`paging` return their own frozen collections (contract intact); a
    `toJSON()` keeps `JSON.stringify(ctx.args)` whole. Wrapper tax ~2.5→0.7µs;
    `ctx.args.params` now measures on top of a direct `ctx.params` read.
  - **Node Fetch-tax (R5).** The lazy-`Request` impersonation shipped in
    **compat 2.7.0** (`LightRequest` — serves method/url/headers/body from
    `IncomingMessage`, materializes undici only on a heavy read; ~+5.6%
    transport / ~+2% rapid throughput on Node 26, isolated A/B). rapid picks it
    up when it consumes 2.7.0.
  - **Request-id (R2).** Landed as the `sequenceID()` default above; the pooled
    ULID was dropped as CSPRNG-unsafe.
  - **Pathname raw-scan (R3) — REJECTED.** Replacing `new URL(request.url)
    .pathname` in `__handle` saves ~0.1µs but drops dot-segment normalization
    (`/a/../b` → `/b`); since `Deno.serve` delivers `request.url` UN-normalized,
    a raw scan would route the same request differently per runtime AND weaken
    the routing/guard security boundary. `new URL` stays (the call site
    documents this).
  - **Standing** (autocannon `-c 50`, this machine): Node 26 — rapid ≈ express
    parity on `GET /` (~102%), ~94% on `/users/:id`; Deno — rapid ≥ oak on
    `GET /`, ~91% on params; fastify sits at raw `node:http` (the honest
    ceiling for a Fetch-contract framework). No rapid-side perf lever remains.

## Backlog

- **Extract to lower packages** (from the 2026-08-23 full-pass review; each
  is its own cross-package PR — release the lower package, then rapid
  consumes). `negotiate`, `parseRange` and `contentTypeFor` already moved to
  `@tundralibs/compat/http`. The rapid side is done (2026-09-08): the
  `:port`-in-XFF collapse is fixed, `pickEncoding` is its own
  `utils/pickEncoding.ts`, and the hidden-slot define is one helper
  (`utils/hiddenSlot.ts` `pinHidden`). Candidates still in rapid, each
  self-contained: `utils/resolveClientAddress.ts` → utils (sibling of
  `isPublicIP`); `utils/compose.ts` → utils (`ModuleRuntime` keeps its own
  sync-through onion on purpose: invoke contexts are not `Context`s and a
  sync `@Use` chain must stay promise-free); `utils/streams.ts` → a compat
  stream subpath; `parseCookies`/`serializeCookie` in `utils/cookies.ts` →
  compat/http; `utils/pickEncoding.ts` → compat/http beside `negotiate`;
  the TC39 decorator-metadata side-table in `decorators/registry.ts` →
  utils; `pinHidden` → ambient.

No 1.0-vs-later split — everything here is in scope. A few items note a real
technical **dependency** (e.g. "needs the streaming model"); that is a
sequencing fact, not a deferral.

### UI follow-ups

- **`live: 'sse'`** — a Server-Sent-Events variant of the live bridge
  (server: one `ctx.sse()` endpoint fanning in from `app.channel()`s;
  client: `EventSource`, same `rapid:push`/`rapid:live` events) so live
  updates work on Cloudflare Workers, where the rpc WebSocket cannot
  listen. Documented as a known limit in docs/Rapid-UI.md until then.
- **JSX authoring runtime — PARKED (beta feedback 2026-09-04, user
  call).** The only "SFC-like" option consistent with "the type checker
  is the template compiler": a `ui/jsx-runtime` producing the same
  `Html` (escape-by-default, `raw` the one opt-out), typed props for
  free, no tooling of ours (every runtime compiles JSX). A few hundred
  lines + intrinsic-element types + a second authoring syntax to
  document. Mustache/SFC compilers rejected (a language + a Workers
  file-loading story, and the typed handler↔view contract is lost).
  Decide on its own merits, not as a reaction to one report.
- **`cores` registry** (YAML `ui.core: <name>` selecting the document
  per replica) — DEFERRED from the tiers round: chrome moved to the
  module tier, thinning the per-replica case; purely additive when a
  real multi-core need appears.
- **DEV asset watch** — `view.asset()` already re-hashes on mtime
  change per render in DEVELOPMENT; a proper file watcher (instant
  invalidation + a future live-reload nudge) rides the dev-console
  work.
- **Upload progress** — fetch-based submits can't report progress
  cross-runtime; out of scope for the bundled runtime (app JS/XHR).
- **A11y recipe** — `aria-live` on swap regions + focus guidance off
  `rapid:swapped` (docs, not mechanism).

### Middleware-as-config (direction set 2026-08-31)

`server.static` is the PILOT: the default middlewares become YAML-
configurable (per replica) the same way — data-only options in config,
code-valued seams (stores, key extractors, verify fns) stay
programmatic, "config names code, never imports it" throughout. The
HARD problem to design first: **ordering** — the onion's sequence is
semantics, and a config list must express or pin it. Per-middleware
route/prefix scoping (e.g. session excluding asset prefixes) lands
here too — never as a position knob on static.

**Shape decided 2026-09-08: organised by STRUCTURE, not by middleware.**
The YAML groups config by what it is, not by which middleware consumes
it — every header name under one `headers:` key (`headers.requestId`,
`headers.csrf`, `headers.apiKey`/`headers.signature`/`headers.timestamp`,
…), durations under one convention (SECONDS, app-wide — the ms-vs-s
audit of the middlewares is the precondition), and so on — so an
implementer swapping a built-in middleware for a custom one still reads
the same config items instead of a `csrf:`/`session:` island that dies
with the middleware it was named after. Built-ins read those shared keys;
a middleware's own knobs that no other middleware could share (compress
`threshold`, cors `origin`) stay per-middleware. Open question to settle
when designing: precedence between a shared key and an explicit factory
option (`csrf({ header })` vs `headers.csrf`) — explicit code should win,
config is the default.

### Response caching (PINNED 2026-09-08 — after the first rapid release)

Decided shape, not yet built. A **middleware**, `cache()`, hooks-backed like
`session`/`rateLimit`/`idempotency` (`getCached`/`saveCached`/`purgeKeys`/
`purgeTags`/`reset`, memory default with a `maxEntries` bound, cacher adapter
is the implementer's), plus a small **core** handle for invalidation
(`app.cache.purge(tags)` / `app.cache.reset()` reachable from any write
handler — the middleware registers its hooks, like `app.publish()` reaches
subscribers). Why middleware: opt-in per route, must sit after
`authenticate` and outside `etag`/`compress`, carries state. Key = surface +
method + routed path + normalised query + Vary values, **anonymous replies
only by default** — per-user caching is an explicit `scope: (ctx) =>
principal`, so a wrong key can never leak one user's reply to another.
Cacheability follows the handler's `Cache-Control` (`no-store`/`private`
never stored, `max-age` overrides the configured `ttl`); 200 only, no
streams, no `set-cookie`. Reset in three layers: a short default TTL
(seconds, 60) as the safety net; route `tags` + purge for everyday
invalidation (writes know WHAT changed, not which URLs rendered it); a
generation prefix for `reset()` so backends without key scans still work.
Multi-replica purge: the shared backend is the source of truth; the memory
default is per-process (document, optionally bump the generation over
`app.publish()`). Stampede: coalesce concurrent misses per replica. Hits
carry `age` + a configurable hit/miss header and the stored `etag`. Route
option sugar (`{ cache: { ttl, tags } }`) once decorated routes take
per-route middleware.

### metro-man tidy-up (PINNED 2026-09-08 — discuss after caching)

A standard way for middleware to record their own counters (rate-limit
rejections, idempotency replays, cache hit ratio) instead of ad-hoc
`ctx.meter` use, and one clock: the meter's histogram measures the onion
while the access line and `headers.responseTime` measure arrival→finalize
from the transport's `started` — unify on the latter.

### Tooling & DX

- **CLI `build`** — a scaffolded deno task wrapping `deno compile` / the
  fetch-adapter bundle, rather than a heavy CLI command.
- **Dashboard (`@tundralibs/rapid/dashboard`) — agreed 2026-09-08, build
  next.** A server-status page built on rapid's OWN UI layer (templates,
  `data-load` panels, the live bridge) — the showcase of the UI layer as
  well as of the server; no bundler, no CDN, runs wherever routes run.
  Mounted in one call (`dashboard(app, { path, expose, guards })`) through
  plain `app.get()` registrations so every route takes the guards; `uiOnly`;
  gated like `openapi()` (`expose` DEVELOPMENT by default). Panels, all from
  existing seams: overview (name, mode, instance, runtime, uptime, address,
  surfaces, static mounts, metrics/tracing on/off); traffic (in-flight, req/s
  and status classes from the server counters, the latency histogram and
  error codes from the meter when `server.metrics` is on); inventory
  (routes with version and surface, socket commands, channels, jobs with
  schedule / last run / running-now and a guarded "run now" →
  `triggerJob`); a live feed of the last N invocations (the one new
  primitive: a bounded ring buffer fed from the access-log path, on only
  while mounted) streamed over a `__rapid.dashboard` channel; recent errors
  by code with request ids. Access under the cluster model: entering the
  cluster or node secret unlocks it; the master's dashboard shows the fleet.
  Sequencing agreed the same day: `ready()` (readiness that 503s during the
  drain) and the pact session handlers on `pactAuth` (`login`, `logout`,
  `refresh`, `me`) first, then the dashboard.
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

- **Signed-request auth scheme (HMAC) alongside Bearer — SHIPPED 2026-09-08
  via pact 0.8's middleware core** (`pactAuth(pact, { hmac: {} })`: RFC 9421
  template, `x-timestamp` freshness, response signing, JWE payloads; the
  generic `authenticate({ verify })` helper is gone). Original note kept for
  the reasoning: `authenticate` was to grow scheme dispatch on the
  `Authorization` scheme word (RFC 7235). **Verified:** pact's
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
  - **Refined 2026-09-08 (user):** ONE master container, no master replica
    for now. The master's job is to track the workers, designate the job
    node, and MAYBE push config updates dynamically. Joining and viewing go
    through endpoints authenticated by a **cluster secret** (per cluster) or
    a **node secret** (per worker). The dashboard below rides the same
    secrets: it is not visible until the cluster or node secret is entered;
    on the master it shows the fleet (`ClusterSnapshot`), on a worker it
    shows that node. Not fully designed yet — the idea, not the contract.
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

## Parked

- Browser as a rAPId **listener** surface — permanently out of scope (no server
  socket). Distinct from the **Simple UI module** above, which SERVES a UI to
  browsers. Cloudflare Workers is a best-effort HTTP-only target via
  `app.fetch()`: no filesystem, no socket commands, jobs via Cron Triggers.
