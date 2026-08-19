# rAPId — Design

> **Status: pre-implementation design record.** Locked decisions and their
> reasoning, captured before code exists. Like pact's DESIGN.md before it,
> this document is expected to dissolve into real docs
> (`Rapid-*.md` + README) once the package is built. Open questions are
> listed at the end — nothing below them is settled.

## The problem

Existing frameworks fall apart on **large** applications. Past roughly ten
modules, three things rot in every micro-framework codebase (Express, Koa,
Hono, Fastify):

- **Route management** — the route tree is assembled by convention-free
  `app.use()` sprawl; there is no single place to _see_ the API surface;
  versioning is path-prefix duplication; per-module middleware stacks drift.
- **Service management** — module A's service imports module B's service,
  cycles appear, someone invents a half-baked service locator. Singletons
  are constructed at _import time_, so construction order is load order,
  testing one module boots the world, and multi-instance deployment is
  impossible because state lives in module scope.
- **Data access management** — pool/engine ownership is never settled;
  either every module news up a client (connection explosion) or everyone
  imports a shared `db.ts` singleton (import-time side effects again).

The pain is not missing features — it is that micro-frameworks have **no
opinion about program shape**. The one framework with the right target
(NestJS) buys its organization with decorator/reflect-metadata magic, an
everything-is-a-class ontology, and a heavy abstraction tax.

**rAPId's niche: organizational opinions at scale, without the metadata
machinery** — built by composing the suite it lives in: radrouter (routing),
guardian (validation/types/docs), doctor (DI), slogger/tracer/ambient
(observability), pact (authz), norm (data), rpc (websockets, later).

## Placement

- **In the TundraLibs monorepo** — rAPId is the integrator keystone; its
  early phase co-evolves with sibling seams, and `workspace:*` HEAD deps
  beat cross-repo pin-bump loops. The CI/release/wiki infrastructure is
  already paid for.
- **Designed for extraction**: (1) nothing in the suite ever imports rAPId —
  it is a leaf in the dependency DAG; (2) it reaches siblings only through
  the same generic seams as everyone else — no in-repo back doors; (3) its
  docs stay self-contained under `packages/rapid/`.
- **Extraction triggers** (act only if they materialize): non-JSR artifacts
  (images, CLI, control plane); e2e CI weight taxing sibling PRs (first
  remedy: path-filtered jobs); community/issue divergence; release-cadence
  divergence.
- **One package with subpaths** (suite standard). "Plugins" come later as
  independent packages.
- **Naming (decided)**: the framework is **rAPId** — the acronym is
  _Rapid API Development_ — and the package is lowercase
  `packages/rapid` / `@tundralibs/rapid` per case-sensitivity rules.
  Scaffold note: verify `workspace:add`'s display→kebab conversion
  doesn't mangle the mixed-case display name (rAPId → `r-ap-id` would be
  wrong); the dir/pkg name must come out as plain `rapid`.
- Scope arc: HTTP API first → websockets (composing rpc) → multi-host and
  friends. Multi-host coordination will likely land as a sibling library
  (relay/herald) plus a thin rAPId integration, staying library-shaped.

## Core ontology

> **A module method is a handler with a contract; decorators attach
> triggers and policies to it.**

- A **module** is a plain class. Public methods become handlers.
- A **contract** is what a handler means: validated input shape, declared
  response shape, access requirements. Transport-agnostic.
- A **trigger** is how a handler is reached: `@GET`/`@POST`/… (HTTP),
  `@SCHEDULE` (cron), `@ON` (module events), websockets later. **Triggers
  stack** — one method can be both an HTTP endpoint and a scheduled job.
- A **policy** decorates the pipeline around a handler: `@Access` (pact
  check), `@UseMiddleware` (per-method middleware).

