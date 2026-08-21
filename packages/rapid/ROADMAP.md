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
- **Live dev dashboard (TUI).** When the app runs directly in
  `DEVELOPMENT`, replace the plain log spew with a live terminal
  dashboard: an ASCII rAPId banner; a header strip (host:port, total
  routes, total crons, total open socket connections); a live metrics
  strip below it (throughput, latency, in-flight, status classes); a live
  activity window (current/recent API calls with time-taken); and a
  bottom log pane showing only the last ~10–20 lines (a rolling tail, not
  the full stream) so the window stays legible. `PRODUCTION` keeps plain
  structured (JSON-line) logs — no TUI. Consumes the metrics item's live
  feed and the decorator registry for the counts.
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
- **WebSocket pub/sub — server-initiated push.** The SOCKET transport
  wraps `@tundralibs/rpc`'s `Server` but exposes NONE of its pub/sub
  (verified by grep: no publish/subscribe/broadcast/channel surface). A
  module can only reply to the command that invoked it — it cannot push
  to other connected clients. Add an `app.publish()`/`ctx.publish()`
  surface wired to the underlying rpc instance (rpc already has
  publish/subscribe frames + a pluggable `PubSubAdapter` for cross-process
  fan-out). Needed for any server-initiated broadcast (e.g. a "new
  comment" fan-out to subscribers).
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
- **Standard base module + `initModules`. LOCKED, BUILDING (rapid).**
  - `RapidModule` — opt-in abstract base exposing `protected log`
    (the Application's Slogger: request-correlated inside a rapid
    invocation via ambient, plain outside) and `protected config`. State
    lives in a rapid-side **WeakMap side table** (like the decoration
    registry) — nothing stored on the instance, and NO `app` handle
    (modules must not reach the framework's control surface). Not
    attached → throw `RAPID_CONFIG`; **never a silent fallback logger**
    (it would be a second, divergent logging config). Apps extend it with
    their own deps: `abstract class BaseModule extends RapidModule {
    protected db = inject(Db) }`.
  - `initModules(context, { modules: [ns | instance] })` — the ONE
    bootstrap; `app.modules(...)` calls it then mounts; `app.module(
    ...instances)` stays as the sync typed path. `context` is either a
    ready `{ config, log }` or plain application options, in which case
    rapid builds config + the Slogger through the SAME builder
    `Application`'s constructor uses (factored, not duplicated) — full
    parity for standalone/test initialization. Sources are STATIC
    NAMESPACES (the `modules/mod.ts` barrel) or instances — no runtime
    path walking (that's the CLI generator), so it is identical on
    Workers. Scans exports for decorated classes, skips abstract/
    undecorated ones, **constructs with zero args** (the one amendment to
    "rapid never calls `new`": zero-arg construction of a discovered
    module class only — anything needing ctor args is passed as an
    instance; `Class.length > 0` → `RAPID_CONFIG`). Returns a record
    keyed by EXPORT name, typed via a mapped type over the namespace
    (abstract + non-zero-arg classes filtered at the type level too), so
    `const { Posts } = await initModules(...)` is fully typed.
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
- **Distributed deployment & management.** Exactly-once / leader-elected
  cron across replicas (`jobs.enabled` is per-replica today, so a job
  fires N× on N replicas), multi-server / cluster coordination (the
  Coordinator seam; peers-WS vs cacher-lease via a `cluster.url` scheme),
  and the fleet-management surface around it. The cross-replica lease is
  the mechanism for exactly-once cron.
- **Simple UI module.** A deliberately MINIMAL client-side UI helper,
  served from the static layer — enough to make AJAX calls and wire basic
  interactions. NOT a React/Vite-class framework: no reactive state, no
  build step, no component model.

## Parked

- Browser as a rAPId LISTENER surface — permanently out of scope (no
  server socket). (Distinct from the post-1.0 "Simple UI module", which
  SERVES a UI to browsers.) Workers support is a preserved option via the
  transport seam, not a target.
