# rAPId Roadmap

Build plan status as of 2026-08-13. Phases A and B are DONE (verified
cross-runtime); everything below is pending, in dependency order.
Design decisions referenced here are locked unless marked as an open
gate — see the wiki/DESIGN.md for the "how it works" side.

## Done

- **Phase A — decorator de-risk spikes**: standard-decorator opt-out
  (`deno.json` + standalone `tsconfig.json` — Bun's tsconfig `extends`
  is broken and Bun/tsx resolve tsconfig from CWD, so bun/tsx runs
  must start in this directory); JSR→npm emission verified (JSR
  pre-lowers stage-3 decorators; npm consumers need no transform);
  Deno Deploy smoke test green.
- **Phase B — context parity + args**: `ctx.action` (was `name`);
  `ctx.args` = `{ params, query, paging }` uniform on HTTP/SOCKET/JOB
  (socket payloads object-enforced; job args = registration defaults ⊕
  `triggerJob` overrides); `ctx.connection` envelope from upgrade;
  `ctx.payload` lazy getter (promise-cached on HTTP, sync frame value
  on SOCKET, undefined on JOB); query grammar in
  `utils/parseQueryFilters.ts` + paging in `utils/parsePaging.ts`;
  `server.paging` / `server.query` config groups. 103 test steps.
- **Refactor round (2026-08-13)**: naming family locked — `rapid()`
  factory, `RapidError`, full-chain type identifiers (`Rapid` +
  subfolder + file: `RapidApplicationEvents`, `RapidContextArgs`,
  `RapidMiddleware`, …), `RAPID_*` constants; brand styling "rAPId"
  lives in prose only. `types/` grouped into `application/` +
  `context/` subfolders (file = leaf, identifier = full chain — rule
  codified in CONVENTIONS.md). Convention compliance sweep:
  `private __`/`protected _` prefixing package-wide, `@throws`/
  `{@link}` coverage, `transports/Base.ts`→`Transport.ts`,
  `context/Base.ts`→`Context.ts`, `toRouterPath`→`utils/` with tests,
  Sonar S2933 readonly pass. 108 test steps.

## Phase C — middleware engine (COMPLETE 2026-08-13)

- ✅ DONE (2026-08-13, Tier 1): universal `use()` live on all three
  transports (`RapidMiddleware` takes the discriminated `RapidContext`
  union — `ctx.type` ladders narrow natively); job
  skipped-by-middleware outcome (WARN + `handlerRan` in the trigger
  outcome); 3xx rejected at set-time off-HTTP; `ctx.matched` on HTTP;
  JOBTransport subscribes cronus `error`. Tier-1 middlewares shipped
  in `middlewares/` (`./middlewares` subpath): `requestLogger`,
  `timeout`, `rateLimit` (+ `RateLimitStore` seam, `MemoryRateStore`),
  `requestId`, `responseTimer`. 131 test steps, 3-runtime smoke green.
- ✅ DONE (2026-08-13, Tier 2 + sugar): `onlyHTTP/SOCKET/JOB` (skip
  elsewhere) + `guardHTTP/SOCKET/JOB` (fail-closed RAPID_ACCESS_DENIED
  elsewhere) in `middlewares/scope.ts`, carrying `MIDDLEWARE_SCOPE`
  metadata; boot WARNING at start() when socket commands exist, some
  middleware is registered, and none reaches SOCKET (zero middleware =
  deliberately bare, no noise); `cors` (origin list/predicate/
  wildcard, credentials echo, preflight 204 short-circuit, headers
  pre-`next()` so errors stay browser-readable) and `secureHeaders`
  (nosniff/DENY/no-referrer defaults, HSTS+CSP opt-in). 144 test
  steps, 3-runtime smoke green. Phase C middleware manifest COMPLETE;
  the user flagged general implementation reservations — revisit
  shapes before Phase D freezes them.
- ✅ DONE (2026-08-13): route grammar is RADROUTER-NATIVE only —
  params are colon-wrapped (`/users/:id:`); the express-style
  translation layer (`toRouterPath`) is deleted. Grammar enforcement
  belongs to radrouter itself (its `MalformedPathError` names the
  segment and every legal form — it rejects `:id` AND stray static
  colons); rapid wraps it as RAPID_CONFIG at start(), test-pinned.