Modules are independent and do not know about each other (see
[Inter-module communication](#inter-module-communication)).

## Decorators

- **TC39 stage-3 decorators** (TS 5 native). No `experimentalDecorators`,
  no `emitDecoratorMetadata`, no reflect-metadata. The suite's scar tissue
  here is documented: doctor's `design:type` metadata cannot be emitted by
  tsx/esbuild, and its decorator tests are gated off on node+tsx to this
  day. rAPId's decorators are **declarative** — they carry their
  configuration explicitly and never infer types from parameters — so none
  of that machinery is needed, and all three runtimes work.
- **No parameter decorators.** They exist only in the deprecated legacy
  flag, the standards track has no accepted path for them, and TS parameter
  decorators structurally cannot participate in type derivation (a
  parameter decorator can neither see nor constrain the parameter's type —
  schema and annotation would drift silently). Bindings live in the method
  decorator instead (see below), where the factory's generics can constrain
  the entire signature.
- **Spec-shift insurance**: decorators are a ~thin sugar layer over an
  imperative registration API, which is the real, stable core. If the
  decorator spec moves between stage 3 and 4, the migration is confined to
  the sugar — and a decorator-free registration path exists for free.
- **Decorators wrap the contract, and only the contract.** The prototype's
  mistake was not wrapping at all — a naked method under test behaves
  differently from production, which makes direct-invocation testing a lie.
  But wrapping _transport_ concerns would force tests to fabricate fake
  requests. Hence the two-layer split below.

## The two-layer pipeline

- **Contract layer — wrapped onto the method** (transport-agnostic, runs on
  every invocation, including direct calls in tests):
  input validation/coercion (guardian), response-shape validation,
  `@Access` (given a principal).
  Wrappers **late-bind app services** (the pact instance, etc.) through the
  instance's injected dependencies — never captured at class-definition
  time, because the composition root does not exist yet.
- **Transport layer — lives in the dispatcher** (per trigger): route
  matching, request parsing, principal extraction, `@UseMiddleware`,
  rate limiting.

Consequence, stated as a feature: direct invocation exercises the contract
(validation, access, response shape) but bypasses transport (middleware,
parsing). Unit tests test handler meaning; the pipeline gets its own
integration harness.

## Handler authoring model

Bindings are a **tuple** in the trigger decorator's options (tuples have
type-level order; records do not — positional enforcement is impossible
from a record spec). A mapped tuple type derives the parameter list, and
the decorator factory constrains the whole method signature — input types
**and** return type — from the declaration:

```typescript
type CreateUser = GuardianInfer<typeof CreateUserSchema>; // the norm pattern

@POST('/users/:id:/orders', {
  bindings: [
    param('id', G.string().uuid()),
    body(CreateUserSchema), // or body('path.to.key', schema) for a sub-key
    paging({ sort: ['createdAt', 'total'] }),
  ],
  response: OrderSchema,
  status: 201, // static envelope — also what OpenAPI generation reads
})
createOrder(id: string, data: CreateUser, page: Paging) { … }
// wrong order / wrong type / wrong return shape ⇒ compile error
```

- One declaration drives **validation, the inferred TS types, and OpenAPI**
  (guardian's one-declaration pattern, as proven by norm and the OTLP
  encoder).
- Testing is positional and context-free:
  `await orders.createOrder('42', { … }, paging)` — contract wrap applied,
  nothing to fabricate.
- At many bindings, positional gets clumsy; the escape valve is a single
  `body(WholeInputSchema)` collapsing to one argument.

### Binding sources

| Helper                                    | Source       | Validation mode                                                                           |
| ----------------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `param(name, guardian)`                   | route params | **coerce-then-validate** (stringly)                                                       |
| `query(name, guardian)`                   | query string | coerce-then-validate; repeated keys → arrays when the schema is an array; defaults common |
| `body(guardian)` / `body(path, guardian)` | payload      | **strict** — JSON has types; coercion would hide client bugs                              |
| `header(name, guardian?)`                 | headers      | lowercase-normalized (restler precedent); sensitive headers never logged                  |

The coerce-at-stringly-sources / strict-at-body asymmetry is a documented
rule, not an accident.

### Composite bindings

`paging()` is the first **composite** — a convention over query params made
first-class because every team reinvents it inconsistently:

- App-configured once (param names, default limit), per-binding overridable.
- **Max-limit cap is non-negotiable** (`?limit=10000000` is self-service
  DoS; per-handler discipline never holds).
- **Sort requires a whitelist** per handler — unconstrained sort keys leak
  schema internals and invite unindexed scans.
- Output shape aligns with norm's query options (`limit`, `offset`,
  `orderBy`, `total`) — deliberate shape-alignment, not a coupling.
