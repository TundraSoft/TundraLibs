# rAPId — Design record

**Status: as built, 2026-09-08.** This is the one design document for the
package. It consolidates the earlier records (core design 2026-08-10, modules
round 2026-08-14, UI rounds 2026-08-23 to 2026-09-06, auth design 2026-08-26
to 2026-09-08) into a description of what rapid is, why each part is shaped
the way it is, and which alternatives were considered and rejected so they
are not re-proposed. It is publish-excluded: consumer-facing behaviour lives
in [README.md](./README.md) and [docs/](./docs/); the backlog lives in
[ROADMAP.md](./ROADMAP.md). Where this file and the code disagree, the code
is right and this file is stale — fix it.

Contents: [Problem](#1-the-problem-and-the-stance) · [Placement](#2-placement)
· [Ontology](#3-ontology) · [Invocation cycle](#4-the-invocation-cycle) ·
[Routing, versioning, surfaces](#5-routing-versioning-and-surfaces) ·
[Middleware](#6-middleware) · [Context and response](#7-context-and-response) ·
[Errors](#8-errors-and-disclosure) · [Decorators and modules](#9-decorators-binders-and-modules)
· [Dependency injection](#10-dependency-injection) · [Auth](#11-authentication-and-authorization)
· [UI layer](#12-the-ui-layer) · [Configuration](#13-configuration-doctrine) ·
[Observability](#14-observability) · [Testing](#15-testing-doctrine) ·
[Rejected](#16-rejected-alternatives-and-non-goals)

---

## 1. The problem and the stance

Micro-frameworks (Express, Koa, Hono, Fastify) have no opinion about program
shape, and past roughly ten modules three things rot: route management
(`app.use()` sprawl, no single place to see the API, versioning by path
duplication), service management (module-scope singletons constructed at
import time, cycles, home-made service locators) and data-access management
(pool ownership never settled). The framework with the right target, NestJS,
buys its organisation with reflect-metadata, an everything-is-a-class
ontology and a heavy abstraction tax.

rapid's niche is **organisational opinions at scale without the metadata
machinery**, built by composing the suite it lives in: radrouter (routing),
guardian (validation), doctor (DI), slogger/tracer/ambient (observability),
pact (auth), norm (data), rpc (websockets), cronus (jobs), compat (runtime
portability).

The stance that follows from it, and that every later decision honours:

- **rapid is a transport adapter, not an application framework.** It binds
  handlers to HTTP requests, socket frames and job firings and runs them
  through one cycle. How the app constructs its objects, talks between
  modules or owns its database is the app's business (with a blessed module
  tier and DI container available, never required).
- **Explicit composition, never discovery.** No filesystem scanning, no
  import-time registration. What you hand the app is what it serves; two
  apps in one process never see each other's routes.
- **Loud at boot, never silent at 3 am.** Every configuration error, route
  collision, bad option or unsupported combination throws `RAPID_CONFIG`
  before the first request.
- **Cross-runtime is a contract, not an aspiration.** Deno, Bun, Node,
  Cloudflare Workers and the browser all load the package; a capability a
  target lacks degrades with a typed error, never a crash.

## 2. Placement

rapid lives in the TundraLibs monorepo as the integrator keystone and is
designed for extraction: nothing in the suite imports it (a leaf in the
dependency graph), it reaches siblings only through their public seams, and
its docs are self-contained under `packages/rapid/`. One package with
subpaths (`./context`, `./decorators`, `./endpoints`, `./errors`,
`./middlewares`, `./middlewares/pact`, `./modules`, `./testing`, `./types`,
`./ui`, `./cli`). The name is rAPId (Rapid API Development); the package is
lowercase `rapid`.

## 3. Ontology

- An **Application** is created once by `Application.initialize(source)`,
  from plain options or a config directory. The constructor is private and
  brand-gated so an app can never skip validation.
- A **transport** delivers invocations: HTTP (requests, plus static files
  and the UI runtime), SOCKET (websocket command frames over the same
  listener, composed on `@tundralibs/rpc`), JOB (cron firings, composed on
  `@tundralibs/cronus`). Transports are adapters: the same app serves from a
  listener (`start()`) or a fetch handler (`fetch()`, Workers).
- An **invocation** is one handler run: a request, a frame, a firing. Every
  invocation gets a **context** (`HTTPContext`, `SOCKETContext`,
  `JOBContext`) over one abstract `Context` with a uniform surface (`type`,
  `requestId`, `action`, `args`, `state`, `auth`, `response`, `respond()`).
- A **handler** is `(ctx) => reply | Promise<reply>` where the reply is the
  closed envelope `{ content, status?, headers?, cookies?, redirect? }`.
  Registered Oak-style (`app.get()`, `app.socket()`, `app.job()`) or as a
  decorated method on a class (`@GET`, `@SOCKET`, `@JOB`) — both funnel into
  the same registration core.
- **Middleware** is `(ctx, next)` and universal: one onion runs on every
  transport's invocation. Transport-specific behaviour is a scope helper or
  a `ctx.type` branch, never a second pipeline.
- A **module** is a class whose decorated methods are handlers. The richer
  `RapidModule` tier adds identity, declared events, a scoped logger,
  `emit`/`invoke`, and a lifecycle, hosted by a `ModuleRuntime`.

## 4. The invocation cycle

One spine, `Transport._invoke`, shared by all three transports:

1. **Resolve** (HTTP only): trailing slash normalised → api prefix stripped
   and the surface decided → path-mode version stripped → route matched.
   Hidden routes (pages on the api surface) are true no-matches before any
   chain is chosen.
2. **Context** built with the correlation id: a safe inbound
   `headers.requestId` value is adopted, otherwise
   `Application.requestIdGenerator()` mints one.
3. **Ambient scope** opened (`@tundralibs/ambient`) carrying `requestId`,
   the app container and, for modules, the invoke frame — so `app.log`,
   `inject()` and nested `invoke()` all see the right request without any
   threading. **Tracer span** opened when a tracer is configured; nothing is
   paid when it is not.
4. **The onion**: the universal chain (`app.use`) then the route/command
   chain, each composed once at registration, then the handler. A **sync
   fast path** keeps a zero-middleware, synchronous handler promise-free.
5. **Represent** (HTTP, templated routes only): the reply's `content` is
   rendered to HTML when the request is a swap or the route prefers a page;
   JSON passes through unchanged. Runs at the innermost point so every
   middleware's post-`next()` view sees the final body.
6. **Disclosure** for anything thrown: `RapidError.from()` classifies, the
   transport logs (5xx at `error` with stack and `debug`, 4xx at `debug`),
   `app.onError` may override, `payload(mode)` shapes the body.
7. **Finalize**: HTTP materialises the `Response` (`respond()` is the point
   of no return), stamps the request id, echo headers and `x-response-time`;
   SOCKET returns the frame envelope; JOB returns the outcome.
8. **Access line** written after finalize (`logger.access`), so it reports
   the status actually sent.

What is **core, not middleware**, and why: the correlation id, response-time
header and access log (every deployment wants them and they must be present
on the error path); static file serving (`server.static`, served on route
miss so routes always win and every middleware applies); the api surface
(routing, must survive `ui.enabled: false`); body limits, uploads, query caps
and paging (security posture belongs in one validated config, not in an
optional layer). Middleware handles what core won't.

## 5. Routing, versioning and surfaces

- **radrouter-native paths**: params are colon-wrapped (`/users/:id:`).
  Route registration is explicit; collisions and grammar errors surface at
  `start()` / first `fetch()`.
- **Versioning is a dimension, not a path.** radrouter keeps a version slot
  per route; `server.versioning.mode` decides where a request declares its
  version (`header`, `accept` vendor tag, or a leading `path` segment that is
  stripped so the router, static files and OpenAPI all see the clean path).
  `@Module({ version })` sets a default, `@GET(path, { version })` overrides,
  neither set means the unversioned slot. Purely additive.
- **A request has a surface** (`ui` or `api`), decided once before routing
  from `server.api: { hosts?, prefix?, trustForwardedHost? }` and
  `ui.enabled`. The api surface is _a smaller route table with no
  representer_: pages, `server.static` and the UI runtime routes do not exist
  there (404, filtered from `405`/`Allow`), so `Host` spoofing is inert and
  route-scoped auth never answers 401 for a URL the surface says is 404.
  `ui.enabled: false` means every request is `api`. Redirects are never
  rewritten (`ctx.href()` is the explicit opt-in); a path-shaped redirect that
  would resolve to another origin is refused on both the navigation and the
  swap path.
  _Rejected for the same need_: mount-time prefixes, mount groups,
  per-replica module selection, a `host` constraint in radrouter (each splits
  the app by declaration against the one-route-two-faces thesis), a `strict`
  ui mode, `Vary: Host`, auto-generated OpenAPI `servers`, a ui-origin for
  cross-surface redirects, module-level `prefer`.

## 6. Middleware

**Shape.** `(ctx, next) => void | Promise<void>` — Koa's onion, the suite's
shape in rpc too. Middleware receives the full transport context and may:
short-circuit (set `ctx.response`, do not call `next()`); enrich
(`ctx.state`, headers set before `next()`); post-process (after `await
next()`, read or replace `ctx.response`); or throw a `RapidError`, which
flows to disclosure. `next()` must be called at most once and its promise
returned or awaited: a second call is a 500, an abandoned promise is logged
because a handler rejection after the middleware returned would otherwise be
an unhandled rejection.

**Three registration points, no more.** `app.use()` (universal — every
transport), route/command-scoped (inline before the handler on a plain
route; the `middleware` option on `@GET`/`@SOCKET` and, for a whole class,
on `@Module` — the decorator records the same chain the plain call takes,
module entries first), and `@Use` on a `RapidModule` method, which guards
module-to-module `invoke()` **only** — never a transport request. Within a
level, order is registration order; there are no priority numbers (priority
integers turn ordering into archaeology). Jobs have no per-registration
chain by design — a scheduler firing has no caller to guard against;
`onlyJOB` scopes the universal chain.

**Universal by default, scoped by wrapper.** `onlyHTTP` / `onlySOCKET` /
`onlyJOB` skip other transports; `guardHTTP` / `guardSOCKET` / `guardJOB`
reject them with 403 (fail-closed, for auth-class middleware that must never
be silently bypassed); `onlyApi` / `onlyUi` gate by HTTP surface and **run**
off-HTTP (`onlyApi(authenticate)` must never unguard a socket frame). A job
skipped by middleware is a distinct, logged outcome (`handlerRan: false`),
not a silent success. Scope metadata (`MIDDLEWARE_SCOPE`) is informational;
the framework attaches no behaviour to it — an earlier boot diagnostic built
on it was removed as noise.

**Factories, not DI.** Middleware are plain functions produced at the
composition root (`rateLimit({ max: 100 })`); closures do the wiring. Every
factory validates its options when called and throws `RAPID_CONFIG` — a bad
option never waits for the first request.

**Units and names.** All durations are seconds (fractions where a sub-second
value makes sense). Every non-standard header name is an option, so a client
integrating with a different name never needs a fork. Middleware options
that are data live in `Application.yaml` grouped by **structure** — one
`headers:` block, `logger.access`, `server.metrics` families — rather than
per middleware, so swapping a built-in for a custom middleware keeps the same
config; code-valued seams (stores, hooks, verify functions) stay programmatic.
An explicit factory option wins over the shared key.

**State is hooks, not a store.** Stateful middleware (`session`, `rateLimit`,
`idempotency`) take a small object of purpose-named hooks the app implements
over redis, cacher or anything else (`getSession`/`saveSession`/
`deleteSession`/`touchSession`; an atomic `increment`; a set-if-absent
`claim`), the same seam shape pact uses. A generic `Store<V>` interface was
built first and removed: it hid the one property each middleware actually
needs (atomicity for the counter, set-if-absent for the claim, touch for the
rolling session) behind get/set, and forced every backend to reimplement the
middleware's semantics. Each middleware ships a bounded in-memory default so
zero configuration works on one replica.

**Per-invocation state under `SHARE`.** `stateMode: 'SHARE'` hands every
invocation the same `ctx.state` object. A middleware that writes
per-invocation values there declares it with `markStateKeyUser()`, and the
boot refuses that combination — corruption under concurrency is not a
warning.

**Retired**: the generic `auth.ts` (`authenticate({ verify })` /
`authorize(check)` — the seam is `ctx.setAuth` itself, the helpers were ten
lines and their names collided with the pact factory's), `requestId`,
`responseTimer`, `requestLogger` (core config now), `serveStatic` (config),
`store.ts` (hooks), `healthCheck()` (a path-intercepting middleware that
bypassed the router, OpenAPI, surfaces and the 405 walk — `endpoints/health()`
is an ordinary route and the one shape).

## 7. Context and response

- **One closed reply type** across transports: `{ content: string | object
  | Uint8Array | stream; status?; headers?; cookies?; redirect? }` with no
  index signature (a typo'd key is a compile error). Each context
  _interprets_ it in its `response` setter: HTTP consumes everything; JOB
  reads `status` as the outcome; SOCKET takes content and status and rejects
  a 3xx or a stream at set time (it would otherwise launder into an ok
  envelope). Generic middleware therefore writes one literal on any context.
- **Setter semantics** are what make post-processing safe: `status` is
  preserved across a body-only override (a transform never resets a 500 to
  200), `headers` merge per key (an override never wipes middleware
  contributions), `set-cookie` appends. `respond()` freezes the context;
  every mutation after it throws `RAPID_RESPONSE_INVALID`.
- **Streams are first-class** (`ReadableStream` or any async iterable),
  never buffered; a replaced stream is cancelled so its handle does not
  leak. Body-inspecting middleware skip them by design.
- **Body reading is lazy and order-independent.** `ctx.payload` parses once
  and caches the promise; `ctx.rawPayload` is the same bytes (the parser
  always runs over them) so digests and decryption never depend on
  registration order; `ctx.files` lists upload temp paths, removed after the
  response. Uploads are hardened in one place (size caps, extension
  allow-list that is empty by default, magic-byte check, ULID disk names,
  unconditional cleanup).
- **`ctx.args` is uniform**: `params` (route params / frame payload / job
  args), `query` (parsed `$op` filters and sorts under DoS caps, lazily, HTTP
  only), `paging` (clamped, never throws). Headers are envelope, never args.
- **State** is built per invocation from `app.state` by `stateMode`:
  `CLONE` (deep copy, unclonable values kept by reference rather than
  dropped), `PROTOTYPE` (writes shadow), `SHARE` (one object). Typed once by
  the app.
- **`ctx.auth`** is a write-once bag set by whatever authenticates; it is
  per-invocation, never shared through state, and it rides the module
  `invoke()` seed so guards inside a module see the caller's identity.
- **No logger on the context.** slogger's context provider plus ambient
  already correlate every line; `app.log` / a module's `this.log` are the
  loggers. `ctx.publish()` lives on the base so an HTTP handler or a job can
  push to socket subscribers. `ctx.detach()` registers abandoned work the job
  transport must wait for (so cronus's overlap guard stays held).

## 8. Errors and disclosure

- Every failure is a `RapidError` with a registered code, a status and one
  disclosure rule; the registry is `as const` so the code union is derived.
  The `RAPID_` prefix is reserved. Codes name conditions
  (`RAPID_VALIDATION_FAILED`), not `_ERROR` suffixes.
- Two data channels with different disclosure classes: `details`
  (client-safe, rendered) and `debug` (DEVELOPMENT only, always logged).
  4xx `message` and `details` are public in PRODUCTION by design (they
  describe the client's own request); every 500 collapses to `Internal
  server error` and other 5xx to their registry default.
- `RapidError.from()` classifies foreign throws: a guardian failure is
  recognised structurally (no import) and becomes a 400 with per-field
  messages; anything else is an opaque 500 with the original in `debug` and
  `cause`. `validated()` opts any other validator into the 400 path. The
  asymmetry (guardian first-class, everything else explicit) is deliberate.
- Realm-safe normalisation duck-types on `context.code`; `instanceof` proved
  unreliable across re-imports in both prior implementations.
- The same envelope goes out on every transport (JSON, socket error frame,
  job outcome) and, on the ui surface, as an HTML error page through a
  closed template registry. Codes flagged `specific` (the idempotency trio)
  are never derived from a bare status, so a handler's own 422 is not
  mislabelled.

## 9. Decorators, binders and modules

- **TC39 standard decorators only.** No `experimentalDecorators`, no
  `emitDecoratorMetadata`, no reflect-metadata, no parameter decorators
  (they cannot see or constrain the parameter type, so schema and
  annotation drift). Decorators are metadata-only: they never wrap the
  method, so `new Users().find('7')` runs in a unit test with no app.
- **Bindings live in the method decorator as a tuple** (`bind: [param('id'),
  payload(Schema)]`); the tuple types the method signature. Without a
  validator `param` is `string` and `payload` is `unknown` — a type is earned
  through a validator, never asserted. A schema object bound with
  `payload()` both validates and documents the body; only the body documents
  (context-derived binders are not part of the request contract).
- **The registry is per class, keyed by method name**, in the class's own
  `Symbol.metadata` object (polyfilled idempotently at load). Name keying
  removed the wrapping-decorator stacking footgun; per-class buckets keep a
  subclass from mutating its parent's records; a subclass that overrides a
  decorated method must re-decorate or mounting fails loudly (a route bound
  to a method the instance no longer runs is the silent-loss family).
- **Discovery is what the caller hands over.** `app.module(instance)` binds
  instances you built; `app.modules({ modules: [namespace] })` enumerates the
  exports of an `import()` namespace (a second `import()` is a cache hit, so
  a second app can mount the same file — the property a side-effect registry
  can never have). No global list, no retention, no leakage.
- **The `RapidModule` tier** adds `name`/`namespace` identity, declared
  `events` (validated at mount; a subscription to an undeclared event fails
  `finalize()` before anything is wired), `emit` (subscriber isolation; a
  throwing subscriber is logged with its own message and never touches the
  emitter), `invoke` (module-to-module, through the cycle, with a copy of the
  caller's state and its auth; the target's `@Use` guards run; a denial is a
  403 envelope, not a throw), `init`/`dispose` hooks (mount order / reverse),
  and `this.log`/`this.config`. `reply(status, content)` is the explicit
  envelope; a domain object with a `content` key stays content — the runtime
  never guesses.
- **Prefix and namespace** are different joins on purpose: `prefix` joins
  HTTP paths; `namespace` dots onto flat socket command and job names.
- **Route middleware is a decorator option, not a decorator.** `@GET(path,
  { middleware })` / `@SOCKET(command, { middleware })` / `@Module(name, {
  middleware })` are recorded as data and handed to the same `route()` /
  `socket()` call a plain registration makes, so the entries, the
  SHARE-mode boot check and OpenAPI see one shape. Entries are validated at
  decoration time (a factory not called fails at import). A `@Guard`-style
  method decorator was rejected: it would look like `@Use`, which runs on
  `invoke()` only, and stacking order would start to matter again.
- **Delivery semantics** are in-process and at-most-once by design; the bus
  is a seam for a durable sibling later. Synchronous cross-module reads are a
  boundary smell first and `invoke()` second.

## 10. Dependency injection

Each app owns `app.container`, a child of the global doctor: it reads global
registrations but holds its own instances, so two apps never share module
instances and a test can `stock()` a fake into one app. The container is
pinned on the ambient bag per invocation, so `inject()` resolves against the
right app even after an `await`. `app.modules()` constructs zero-argument
`RapidModule` classes (or dispenses ones doctor knows); anything with
constructor arguments is handed over as an instance. Modules are singletons;
per-request facts arrive on the context or as bound arguments, never as
request-scoped providers.

## 11. Authentication and authorization

**Two layers, deliberately separated.**

1. **The generic seam, in core and auth-agnostic**: `ctx.auth` /
   `ctx.setAuth(identity)`, a write-once bag. Any identity system is a
   middleware that verifies its credential and sets the bag. The pact adapter fills the same bag, so an app can mix systems. Session
   endpoints are the adapter's, not `endpoints/`: pact already owns `login` /
   `logout` / `refresh`, and hanging the HTTP wrapping off `pactAuth` means
   the cookie `login` sets is the one `authenticate` reads, declared once (a
   pact-free `endpoints/login.ts` was tried and removed for repeating the
   name in two places).
2. **The pact adapter** (`middlewares/pact.ts`, its own subpath so the
   middleware barrel stays pact-free): `pactAuth(pact, options) →
   { authenticate, authorize, login, logout, refresh, me }`, glue over pact 0.8's neutral
   `createPactMiddleware` core exactly like pact's own express/hono/oak
   adapters. rapid keeps only what pact leaves to the framework: the bearer
   cookie carrier, sockets authenticating from the upgrade request, jobs
   passing through, rapid's error codes, `ctx.rawPayload` for the body
   digest, `_replacePayload` for a decrypted body, sealing the response
   after `next()`. The wire contract (carriers, the RFC 9421 template with
   frozen keys, timestamp freshness, response signing, JWE payloads) is
   pact's and documented there.

Decisions: absent credential → anonymous (`optional: false` → 401);
present-but-invalid → 401, never anonymous; one `WWW-Authenticate` challenge
listing what `authenticate` accepts; no pact reason code on the wire (an
account oracle) — the reason is logged; `authorize(module, permission)` is
typed by the instance's catalog and checked when called, so a typo fails at
import, not on the first request; `authorize` fails closed on jobs (no
identity there); a stale bearer COOKIE is cleared and treated as anonymous
(a browser keeps sending it, and a 401 would lock the user out of `/login`),
while a failing header credential stays a 401. Storage is pact's hooks over
the app's data layer (norm);
caching the principal belongs in the app's `getUser` hook, never in the
middleware, because that would bypass pact's revocation checks.

_Rejected_: registering pact on the app or via a doctor label resolved at
factory time (a decorator-level `authorize` evaluates at import, before any
`main.ts` could stock one); a `pact(options)` initialiser that owned the
instance; per-scheme middlewares (`bearerAuth()`, `hmacAuth()`); a public
`can()` helper; caching the principal in rapid; `app.provide/get` sugar.

## 12. The UI layer

The idea: a route names a **template**; the handler keeps returning
JSON-shaped data. Two deterministic signals pick the representation and
`Accept` is never consulted: a swap header (`rapid-swap`, sent by the
bundled runtime) always gets the **fragment**; otherwise the route's
`prefer` picks **JSON** (default) or the layout-wrapped **page**. Same
route, same handler, same data — two representations.

Decisions that define it:

- **Templates are pure functions** wrapped by `template()`;
  `` html`…` `` escapes every interpolation, `raw()` is the single audit
  point, `Html` is branded by a private symbol so JSON can never impersonate
  trusted markup. Synchronous only; a template that needs to await is a
  handler that returned too little.
- **Three layout tiers, fixed nesting**: an irreplaceable app `core` (the
  document), a swappable module/route `layout` (route → `@Module` → app
  default; `false` opts out), and the content fragment composed from plain
  functions. `title` flows to both wrappers, `meta` to the core. No deeper
  mechanism exists or will.
- **The `view` bag exposes nothing from `ctx.auth`** by default; identity
  reaches templates only through an app projection naming the fields. Safe
  by construction rather than by discipline.
- **Configuration is split by nature**: the serialisable data half
  (`enabled`, `prefer`, `runtimePath`, `live`, `history`, header and cookie
  names) is YAML-able per replica; the code half (`core`, `layout`, `view`,
  error templates, `assets`) is programmatic. Config names code, never
  imports it (no import paths in YAML, no views-folder scanning: it breaks
  `deno compile` and Workers bundling and forfeits type safety).
- **Error pages are a closed registry** (exact status → `4xx`/`5xx` →
  `default` → the built-in page) rendered inside the core only, under the
  same disclosure rules as JSON. Recoverable form errors are the form's own
  200-state, never an error page.
- **The runtime is small and frozen**: `data-action` / `data-method` /
  `data-target` / `data-swap` / `data-load` / `data-push`, no inline
  handlers (`script-src 'self'` suffices), same-origin only, CSRF cookie
  echoed, View Transitions when available, `rapid.swap()` / `rapid.refresh()`
  as the two programmatic hooks, events (`rapid:swapped`, `rapid:error`,
  `rapid:push`) for everything else. The live bridge and the history module
  are opt-in scripts; the history module keeps no DOM cache (back re-fetches)
  — the moment one is proposed the module has failed.
- **Static files are config** (`server.static`, served on route miss) and
  `view.asset()` fingerprints lazily under a `fingerprint: true` mount; the
  `immutable` stamp lives only with the minting/serving pair.
- **A redirect on a swap** becomes `200` + `rapid-redirect` (fetch would
  follow a 3xx and hand the runtime the target's body); the header's target
  is guarded server-side and followed same-origin only.
- **The API reference is a page of the app** (`endpoints/docs()`), not a
  CDN viewer bolted on: the OpenAPI document is rendered server-side with
  rapid's own templates inside the configured core/layout, from exported
  parts (`DocsAuth` / `DocsReference` / `DocsOperation` / `DocsSchemas`) so
  the two customization paths are the UI layer's own — branding through the
  tiers, composition through `render`. Its one script is rapid-served like
  the runtime (`script-src 'self'`), keeps credentials in session storage
  and applies them per declared scheme. Security schemes are DECLARED by the
  app with the precise OpenAPI shapes and validated at mount; nothing is
  inferred from middleware (a guard is behaviour, a requirement is
  documentation — a gateway-authenticated API documents a scheme rapid never
  sees). Scalar / Redoc / Swagger UI remain available as pinned, SRI-checked
  shells around the same document.

_Rejected / non-goals_: a template language or `.html` files; a curated CSS
framework API; SPA history with a DOM cache; async or streaming templates
(slow data is a lazy region); attribute growth beyond the frozen set;
section-level error templates.

## 13. Configuration doctrine

- `initialize()` takes plain options or a directory; the `Application` set
  becomes the options, every other set stays readable as `app.config` /
  `ctx.config` / a module's `this.config` / the `config()` binder. Set names
  are lowercased file basenames; keys are case-sensitive.
- **Every value validated at boot**, with the offending key in the error.
  Durations in seconds, sizes in bytes, header names as RFC 9110 tokens,
  origins serialized.
- `${VAR}` placeholders resolve from `.env`; an unset placeholder stays
  literal text (so a commented `secret: ${APP_SECRET}` is the safe default in
  the scaffold).
- `mode` defaults to PRODUCTION: the safe posture is the default.
- The scaffold's `Application.yaml` annotates every key with what reads it
  and is drift-guarded by a test against the framework's own defaults;
  [docs/Rapid-Configuration.md](./docs/Rapid-Configuration.md) is the
  reference.

## 14. Observability

Inherited wholesale from the suite: slogger is always on with the request id
composed through ambient's context provider; tracer is opt-in (a span per
invocation around the onion, inbound `traceparent` honoured, trace ids on
log lines); metrics are opt-in (`server.metrics` → `app.meter`, a metro-man
registry served by the `metrics()` endpoint — metro-man ships no scrape
endpoint by design, so that route is rapid's). The meter records seven
switchable families (invocation cycle, error codes, jobs, sockets,
middleware decisions, bodies, ui); a family that is off declares no series
and its recorder is one boolean check, and with metrics off no meter exists.
The latency histogram shares the arrival clock with `x-response-time` and
the access line. The correlation id is minted by a process-wide,
replaceable generator (a monotonic `sequenceID` by default — a correlation id
never needed a CSPRNG). The access line is core config, level by outcome, and
never carries client identifiers unless opted in.

## 15. Testing doctrine

`client(app)` drives routes through `app.fetch` with no port; `harness()`
boots the module system with stubs stocked into a fresh child container;
`view()` builds a frozen view bag for template tests. A test must be able to
fail: no assertion of what the type checker already proves. Everything runs
on Deno, Bun and Node in CI; runtime-divergent behaviour is pinned per lane.
The client runtime scripts are pinned by source-string invariants (no DOM
runner in the suite) plus the examples for manual verification — stated as
the honest limit.

## 16. Rejected alternatives and non-goals

Collected here so they are not re-proposed:

- Filesystem or glob module discovery (permanently out); import-time
  registration; a global route registry.
- Parameter decorators; `emitDecoratorMetadata`; reflect-metadata.
- Priority numbers for middleware ordering; a second pipeline per transport;
  request-scoped DI providers.
- A generic `Store<V>` seam for stateful middleware (hooks instead).
- `Accept`-driven representation for templated routes; module-level
  `prefer`; a `strict` ui mode; mount-time prefixes and mount groups;
  per-replica module selection; `Vary: Host`.
- Registering pact on the app; doctor-label resolution at decorator time;
  per-scheme auth middlewares; caching principals in rapid.
- A template language; `.html` template files; curated CSS-framework API;
  SPA history with a DOM cache; async templates.
- Auto-rewriting redirects onto the api prefix.
- Durable or distributed events inside rapid (a sibling's job behind the
  seam); cursor paging in v1; a "secure data" context bag.