- ✅ DONE (2026-08-13, closing items): per-COMMAND socket chains —
  `app.socket(command, ...middleware, handler)`, route() grammar,
  composed AFTER the universal chain (`RapidSOCKETMiddleware` type;
  per-JOB chains deliberately NOT offered — that's `use(onlyJOB(...))`).
  respond()-guard DECIDED AGAINST (the freeze contract already makes
  early respond() loud + safe); instead: JOB finalize parity (early
  respond → uniform 500 outcome, never a rejection — HTTP already had
  this) + the "never call ctx.respond()" contract line on
  `RapidMiddleware`. 146 test steps, 3-runtime smoke green.
- SHIPPED MIDDLEWARE manifest (factories in `middlewares/`, exported
  via a `./middlewares` subpath, one test file each):
  - Universal: `requestLogger` (action/type/outcome/duration via
    slogger, level by status), `timeout` (deadline → RAPID_TIMEOUT;
    complements cronus overlap guard on jobs), `rateLimit` (keyed by
    remoteAddress / connectionId, jobs pass; in-memory store +
    pluggable store interface for cacher later), `requestId` (policy
    customization over the core echo: header names, generator,
    adopt on/off, socket envelope echo), `responseTimer`
    (x-response-time header on HTTP; duration to span/state
    everywhere).
  - HTTP-only (via the sugar): `cors` (origins/methods/headers/
    credentials/preflight), `secureHeaders` (helmet-lite, CSP off by
    default).
  - Deliberately deferred: auth (GATED on the auth-context design +
    pact round), compress, etag, static, csrf/session/cookies.
- Designed-in adversarial fixes: job "skipped-by-middleware" outcome
  (WARN + `handlerRan`, never a debug "finished"); socket outcome
  matrix (status-derived rpc codes, 3xx rejected at set-time
  off-HTTP); per-COMMAND socket chains un-trimmed; `respond()`
  unreachable from middleware; boot WARNING when socket commands exist
  with no socket-reaching middleware; JOBTransport subscribes cronus
  `error`; `ctx.matched` exposed.
- Three-runtime test pass for B+C together.

## Phase D — decorator tier + modules (DECORATORS DONE; modules LAST)

- ✅ DONE (2026-08-14, decorator tier — user resequenced: decorators
  first, modules at the end): `decorators/` + `./decorators` subpath —
  metadata-only TC39 `@GET/@POST/@PUT/@PATCH/@DELETE` (radrouter-native
  paths), `@SOCKET(command)`, `@JOB(name, schedule)` (cron validated
  at decoration time); binder factories `param/payload/query/paging/
  header/connection` (pure descriptors; overload-split so unvalidated
  binders PIN their types — `payload()` forces `unknown` until a
  validator earns the type; contextual-inference escape closed);
  side-table registry `WeakMap<Function, RapidDecoration[]>` (append;
  `decorationsOf()` reader; wrapping-decorator caveat documented);
  runtime LEGACY-MODE tripwire in every decorator (the tsconfig-trap
  guard); compile contract = `RapidModuleReply` envelope + bind-tuple-
  driven params (@ts-expect-error-pinned: bad return, arity overflow,
  param-type mismatch). 157 test steps; Deno/Bun/tsx smoke identical.
  NOTE (RESOLVED below): envelope key rides `RapidContextResponse` —
  the modules round kept `content` (no rename), so no type swap was
  needed.

## Phase D remainder — MODULES (COMPLETE 2026-08-15)

- ✅ DONE: `@Module({ prefix })` — metadata-only TC39 class decorator,
  OPT-IN (a class with no `@Module` still mounts, empty prefix). New
  side-table `WeakMap<constructor, RapidModuleMeta>` alongside the
  existing method-keyed one (`decorators/registry.ts`); a sibling
  `assertClassContext` gives it the same legacy-mode tripwire as every
  method decorator. Prefix is validated (must be empty or start with
  `/`) AT DECORATION TIME, same loudest-possible-moment precedent as
  `@JOB`'s schedule check — a bad prefix fails at import, not inside a
  confusing joined-path error later.
- ✅ DONE: `app.module(...instances)` — the mount engine
  (`utils/mountModule.ts`). Prototype-walks each instance, reads
  `DECORATIONS` per method, and funnels every entry through the EXACT
  SAME `route()`/`socket()`/`job()` core plain registration uses — so
  duplicate-command/duplicate-job-name/malformed-path detection all
  come for free, test-confirmed (two `@SOCKET` methods with the same
  command name across two separate `module()` calls throws the
  existing "already registered" error, untouched).
- ✅ DONE: the six binder sources (`param`/`payload`/`query`/`paging`/
  `header`/`connection`) extract and validate at MOUNT-BUILT
  invocation time, uniformly across HTTP/SOCKET/JOB — `param`/`query`/
  `paging` read the already-uniform `ctx.args`; `payload` awaits the
  RESERVED `ctx.payload` channel (HTTP's cached parse promise,
  SOCKET's frame value, `undefined` on JOB — `await` treats all three
  identically, so this needed no new Context-layer code); `header`
  resolves per transport (`ctx.headers` / `ctx.connection.headers` /
  `null` off-HTTP). `connection()` is SOCKET-exclusive by nature and is
  REJECTED AT MOUNT TIME (not per-request) when bound on an
  `HTTP`/`JOB` decoration — a config mistake, not a runtime condition.
- ✅ DONE: the runtime half of the {@link RapidModuleReply} contract —
  the compile-time check is erased at runtime and nothing downstream
  re-validates shape (the `response` setter only reads `.content`), so
  the mount tier does: a plain non-array object with a `content` of
  string/plain-object/`Uint8Array` throws `RAPID_RESPONSE_INVALID`
  otherwise. `status`/`headers` are deliberately left to the
  per-transport `response` setters (already validate what they care
  about — 3xx rejection off-HTTP — revalidating here would drift out
  of sync).
- ✅ DONE — **subclass-override policy DECIDED** (was an open gate):
  REJECT LOUDLY. The registry is keyed by the exact function a
  decorator recorded; an override that doesn't re-apply the decorator
  would otherwise leave the base's routes bound to a method the
  instance no longer runs — silently unreachable, the same "silently
  lost" failure family `registry.ts`'s wrapping-decorator caveat
  already warns against. Algorithm: walk the prototype chain top-down
  (most-derived first); the first decorated function found under a
  given method NAME is compared against `instance[name]`'s actual
  resolution — identical ⇒ mount normally (covers both "never
  overridden" and "overridden AND re-decorated"); mismatched ⇒ throw
  `RAPID_CONFIG` naming the class/method/declaring ancestor. Both
  branches test-covered.
- ✅ DONE: prefix joins onto HTTP paths only (socket commands/job names
  are flat namespaces, unaffected) — confirmed against radrouter's
  OWN normalization (`__normalizePath` collapses `/+` and trims a
  trailing slash), so a bare string join needs no bespoke path-join
  helper.
- **DELIBERATELY DEFERRED, not built this pass** (each is additive on
  top of the mount mechanism, not a prerequisite for it):
  - **Versioning** (`@Module({ version })` / `@GET(path, { version })`
    unlocking radrouter's version dimension) — a distinct unit of work
    (new `server.versioning` config, a request-side version-header
    read, threading a version param through `route()`/radrouter's
    `addRoute`/`find`). No `version` option exists on `@Module`/`@GET`
    today — adding a silently-ignored option would be worse than not
    having one.
  - **Opt-in error-registry extension** (modules extending rapid's
    error codes) — plain throws already become a generic 500 via the
    existing disclosure envelope; no new mechanism was needed to ship
    the mount tier.
  - **Auth-context handoff** — still undesigned; the binder tier makes
    no assumption about `state.principal` (nothing added references
    it).
- 218 test steps (198 pre-modules + 20 new: `decorators/module.test.ts`,
  `Application.module.test.ts`, plus `assertClassContext`/module-meta
  coverage folded into `decorators/registry.test.ts`); Deno/Bun/node+tsx
  smoke identical (20/20 on all three). Full-package smoke also run on
  all three — two PRE-EXISTING, UNRELATED failures found and confirmed
  independent by isolated reruns: a Bun cross-test flake in
  `middlewares/responseTimer.test.ts` (passes 3/3 alone; fails only
  under full-suite parallel load) and a genuine Node-only failure in
  `Application.test.ts:561` (`cleanup()` unawaited-parse assertion) —
  neither touches code this phase changed; left for a separate pass.

## Open decisions

- **Should `utils/` throw `RapidError` or generic errors?** Today it is
  MIXED: `parseBody`, `parseQueryFilters`, and `buildExporter` throw
  `RapidError` (so their codes map straight onto response statuses —
  RAPID_PAYLOAD_TOO_LARGE, RAPID_QUERY_INVALID, RAPID_CONFIG), while
  `compose` throws a plain `Error` (double-`next()`) that the shared
  cycle laundres into RAPID_UNHANDLED/500. The trade: framework errors
  keep status/disclosure mapping and a stable code for callers, but
  couple these otherwise-pure functions to the framework's taxonomy
  and make them harder to reuse or unit-test standalone. Alternative
  shape: utils throw plain/typed errors and the CALLER (context or
  transport) wraps them into `RapidError` at the boundary — pure utils,
  one translation point. Decide before Phase E docs freeze the
  `@throws` contracts. `utils/mountModule.ts` (2026-08-15) followed the
  majority and throws `RapidError` directly (`RAPID_CONFIG`/
  `RAPID_RESPONSE_INVALID`) — one more data point for whichever way
  this gets decided, not a vote either way.

## Phase E — hardening + docs

- Deferred review items: U7 test-coverage completion; span
  status-code; cronus job-drain on stop; graceful HTTP drain.
- DESIGN.md sync (including: the transport seam is the future
  Cloudflare-Workers/edge adapter point — fetch handler → HTTPContext,
  Cron Triggers → JOBContext, WebSocketPair → SOCKETContext); wiki
  docs per `.github/instructions/documentation.instructions.md`;
  README refresh.

## Phase F — ship

- First commit of the package (user gives the explicit go), release
  train (one release PR at a time), JSR publish verification.

## For 1.0.0 — capability scope

Features targeted for the 1.0.0 release. Additive unless flagged;
store-injection is the one breaking change and must land before release.

- ✅ **Store-injection refactor — DONE (breaking).** Stateful middleware
  take a `{ get, set }` `Store` (sync or async) instead of a baked store —
  the app brings memory/redis/cacher by handing over two closures.
  `middlewares/store.ts`: `Store<V>` + `memoryStore<V>()`. `rateLimit`
  migrated (`options.store: Store<Window>`, default `memoryStore()`), with
  a sync fast-path so the in-memory default stays race-free.
  `MemoryRateStore`/`RateLimitStore` removed → `memoryStore`/`Store`.
- ✅ **Middleware catalog — DONE (core three).** Added `healthCheck({path?,
  check?})` (liveness/readiness, 200/503), `etag()` (SHA-1 content ETag +
  304 conditional, GET/HEAD 200s), and `compress({threshold?})`
  (gzip/deflate via CompressionStream, Accept-Encoding-negotiated,
  compressible-type + threshold gated, Content-Encoding + Vary). Body-size
  limit intentionally NOT shipped (already `server.maxBodySize`).
  Further additions (CSRF, session, etc.) can follow the store-injection
  shape as needed.
- ✅ **Cookie support (HTTP) — DONE.** `ctx.cookies` (parsed inbound map),
  `ctx.setCookie(name, value, {maxAge/expires/path/domain/secure/httpOnly/
  sameSite})`, `ctx.deleteCookie(name, {path,domain})`, plus
  `ctx.redirect(url, permanent?)` (302/301). Value percent-encoded (no
  header injection); illegal names throw. `utils/cookies.ts`.
- ✅ **Static content serving (HTTP) — MOSTLY DONE.** `serveStatic({root,
  prefix?, index?, maxAge?})` middleware (`./middlewares`) — directory
  serving, extension content-types (mimeTypeFor), directory index,
  Cache-Control, and a path-traversal guard (blocks `../` and `%2e%2e`
  /`%2f`); falls through for non-matches so routing/404 still work. Shown
  in the blog example (public/ + `GET /` redirect). REMAINING (follow-ups,
  not blocking): ETag/conditional (If-None-Match/If-Modified-Since → 304),
  Range requests, and streaming large files (v1 reads whole file into
  memory — the response model is content-only, would need a stream body).
- ✅ **Proper MIME types — DONE.** `utils/mimeTypeFor` resolves a file's
  content-type by extension via `@std/media-types` (added to the workspace
  import map + `package.json`; verified clean on Deno/Bun/Node — it's a
  pure extension map). Used by `HTTPContext.serve()` AND the upload path
  (the stored file's `type` is now server-derived from the validated
  extension, not the client's unverified `value.type`). The comprehensive
  resolver the static-serving item needs is now in place.
- **CLI — scaffolder, `modules` barrel generator, build, health.** A
  Fresh-flavoured `deno run -Ar jsr:@tundralibs/rapid/init` lays down a
  new project (app entry, config, a sample module, tasks) and `upgrade`
  bumps the rapid version / migrates scaffolding. Plus:
  - **`modules` — generate `modules/mod.ts`.** The barrel is the ONE
    module-loading input rapid supports at runtime (see the DI items
    below: `initModules({ modules: [ns] })` takes static namespaces so the
    graph stays bundler-/Workers-safe and typed). The generator does the
    filesystem work at build time: walk the folder with include/exclude
    globs (skip tests/benches/`_`-prefixed/dot files/fixtures), import each
    candidate to confirm it exports a decorated module class, emit sorted
    `export { X } from './X.ts'` lines under a "generated — do not edit"
    header, idempotent; `--check` fails CI when the barrel is stale (same
    pattern as the repo's own `workspace:sync --check`). UNTIL THIS EXISTS
    the barrel is hand-written (two lines in the blog example).
  - **`build`** — bundle/compile the app for its deploy target (Deno
    Deploy, Workers via a fetch adapter, a Node bundle), regenerating the
    barrel first.
  - **`health`** — hit a running app's `healthCheck` path (+ metrics) from
    the terminal; a CI/ops smoke.
    Not a route inspector — the live wired-surface view is the dashboard.
- **Dev console (TUI). 🎨 DESIGN FROZEN 2026-08-22; build pending.** A
  full-screen alternate-buffer terminal console that replaces the plain
  log spew when the app runs on a TTY. Frozen spec (mockup + runnable
  preview exist):
  - **Regions, each backed by an existing getter** (the renderer invents
    no data): ASCII-Shadow `RAPID` banner + bind line (`app.mode` /
    `app.address` / `app.port` / `RUNTIME` / `app.instanceId`);
    registered totals (`app.routes` / `socketCommands` /
    `jobMetrics.total` / `moduleRuntime.modules` / `middlewares` /
    `declaredEvents`); an **HTTP-metrics KPI grid** — dim label over
    bright value — (`app.metrics`: in-flight / peak / total / avg &
    min–max latency + a 2xx/3xx/4xx/5xx status-class bar; `socketMetrics`);
    scheduled jobs (`jobMetrics.jobs[]` / `CronusJobInfo`); a rolling
    **request stream** (the one region needing a small finalize-tap ring
    buffer: action / status / latency / reqId); and a **log tail** (last
    ~N slogger lines, module-scoped).
  - **Layout** capped at ~120 cols and **centred** in wider terminals
    (balanced margins, never full-bleed — long rows stay scannable);
    borders clip-or-pad to exact width at any size.
  - **Four behaviours, gated on `isatty`:** DEV + TTY → on by default;
    PROD + TTY → opt-in via `--console`; no-TTY / piped / CI → plain logs;
    `--no-console` forces plain anywhere. It **tees** — the full
    structured stream still reaches the real handlers; the log pane is a
    view, never a sink.
  - **Keys:** `r` / `l` / `j` expand a pane to full height (+ filter),
    `esc` home, `p` pause repaint, `q` quit + restore.
  - **Cluster-aware for free:** the console reads `app.cluster ??
    app.metrics`, so a solo node shows its own metrics and any node in a
    cluster (worker or master) shows the **fleet** view — no layout
    change (see Distributed deployment). `app.cluster` is the single
    small core seam.
  - **Built on compat, not from scratch:** `isTTY`, `consoleSize` (polled
    per frame → resize handled, no SIGWINCH), the cross-runtime
    `WritableLike` stdout, raw-mode stdin, and slogger's `@std/fmt/colors`.
    The three missing primitives — alternate-screen escapes, a keypress
    reader, size-polling — land in `compat/cli` (spinner/progress gain
    them too).
  - **Still open (5 build calls):** core vs CLI home · latency
    avg/min/max now vs percentiles in compat first · the request-stream
    hook (in-core ring buffer) · repaint cadence (hybrid ~250ms + event
    append) · zero-dep renderer on compat.
    In DEVELOPMENT it also WATCHES the modules folder and regenerates the
    `modules/mod.ts` barrel on change (the CLI `modules` generator, wired to
    a watcher), so "drop a file in `modules/`" stays live without a runtime
    directory walker.
- **Metrics collection.** First-class request/invocation metrics
  (counts, latency histograms, in-flight, status classes) per transport.
  WIRE, don't reinvent: compat's `WebServer` already tracks
  `requests.active/total/peakActive` and `metro-man` owns metrics — this
  is a clean rapid surface over the existing counters, ambient-correlated
  like logs/traces, and the live feed the dashboard renders.
- ✅ **WebSocket pub/sub — server-initiated push. DONE 2026-08-22.**
  `app.channel(name, { authorize?, onSubscribe?, onUnsubscribe? })` declares
  a channel clients subscribe to over the same `/ws` socket; `app.publish
  (channel, data)` / `ctx.publish(...)` push to subscribers (cross-process
  when an rpc `PubSubAdapter` is configured). A channel alone mounts the
  socket listener even with no `socket()` commands. Wired straight onto
  `@tundralibs/rpc`'s `channel`/`publish`/adapter (rapid adapts the hooks to
  its `SOCKETConnection`); `authorize` gates subscription. The fan-out
  primitive the cluster manager needs, and any "new comment" broadcast.
- **DI capability — `label` + `stock` in doctor. LOCKED, IN PROGRESS**
  (branch `feat/doctor-stock-labels`, own worktree — one package per
  branch). Register ready-made VALUES under typed labels with no
  `declare module` augmentation: `const Db = label<BlogDb>('Db')` →
  `Doctor.stock(Db, norm.use(BlogSchema))` → `inject(Db)` (typed). Value
  form = implicitly SINGLETON; factory form `stock(L, { mode, factory })`
  gets all three modes via the existing engine (SCOPED = explicit scope
  name + `discharge`, NOT an ambient per-request scope; async factories
  unsupported by design — await, then stock). Also `inject(Class)`,
  `Doctor.has()`, `revoke(label)`, a duplicate-name guard. Compose
  `norm.use(schema)` ONCE at boot and stock the handle (no per-module
  `use()` recompiles). Labels are the primitive; a central registry is a
  userland pattern over them.
- ✅ **Standard base module + `initModules` + `app.modules()` — DONE
  2026-08-21 (greenlit after 3 adversarial reviews + fix pass).** Files:
  `modules/` (RapidModule, ModuleRuntime, initModules, InvokeContext,
  EventContext, reply, events), `decorators/on.ts` + `use.ts` (registry
  side tables), `types/module/*`, subpath `./modules` + root re-exports.
  `RapidModule<E>`: abstract `name`/`namespace`/`events` (`event<T>()`
  markers — renamed from `payload()` to avoid the binder), `protected
  log` = the app logger SCOPED `{ module: 'ns:Name' }`, `config`, typed
  `emit`, guarded `invoke` → `Reply`; three channels (plain call / invoke /
  event); single-ALS invoke spine; correlation inherited from the
  transport request. `app.modules({ modules: [ns], instances? })` = the
  ONE bootstrap on an app: initModules with the app's log/config/mode,
  mounts every decorated instance, `app.moduleRuntime`, disposed by
  `stop()`; once per app. Identity rule: a RapidModule's name/namespace
  are its FIELDS — `@Module({ prefix?, version? })` (new options-only
  form) may add only those; the named form stays for plain classes.
  Decisions: keep doctor dep (single-instance rule); InvokeContext/
  EventContext are module-only types (not in RapidContext); no
  `@Invokable`. The blog example is the showcase (BlogModule base with
  doctor-injected Norm, Posts events, CommentsSocket → `invoke(Posts,
  'get')`, event-only Audit, static barrel). Pending: auth credentials
  slot riding the invoke seed (see Auth below).
- **Testing helper (`@tundralibs/rapid/testing`).** First-class module/
  route testing without a socket or a bound port: register fakes for the
  injected services and drive a module method or a route through the
  invocation cycle directly, asserting on the `RapidContextResponse`.
  Makes the "modules are unit-testable in isolation" story a shipped
  utility instead of hand-rolled per app (the blog example's fake-Norm
  test is the pattern to generalize).
- **OpenAPI documentation — automatic + exposed.** Generate an OpenAPI
  spec straight from the decorator registry and serve it (e.g.
  `/openapi.json` + a docs UI). The raw material already exists: routes/
  methods/versions from the registry, path/query/payload params from the
  binder metadata, and response schemas from `@GET(..., { response })`
  (which already knows `.toOpenAPI()` / `.toJSONSchema()`) — the binders
  were designed as "the OpenAPI raw material." Needs the assembler +
  serving surface, plus a policy for error/response shapes.
- ✅ **Fetch adapter — DONE 2026-08-21.** `Application.fetch(request,
  info?)` serves one `Request` → `Response` with no listener: same
  routes/middleware/context/disclosure as `start()`; `HTTPTransport` split
  into `prepare()` (routes → router, onions composed once, idempotent) +
  `listen()`, with `handle(request, remoteAddress)` public. HTTP only —
  registered socket commands make `fetch()` throw RAPID_CONFIG; jobs are
  not scheduled (Workers Cron Triggers → `triggerJob`); `address`/`port`/
  `metrics` stay unset; `start()` after `fetch()` reuses the prepared
  routes. Unlocks in-process tests without ports, `Deno.serve`/`Bun.serve`
  embedding, and Cloudflare Workers. MEASURED on workerd (wrangler 4.125):
  every rapid subpath loads and the module system runs end-to-end.
  Workers HTTP DONE 2026-08-21 (compat 2.2.0): the upload temp dir is
  skipped on Workers/browser (`isWorkers`/`isBrowser`), a file upload is
  rejected with `RAPID_UPLOADS_UNAVAILABLE` (501) instead of a TypeError,
  and text-only multipart still parses; `serveStatic`/`ctx.serve`/
  FileHandler surface compat's `UnsupportedRuntimeError` directly.
  Verified on real workerd: construct + GET via `app.fetch`, upload → 501.
- **Auth — DECIDED 2026-08-21: no "auth handoff" in rapid core.** Ship a
  first-party `pact`-backed middleware in the catalog, store-injection
  shaped like `rateLimit`: the caller passes the functions that verify a
  token / load a subject / persist a session (rapid never owns the DB
  call), plus bitmask guards (`requirePermission(mask)`) usable in route
  chains and module `@Use`. Authenticated credentials live in a STRICT
  per-invocation slot on the context (set once by the middleware,
  read-only after, `undefined` when anonymous) — NOT `ctx.state`, which
  `stateMode: 'SHARE'` shares across invocations — and the same slot
  rides the module `invoke` seed so module guards read one thing. Design
  details when we build it.

## Post-1.0.0

- **Streaming responses (1.x) — DECIDED 2026-08-21: not a 1.0 item.** A
  stream-body response model would unlock SSE, Range requests, and
  large-file static serving; today `content` is string | Record |
  Uint8Array and `serveStatic` reads whole files into memory. Few
  use cases justify it before 1.0.

- **SDK generator (via RESTler).** Generate a typed client SDK from the
  OpenAPI/decorator metadata, built on `@tundralibs/restler` (the REST
  client base) — one typed method per route, request/response types reused
  from the schemas. One source, two outputs (human docs + machine client).
  Downstream of the OpenAPI item; likely its own tool/package.
- **SSE / streaming responses.** Server-Sent Events and streamed response
  bodies as a first-class response shape — the simpler realtime path
  alongside WebSocket pub/sub; compat's `WebServer` already streams, so
  mostly a response-shape surface.
- **Distributed deployment & management. 🧭 ARCHITECTURE CONVERGED
  2026-08-22 — supersedes the parked peer-mesh / cacher-lease Coordinator.**
  A **master + workers** model, deliberately built as modules, middleware
  and routes — **one small core seam only** (`app.cluster`); everything
  else is app-level.
  - **Roles.** A single, **app-agnostic MASTER** (control-plane — never
    serves external traffic; ships as a generic ready-to-run manager, not
    your app in another mode) and N **WORKERS** (data-plane — the full
    app). Workers dial the master over WS on boot, register, and send
    pings + periodic stat summaries + a sampled log tail. Authed control
    channel (shared secret on the WS upgrade) — required.
  - **Exactly-once cron by elected worker.** The master designates one
    worker as cron-leader (deterministic: lowest instance-ULID; re-elect
    on drop). Leadership is **sticky through a master outage** — the
    designated worker keeps firing if the master is down; the master
    reassigns on return. Enforced by an **`onlyIfCronLeader()` job
    middleware** reusing rapid's skipped-by-middleware outcome: every
    worker schedules the same cron, only the leader's fires execute. No
    core change; the master never needs the business routes or job
    definitions.
  - **Telemetry gateway (opt-in per stream).** Workers stream logs (and
    optionally metrics/traces) over WS; the master consumes → transforms
    (filter / sample / **redact secrets+PII** / dedup / enrich with fleet
    context) → fans out to pluggable sinks configured once on the master
    (store-injection shape). **Must be async, buffered, drop-safe, with
    worker-side replay-on-reconnect — never in the request path.** A
    master or sink outage never blocks or (within buffer bounds) loses
    traffic; you lose forwarding + the view until it returns. Defaults per
    stream: logs → gateway; metrics → gateway-aggregate (one fleet
    `/metrics`) or direct scrape; traces → direct to the OTLP collector;
    coordination (membership / cron / snapshot) → always the master.
    **Principle:** the master may relay _telemetry_ as an opt-in gateway,
    but never the _request_ path, and the relay is buffered + drop-safe.
  - **Fleet view.** The master collates a `ClusterSnapshot { seq, at,
    leader, members: InstanceInfo[] }` from worker pushes (disregarding
    its own stats) and broadcasts it back, so any node holds the cluster
    picture. The dev console reads `app.cluster` → master and workers on a
    TTY show the **fleet**; solo shows itself.
  - **The one core seam — ✅ SHIPPED 2026-08-22.** `app.instanceId` (ULID
    minted at boot) and a nullable `app.cluster` slot (`setCluster()` for
    the module to fill, `cluster` getter the console reads) are in now,
    forward-compatible; the master/worker modules + gateway are the
    post-1.0 build.
  - **Capability map (survey 2026-08-22 — most of it composes).**
    `@tundralibs/rpc` already supplies the whole worker↔manager channel —
    `Server`/`Client`, `channel` + `publish` fan-out, `connections` (live
    fleet), the `upgrade` auth hook, auto-reconnect — and because the
    master IS the coordinator we skip leader-election / atomic-lease /
    presence entirely (cacher has no `NX`/scan; we don't need it).
    **COMPOSE** = exists today, **BUILD** = new:
    - Channel + auth — **COMPOSE** (rpc `upgrade` + `crypt` HMAC/JWT +
      `pact` bitmask per command).
    - Registration / heartbeat / presence — **COMPOSE** (rpc
      `onOpen`/`onClose`/`connections` + a cronus heartbeat); package it.
    - Cron-leader designation + `onlyIfCronLeader()` middleware +
      `ClusterSnapshot` collation & broadcast — **BUILD** (small; no lease).
    - Telemetry gateway — worker log-tail push = **BUILD** a ~30-line
      `AbstractHandler` → rpc `Client.publish` handler (slogger's
      `HTTPHandler` proves the bounded drop-queue; `MemoryHandler` is the
      local ring); manager ingest → transform (redact/sample/dedup) →
      fan-out = **BUILD** the pipeline, forwarding **COMPOSES**
      (`HTTPHandler`/`TCPHandler`/`restler` as sink functions).
    - Fleet `/metrics` — **BUILD** a small aggregator (`metro-man.collect`
      `('PROMETHEUS')` gives the text; rapid's `metrics` getter is
      serialize-safe). Traces → **direct to the OTLP collector**, never the
      manager (**COMPOSE**, `tracer` OTLP).
    - Control actions (drain / trigger-job / reload-config /
      rotate-leader) + version & drift inventory + health rollup —
      **BUILD** (rpc commands; `cronus.trigger`, rapid `triggerJob` /
      `healthCheck`).
    - Views — `/cluster` JSON + the fleet TUI (the frozen console reading
      `app.cluster`) + a minimal web UI (`serveStatic` / `ctx.html` + the
      Simple UI module) — **BUILD** (assembly, no new framework).
  - **Forward capabilities (later):** drain-aware rolling deploys,
    fleet-wide cron pause / remote trigger, config & feature-flag
    broadcast, alerting webhooks (dedup + fleet context + `restler`), a TUI
    `reqId` → trace jump (ids already flow via `ambient` / `tracer`), and —
    out of scope now — multi-manager HA via rpc's Redis `PubSubAdapter`.
  - **Net new build surface (everything else composes):** the two core
    seams (`app.instanceId`, `app.cluster`), the WS log-tail handler + the
    manager pipeline, a `/metrics` aggregator, designation +
    `onlyIfCronLeader`, and the views.
  - **Rejected:** worker-side leader election / peer mesh, cacher-lease,
    lockfile / unix-socket coordination — the static master removes the
    need. Route sharing stays out of scope.
- **Simple UI module.** A deliberately MINIMAL client-side UI helper,
  served from the static layer — enough to make AJAX calls and wire basic
  interactions. NOT a React/Vite-class framework: no reactive state, no
  build step, no component model.

## Parked

- Browser as a rAPId LISTENER surface — permanently out of scope (no
  server socket). (Distinct from the post-1.0 "Simple UI module", which
  SERVES a UI to browsers.) Cloudflare Workers is a best-effort HTTP-only
  target via `app.fetch()` (see "Fetch adapter" under 1.0.0): no
  filesystem, no socket commands, jobs through Cron Triggers.