- Offset-based v1; cursor paging is a later extension of the same binding.

Other composites (same machinery, no new concepts): `principal()` (the
pact-verified caller), `signal()`, `responseDescriptor()`,
`httpContext()`.

### Non-HTTP triggers supply bindings as declared args

`@SCHEDULE('0 0 * * *')` passes nothing; `@SCHEDULE('0 0 * * *', { id:
'123' })` supplies the method's arguments as a record keyed by binding
name. Because a schedule's args are **static**, they are validated against
the binding schemas at **boot** (consolidation), not at fire time — a
stacked `@SCHEDULE` with missing or ill-typed args is a startup error.
HTTP-only bindings (`header()`, `httpContext()`) on a scheduled method are
likewise boot errors unless the schedule supplies a value or the binding
is optional.

### Context access is a binding, and it is enforced

Handlers receive **no ctx by default**. A handler that needs the response
descriptor or raw transport context declares it as a binding — which makes
transport-boundness _visible_, so startup consolidation can reject
incompatible stacking (a method binding `httpContext()` cannot carry
`@SCHEDULE`): loud at boot, never `undefined` at 3am.

## Context

- **Abstract base context** + per-trigger subtypes (`HttpContext`,
  `CronContext`, `WsContext` later). The app instantiates the right subtype
  per invocation; middleware sees the full transport context; handlers see
  only what they bind.
- Base shape (roughly):
  `{ requestType, name, principal?, correlationId, signal, state, response }`.
  (**Naming decided 2026-08-10**: the runtime discriminant is
  `RequestType` with UPPERCASE values — `HTTP | CRON | EVENT | WS` — the
  ontology still speaks of "triggers".) `correlationId` is mutable so the
  `requestId` middleware can adopt a trusted inbound id BEFORE anything
  observes it; `signal` is LAZY (HTTP derives it from `request.signal` on
  first read — eager access trips Deno's legacy-abort warning).
- **The response descriptor lives on the base context** — it is plain data
  (`body` / `status` / `headers` keys), so every trigger carries it and
  interprets what it understands (HTTP uses all three; cron/events use
  `body`). Touching the descriptor does not make a handler HTTP-only.
- **`AbortSignal` from day one** — every trigger has a cancellation story
  (client disconnect, cron deadline, ws close); retrofitting cancellation
  into signatures later is miserable.
- **Typed state** (oak-shaped): the app declares its state interface once;
  state bindings type against it; typos are compile errors.
- **No logger on ctx.** slogger's `contextProvider` + ambient already
  auto-correlate every log line in the request scope. ctx carries
  business-facing facts; ambient carries observability facts (the exact
  division Ambient-Integration documents).
- **No "secure data" bag in v1.** The useful guarantee is a rule about
  state itself: rAPId never auto-logs or auto-serializes state; secrets
  live on the principal or in explicitly-named fields. Adding a redaction
  story later is additive.

## Response model

> **REVISED 2026-08-10 v2 (scratch session — the interpreted closed
> payload; supersedes the descriptor bullets below where they
> conflict):** ONE closed payload type across all contexts —
> `{ content: string | Record | Uint8Array; status?: StatusCode;
> headers?: Record | Headers }` (compat's `StatusCode`; NO index
> signature — a typo'd key is a compile error). Set via the
> `ctx.response` accessor pair — **overridable** up to materialization
> (error handling replaces a half-built response), `null` clears.
> Each context type INTERPRETS the payload in its setter override:
> HTTP consumes status + headers (headers merge PER-KEY, so an
> override without a `headers` key never wipes middleware
> contributions); JOB reads status as the outcome; SOCKET/CLI take
> content only. Generic middleware therefore writes ONE literal,
> uniformly, on any context. Transport-specific future keys widen the
> override's parameter type (visible only to transport-typed
> middleware). HTTP additionally exposes `setHeader`/`appendHeader`/
> `responseHeaders` (native `Headers` internally — case-insensitive,
> multi-value). `ctx.respond()` is the **point of no return**
> (polymorphic materialization: HTTP → `Response` with content
> serialization string/bytes/JSON + content-type defaults; CLI →
> printable string; SOCKET → frame body; JOB → `{ status, content }`
> outcome); every mutation afterwards throws
> `RAPID_RESPONSE_INVALID`.

- **Handlers return; the return value is the body.** The dispatcher writes
  it to `ctx.response.body`; transport materializes the real `Response` at
  cycle end (cron/events take the data directly).
- The return passes through the **declared response schema**. A validation
  failure on the way out is a **server bug**: 500 + loud log, never a
  half-shaped body leaked to the client.
- **Static envelope in the decorator** (`status: 201`, fixed headers) —
  OpenAPI needs status codes and per-status shapes statically, so the
  decorator is where docs, validation, and behavior stay one declaration.
- **Dynamic envelope via the response descriptor** (ETag, Location):
  bind `responseDescriptor()` and mutate before returning.
- Typed errors map to responses **centrally** — see [Errors](#errors).

## Errors

**Modules never throw "HTTP" errors.** They throw domain errors carrying a
**standardized error code**; what a code _renders as_ is the transport
layer's business — the contract/transport split applied to failure.

- **The code registry is a declaration** (one-declaration pattern): each
  code carries a default message, a details section, and a status-code
  mapping. Apps register their own codes, **typed** — the registry is
  `as const`, so the union of valid codes is derived and a typo'd `throw`
  is a compile error. Duplicate code registration is a boot error (loud
  consolidation, as everywhere).
- **Code format (decided)**: SCREAMING_SNAKE — the suite's existing
  convention (`INVALID_CONFIG_VALUE`, pact's stable codes). The `RAPID_`
  prefix is **reserved**: an app registering a `RAPID_*` code is a boot
  error. App codes adopt module prefixes by convention
  (`ORDERS_OUT_OF_STOCK`). Open cosmetic: whether reserved codes carry an
  `_ERROR` suffix or name the condition (`RAPID_VALIDATION_FAILED`).
- **Starter reserved set** (one code per framework-generated condition):
  `RAPID_UNHANDLED` (500, internal), `RAPID_VALIDATION_FAILED` (400,
  guardian issues → `details`), `RAPID_RESPONSE_INVALID` (500, internal),
  `RAPID_UNAUTHENTICATED` (401) vs `RAPID_ACCESS_DENIED` (403) — the
  split is load-bearing with pact: "couldn't verify who" ≠ "insufficient
  grants" — `RAPID_NOT_FOUND` (404), `RAPID_PAYLOAD_TOO_LARGE` (413),
  `RAPID_UNSUPPORTED_MEDIA` (415), `RAPID_TIMEOUT` (504),
  `RAPID_RATE_LIMITED` (429). Domain conditions (conflicts, stock) are
  deliberately NOT reserved — app territory.
- **Throw-site payload**: a message override, plus **two data channels
  with different disclosure classes** — `details` (client-safe, rendered
  into the error payload) and `debug` (environment-gated, never rendered
  in production; always logged).
- **Environment policy** (app env: DEBUG / TESTING / PRODUCTION):
  - DEBUG/TESTING may render `debug` data and true messages.
  - PRODUCTION renders only code + safe message + `details`; errors
    flagged internal (or any code without a client-safe rendering) are
    **promoted to an opaque 500**.
  - Uncaught / non-registered errors are always an opaque 500 + full
    structured log (with ambient correlation), never a leaked stack.
- **Per-trigger rendering**: HTTP → mapped status + a stable error
  envelope (`{ code, message, details? }` — itself a schema, so OpenAPI
  documents error responses per status alongside the success shape);
  cron/`@ON` → the error is the outcome: logged with correlation, the run
  marked failed (subscriber isolation already guarantees containment).
- **Contract-layer failures use reserved codes automatically**: input
  validation failure renders the guardian issue list as `details` under
  the framework's validation code; `@Access` denial maps to the access
  code. Response-shape (outbound) validation failure is a server bug:
  opaque 500 + loud log, per the response model.

## Request processing

**Parse to the contract, not eagerly to everything.** The declaration tells
the framework exactly what to materialize before invoking — body fields,
form data, query/param mapping. Everything undeclared stays lazy on the
transport context. File uploads are the forcing case: eager buffering is a
memory cliff, so a declared file field is **streamed** (temp file or stream
handle in the input), and a handler that declares no files never pays
upload processing at all.

## Middleware

- **Koa-style onion**: `(ctx, next) => Promise<void>` — wrap, not signal
  (the suite's shape in rpc and every wrap-family recipe). Middleware
  receives the **full transport context** (`HttpContext`).
- **Three levels, no more**: app-level (global), module-level
  (`@UseMiddleware` on the class), method-level (`@UseMiddleware` on the
  method). No route-prefix groups — modules own their prefixes.
  Execution: global → module → method → contract wrap → handler,
  unwinding in reverse. Within a level: **registration order** — no
  priority numbers (priority integers turn ordering into archaeology).
- **Position in the pipeline**: transport parse + principal _extraction_
  → middleware onion → contract wrap (validate → `@Access` enforcement →
  handler). Middleware sees `ctx.principal` but runs before enforcement —
  deliberate: rate limiting and CORS must run for callers who will be
  denied.
- **What middleware may do**: (a) **short-circuit** — write the response
  descriptor and skip `next()`; (b) **enrich** `ctx.state` (typed by the
  app's declared state interface; no per-middleware type extension in
  v1); (c) **post-process** — after `await next()`, observe/mutate the
  settled response descriptor; (d) **catch** around `next()` — permitted,
  but anything uncaught flows to the central error mapper, and middleware
  throws registry codes like everyone else.
- **Dependencies via factories, not DI**: middleware are plain functions
  produced at the composition root — `rateLimit(cacher, { rps: 50 })`
  returns the middleware; closures do the wiring. The container stays a
  module-construction concern.
- **OPEN — middleware × non-HTTP triggers** (decide as we build): ws will
  likely want an onion of its own; cron mostly won't. `@UseMiddleware` on
  a method that also carries `@SCHEDULE` does not run for the cron path
  in the current shape. This also surfaces the **scheduled-invocation
  principal question**: `@Access` lives in the contract wrap and runs on
  _every_ invocation — so what principal does a cron run carry? A
  configured system principal on `@SCHEDULE` vs. schedule-skips-access —
  unresolved.
- **In-box middleware set — STARTED (2026-08-10)**: `requestId`
  (adopt-or-mint + echo, `trustInbound` for public edges), `timing`
  (`x-response-time`, lands via `finally` even on errors), `etag`
  (post-processor: weak tags, 304 short-circuit, serializes JSON bodies
  once). More later (CORS, rate limit, security headers — scratch/ has
  proven drafts). `compose()` (double-next guard, loud non-function
  check) ships in the same folder.

## Composition & startup

- **Auto-compose, never auto-discover.** Norm's `use()` is the model:
  explicit inputs (`rapid.use(UserModule, OrdersModule, …)` at the
  composition root), automatic wiring. Filesystem/glob discovery is
  rejected — import-order sensitivity and invisible registration were the
  root of most scratch-implementation issues, and scanning is fragile
  across three runtimes + JSR bundling. The explicit list _is_ the "single
  place to see the API surface."
- **Startup consolidation fails loudly** (the suite's "config errors throw
  at construction" rule), reporting:
  - route collisions;
  - event subscriptions referencing undeclared events;
  - trigger/context incompatibilities (`httpContext()` binding +
    `@SCHEDULE`);
  - DI graph gaps (missing providers for injected dependencies).

## Inter-module communication

Modules never import each other. The primary mechanism is **one-way,
namespaced events**: `Orders::Executed` with a payload; Inventory
subscribes (`@ON('Orders::Executed')`) and adjusts stock. A subscription is
**just another trigger** — the handler keeps its contract wrap, so event
payloads are guardian-validated at delivery like any other input.

- **Emits are declared**, with payload schemas, in module metadata. Startup
  verifies every subscription references a declared event — a typo'd event
  name is a boot failure, not a handler that silently never fires. The same
  declarations can generate AsyncAPI docs later.
- **In-process delivery semantics** (all with suite precedent):
  - _Subscriber isolation_ — one handler throwing affects neither other
    subscribers nor the emitter (restler/pact listener-isolation contract).
  - _Emitter never awaits_ — emit returns immediately; the originating
    request's latency and outcome are untouchable.
  - _Context travels_ — delivery rebuilds the ambient scope from an
    emit-time snapshot (correlationId flows; the handler's span links to
    the originating trace). This is Ambient-Integration's
    background-work pattern, applied.
  - _Serial per subscriber_ — concurrent delivery of rapid successive
    events to one subscriber is a race (inventory math); serial is the
    default.
- **The bus is a seam.** In-process fire-and-forget is _at-most-once_: a
  crash between the order committing and the inventory handler running
  loses the event — acceptable for cache invalidation, not for
  business-consistency operations (the inventory example is precisely the
  dangerous case). rAPId v1 does not build durability; it defines the bus
  interface, ships the in-process default, and leaves durable/distributed
  delivery to a sibling package (herald/relay) behind the same seam. The
  multi-host future **requires** this seam anyway — in-process events do
  not cross hosts.
- **The synchronous-read gap is acknowledged, not wished away.** Events
  cannot answer questions ("is this in stock?"). First response: treat it
  as a module-boundary smell. When genuinely needed, the sanctioned path is
  a _declared_ dependency — a module exposes a contract token (doctor's
  import-free style), another requests it via DI, and the dependency is
  visible in module metadata. Exact mechanism: **open question**. Teams
  without a sanctioned path invent unsanctioned ones (usually reaching into
  another module's tables — the worst outcome).

## Data layer

- **Independent of services** — the database section is its own part of
  rAPId, never owned by a module.
- **Norm is blessed, not forced.** rAPId defines the slot (a named registry
  handed out by DI — `this._norm.get('Users')`-shaped); norm is the
  first-class provider, likely behind a subpath so the coupling is opt-in
  at import level. Reasons: a pure BFF/integration service (restler
  clients, zero DB) must not bundle four database drivers (norm's barrel
  currently imports all engine classes as values; drivers' barrels still
  pull networking — the open edge-safety item); and blessed-defaults-over-
  hard-coupling is the suite's proven philosophy.

## Services & DI

- **Providers are defined once, at the project level** (composition root):
  the norm handle, loggers, pact, the event bus, and third-party API
  suites (restler vendor clients) are all just providers — a module that
  needs the GitHub client injects it exactly like it injects norm.
  Modules declare what they need and receive it by injection
  (`this._norm`, `this._log`, `this._github`).
- **doctor is the container** — token-based, import-free style (not
  `design:type` reflection, which is banned by the decorator decision
  above). The "expansion" doctor needs is a TC39-compatible surface.
- **OPEN — the module-side declaration syntax.** Constraint to respect:
  TC39 _field_ decorators cannot see or constrain the field's type — an
  `@Inject(NORM) _norm: NormRegistry` annotation would drift from its
  token silently, the same trap that killed parameter decorators. The
  type-safe candidates derive the types from a declaration: a static
  `dependencies = { norm: NORM, github: GITHUB } as const` map with typed
  tokens (`Token<T>`), surfaced as typed members via a `Module<typeof
  dependencies>` base-class generic or constructor injection.
- Injected logger = a slogger scoped with the module's name; ambient
  carries per-request correlation underneath — module logs arrive tagged
  `{ module, correlationId, traceId }` with zero threading.
- Modules are singletons; per-request facts arrive as bound inputs or on
  ctx, never via request-scoped providers (Nest's request-scope trap:
  complexity + per-request construction cost).

## Observability

Inherited wholesale from the suite's seams — rAPId is where they were all
pointed:

- The transport layer opens `ambient.run` per invocation (correlationId,
  trigger info) when it creates the context.
- The first-class tracing middleware lives here at last (rAPId owns the
  typed request context the recipes could not write to): SERVER span per
  request, `extract` on the way in.
- Container operations (event dispatch, later ws sessions) honor the
  witness convention; outbound calls made with restler get
  `witness: tracer.wrapClient` + `headerProvider: tracer.propagation` at
  the composition root.
- Guardian declarations double as the OpenAPI source; event declarations
  double as the AsyncAPI source (later).

## Non-goals for v1

- Durable/distributed event bus (herald/relay's job, behind the seam).
- Cursor paging (extension of `paging()`, not a redesign).
- A "secure data" context bag.
- `@SCHEDULE` as a priority feature (the trigger model carries it; the
  scheduler itself can come later).
- Filesystem/glob module discovery — permanently out, not just v1.
- Parameter decorators — permanently out (standards + type-derivation).
- Request-scoped DI providers.

## Open questions

1. **Middleware × non-HTTP triggers** — per-trigger onions (ws yes,
   cron mostly no), the scheduled-invocation principal (`@Access` on
   cron runs), and the in-box middleware set. Core shape is decided —
   see [Middleware](#middleware).
2. **Synchronous inter-module dependency** — the declared class-token
   mechanism (or a decision that v1 ships without one).
3. **WebSockets trigger** — scoped after the HTTP shape settles; composes
   rpc; expected to be "another trigger + its transport context."
4. ~~Prototype cross-check~~ — **DONE 2026-08-10**; see
   [Prototype cross-check](#prototype-cross-check-2026-08-10). Its
   outputs: the adopt-list below, stronger evidence on questions 2
   (command bus) and the scheduled principal, and one new small
   question (decorated-class inheritance).
5. **Decorated-class inheritance** — the scratch's WeakMap metadata was
   keyed on the exact constructor, so subclassing a decorated module
   silently lost the parent's routes. Decide: support it, or boot-error
   on it. Leaning: boot error until a real use case appears.

## Prototype cross-check (2026-08-10)

Two prior implementations audited after this design was locked:
`TundraSoft/rAPId` (src/ = Phase-3+ build; scratch/ = a NEWER
command-kernel rebuild) and the live product `clearremit-services`
(Oak-based, 7 modules, 160 routes, separate scheduler service).

### The design is triple-confirmed

- **scratch/ converged on this design independently**: bindings on the
  method decorator (not param decorators), `@Inject(Class)` + container
  (≈ class-as-token), a response envelope, codegen descoped.
- **Wrap-the-contract**: the product's decorated handlers double as
  internal service methods (~30 direct call sites; callers faking `[]`
  for a `@Files()` param), so every handler has TWO calling conventions
  with different validation guarantees — and the test doctrine
  literally instructs manual `Schema.parse()`. The src/ build
  implemented contract logic FOUR times with four semantics (cron never
  validated at all). The contract wrap fixes both: internal reuse and
  direct tests get the same guarantees as HTTP.
- **Explicit compose, no import-time side effects**: the product's pain
  was import-time composition (top-level-await config, modules
  instantiated on import, THREE manager globals with a silently-empty
  fallback, silent route loss, hand-matched metadata symbols across
  files); src/'s was filesystem discovery forcing a six-file codegen
  subsystem + stale-barrel boot gate + zero-arg-ctor rule + a 240-line
  test boot that duplicated production boot and drifted. `rapid.use()`
  - phased boot dissolves all of it — including the codegen (explicit
    imports let types flow without generation).
- **Tuple bindings + boot-time trigger compatibility**: src/'s param
  decorators produced sparse metadata arrays, `any`-laundering in all
  three transports, and `@Body` on a `@Cron` handler resolving to
  SILENT `undefined` — our boot error, vindicated.
- **Declarative `@Access`**: the product's documented #1 pitfall is
  "handler forgot the in-method permission check", and its tenant rule
  is written three times because no phase owns principal + matched
  route params. Pipeline note made explicit by this: principal
  extraction runs AFTER route match (params available), before the
  onion.

### Adopt-list (gems the design now includes)

**Lifecycle/ops**: phased boot (config → log → providers → modules →
onInit → transports); ordered `onInit` / REVERSE-order `onShutdown`
with per-module status; graceful shutdown with an `unref()`d force-exit
deadline sized under Cloud Run's SIGTERM window; signal handlers via
compat with detach functions; a framework observability event stream
(moduleRegistered/started/stopping/…) kept OFF the domain bus.

**HTTP**: request-meta middleware (inbound request-id header or minted
ULID, echoed + `X-Response-Time` in a `finally`); **proxy-aware URL
canonicalization as a security-critical first-class concern** (the
product HMAC-signs over the canonical URL — reconstruction from proxy
headers must be framework-owned, not middleware folklore); rich return
marshalling (`Response` passthrough incl. streams, `null` → 204,
binary types as-is); lazy parse-to-contract (proven: zero body-parse
cost on routes that don't declare a body); health endpoint BEFORE auth,
with readiness/liveness split as a v1.x follow-up.

**Uploads**: the full hardening set (size caps, extension allowlist,
MIME-vs-extension cross-check, UUID disk names, symlink containment,
traversal checks) + UNCONDITIONAL temp-file deletion in `finally`
(handlers must persist artifacts) + pluggable storage seam — the
product's local-disk roots are its single biggest obstacle to
autoscaling.

**Pagination**: counts as HEADERS with config-named keys (must be in
CORS expose list), body stays a bare array; lesson: emit the total
header even when the count is ZERO (falsy-guard bug in the product).

**Errors**: disclosure ladder validated end-to-end by both codebases;
realm-safe normalization (duck-type on `context.code`, repair the
prototype chain — `instanceof` proved unreliable in BOTH prior builds).

**Cron**: overlap prevention (skip + debug-log, default on); `unref()`d
timers; per-replica disable flag; drift-measuring tick
(scheduledAt/firedAt/count); pluggable Scheduler adapter (anticipates
distributed/leader-elected scheduling AND the product's
scheduler-as-separate-service topology — a cron job being also a route
is exactly our stacked `@GET`+`@SCHEDULE`).

**Scheduled principal (evidence in)**: the product's scheduler
authenticates properly (HMAC) but then ESCALATES to a synthetic
all-permissions, no-tenant context at ~30 call sites with no audit
distinction from a human admin — the anti-pattern. Decision leaning
hard toward: a configured, DISTINGUISHABLE system principal declared on
`@SCHEDULE`, flowing through the normal `@Access` check, auditable.

**Docs**: served endpoints (`/__docs/openapi.json`, AsyncAPI, cron
manifest), built once at startup, conditionally registered, doc routes
bypass user middleware.

**WS (for later)**: `maxFrameSize` cap; upgrade-hook auth with typed
per-connection data; internal-vs-exposed command security split.

**Testing**: keep the bus recorder (fire-and-forget events are
otherwise unobservable) and `triggerCron(name)` (synchronous, full
chain, errors PROPAGATE instead of the tick path's swallow).

**Events**: the product's hand-rolled outbox (PENDING rows + cron
drain, 5 attempts, no backoff/dead-letter/concurrency) is the
strongest field evidence yet for the pluggable-bus seam and
herald/relay as its durable implementation.

### Evidence on open question 2 (sync inter-module)

src/ shipped a typed CommandBus (single-handler RPC, ctx propagation,
in-process fast path) and used it to Phase 3+; scratch/ went further
(command-as-primitive); the product's "modules never reference each
other" held EXCEPT one middleware importing the manager directly (the
escape valve materializing). Evidence now favors the **command bus**
over declared-token DI for cross-module sync calls — with the design
caveat that commands must carry compile-time types WITHOUT codegen,
which explicit `use()` makes possible. To be decided.
