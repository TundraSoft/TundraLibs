# `@tundralibs/rapid` — Adversarial Review

**Date:** 2026-08-22 · **Branch:** `feat/rapid-review-and-modules` (local) ·
**Scope:** the whole `rapid` package (11.3k LOC source, 46→50 test files)

**Method:** six parallel review agents, one per dimension (architecture ·
developer usability · performance & scalability · bugs & security · capability
comparison / missing functionality · test coverage · documentation), every
finding then re-verified against source by hand before action. After fixing, a
two-agent second pass adversarially re-verified each fix and swept for new
issues. Verification-first throughout — a review that invents a bug is worse
than one that misses it.

---

## TL;DR

The core is genuinely well-built: a single `Transport._invoke` spine unifying
ambient correlation, optional tracing, the middleware onion, error disclosure,
and metrics with a real sync-through fast path; observability that is
zero-cost when off; the fetch/listen split that enables Workers; careful
prototype-pollution defenses and an upload magic-byte gauntlet; a
disclosure model that never leaks a stack in production.

The review found ~35 issues; the second pass found 5 more (completeness gaps of
the fixes + net-new bugs). I **fixed everything that was safe to fix without a
product decision (29 items)** — including one **JSR publish blocker** and
several **security/correctness bugs**, each now covered by a regression test —
and **gated 11 items that need your call** (design changes, breaking defaults,
and larger features), listed below. All three runtimes are green (Deno 382
steps · Bun 366 · Node 366, up from 311 — **+55 tests**), and `deno publish`
now succeeds. The second pass also confirmed all 14 first-pass fix groups
correct with no regressions.

**The two things most worth your attention:** (1) the metric-cardinality leak
(H1) was a real internet-facing memory-exhaustion vector, now fixed; (2) the
gated **validation→400** gap (H2) means a malformed request body currently
500s out of the box — the fix is small but is an API-surface decision.

**UPDATE 2026-08-22 — every gated item is now dispositioned.** G1/G2/G3/G4/G5/
G6/G7/G10/G11 are shipped; the cross-package dependencies were released to JSR
one-at-a-time (radrouter 1.2.0, doctor 1.4.0 + 1.5.0, compat 2.4.0) and consumed
by the rapid branch. Only **G8** (cron double-fire → cluster design) and **G9**
(streaming/SSE) remain, both deferred to the roadmap by decision. See the Gated
section for per-item detail.

---

## Fixed (no decision needed) — 29 items

### Critical / High

**H1 — Metric label cardinality leak → memory-exhaustion DoS.** `FIXED`
`transports/Transport.ts` · confirmed independently by 3 agents.
An unmatched (404) request's `action` is the raw, attacker-controlled path;
with `server.metrics` on, every distinct 404 URL minted a permanent new metric
time-series (counter + histogram buckets). A `GET /<random-N>` flood (or just
bot-scan noise like `/wp-admin`, `/.env`) grew memory without bound.
**Fix:** a `__identity(ctx)` helper collapses unmatched-HTTP to `<METHOD>
<unmatched>` for metric labels _and_ the tracer span name; matched routes still
label by pattern. **Test:** `Application.metrics.test.ts` — two distinct 404s
produce one series, raw paths never appear in labels.

**Multipart upload temp-file leak.** `FIXED` `utils/parseBody.ts`
When a later file in a multipart body failed the size/extension/magic-byte
gauntlet, files already written for earlier parts were orphaned on disk
(`files` never reached the caller's cleanup) — repeatable → disk-fill DoS.
**Fix:** the form branch now deletes every already-written file on any throw
before rethrowing. **Test:** `utils/parseBody.test.ts` asserts the upload dir
is empty after a rejected multipart.

**JSR publish blocker (slow types).** `FIXED` `cli/mod.ts`
`deno publish` failed: `run(args = argv())` had no explicit parameter type, so
JSR's slow-type check errored and the package **could not be published**.
**Fix:** `run(args: ParsedArgs = argv())`. Dry-run now passes.

**Route-versioning path-mode mis-strip.** `FIXED` `utils/resolveVersion.ts`
(new code) — path mode sliced by match _length_ assuming index 0, so a
non-anchored custom `identifier` produced a mangled pathname (`pi/v2/users`);
the default pattern also matched non-whole segments (`/v1abc` → `/abc`).
**Fix:** slice from `match.index`; default pattern requires a whole segment
`^/(v[0-9]+)(?=/|$)`; regexes are now compiled once (were per-request).
**Test:** `utils/resolveVersion.test.ts` (whole-segment + match-index cases).

### Medium

- **`openapi()` cache DoS.** `FIXED` `endpoints/openapi.ts` — cached the doc
  per attacker-controlled `?version=` into an unbounded Map. Now only real
  versions are cached; unknown versions are built fresh, uncached.
- **`health()` info leak.** `FIXED` `endpoints/health.ts` — the readiness
  check's raw error message (can carry DSNs / hostnames / creds) was returned
  on the wire; now logged server-side, the 503 body is bare. **Test updated.**
- **`compress()` dropped `Vary: Origin`.** `FIXED` `middlewares/compress.ts` —
  hard-replaced `Vary` with `Accept-Encoding`, so `cors()`+`compress()` made a
  shared cache serve one origin's response to another. Now merges/dedupes.
  **Test:** cors+compress → `Vary` carries both.
- **Metrics in-flight gauge not exception-safe.** `FIXED` `transports/Transport.ts`
  — a synchronous throw skipped the gauge decrement; now in a try/catch.
- **`metrics()` emitted an off-registry error code.** `FIXED`
  `endpoints/metrics.ts` — returned `code: 'RAPID_METRICS_DISABLED'` which
  isn't in the registry (and would have polluted `socketOutcome`'s status→code
  map); now a plain operational 503.
- **`harness()` leaked doctor stubs on boot failure.** `FIXED` `testing/mod.ts`
  — stubs stocked before `initModules` were never revoked if it threw (the
  common thing a test exercises); now try/catch revokes them.
- **`rapid init <name>` directory escape.** `FIXED` `cli/commands/init.ts` —
  a name with path separators / `..` could write outside the base dir; now
  rejected. **Test.**

### Usability / exports / docs

- **Root barrel gaps.** `FIXED` `mod.ts` — `jwt` (the headline JWT helper),
  the full middleware catalog (`compress`/`etag`/`healthCheck`/`serveStatic` +
  the stateKey helpers), the error types (`RapidErrorCode`/`RapidErrorMeta`),
  and `RapidRouteOpenApi`/`RapidApplicationFetchInfo`/`RapidApplicationJobMetrics`
  are now exported from the package root.
- **Scope diagnostics.** `FIXED` `middlewares/{compress,etag,healthCheck,serveStatic}.ts`
  — these HTTP-only middlewares didn't stamp `MIDDLEWARE_SCOPE`, so the scope
  machinery misclassified them as universal; now stamp `['HTTP']`. **Tests.**
- **Doc examples failed `deno check --doc-only`.** `FIXED`
  `decorators/{http,module,registry}.ts` + `DESIGN-modules.md` — `ts` blocks
  with illustrative `{ ... }` bodies didn't compile (the barrel-only doc gate
  missed them). Now real bodies or `ts ignore`.
- **Inaccurate JSDoc.** `FIXED` — `RapidModule` linked `{@link payload}` (should
  be `event`); `context/*` referenced a nonexistent "CLI" transport; stray dev
  notes and placeholder blocks removed; missing member/type JSDoc added across
  `context/*`, `modules/*`, `types/*`.
- **README was a 572-byte stub.** `FIXED` — replaced with a real, source-
  verified README (install, quickstart, routing/versioning, middleware,
  modules, endpoints, auth, observability, testing, runtime support); every
  runnable example compiles under `deno check --doc-only`.
- **Internal notes shipped to consumers.** `FIXED` `deno.json` — the tarball
  shipped 64KB of `DESIGN-modules.md` / `REVIEW-2.md` / `ROADMAP.md` (the
  root exclude globs `**/REVIEW.md`/`**/DESIGN.md` missed the `-2`/`-modules`
  variants, and `ROADMAP.md` wasn't listed). Added a package-level
  `publish.exclude`; the tarball now ships only the real README (139 files,
  tests/examples still excluded). NOTE: this is monorepo-wide in spirit —
  other packages (tracer/norm/drivers/ambient/oql/pact) still ship their
  `ROADMAP.md` via the same too-narrow root globs (see gated item G11).

### Second pass (found after fixing, all fixed)

- **`ctx.detach()` never absorbed rejections off the scheduled-cron path.**
  `FIXED` `context/Context.ts` — its docstring promised "callers need no
  unhandled-rejection guard", but absorption only happened in
  `settleDetached()`, which runs only for the JOB slot-hold. On HTTP / SOCKET /
  `triggerJob`, a rejected fire-and-forget promise was an **unhandled rejection
  → process-fatal on Node/Deno** — from a documented-safe public API. Now
  `detach()` attaches the catch itself. **Test.**
- **`socketOutcome` dropped handler content keys when the body had a `code`.**
  `FIXED` `utils/socketOutcome.ts` — a REST-style socket error like
  `{ code: 'CONFLICT', current }` took the framework-disclosure branch and lost
  every key except details/debug/requestId (the exact cross-transport data loss
  the function exists to prevent). Now only a _registered_ `RAPID_*` code takes
  that branch; handler content passes through whole. **Test.**
- **`http.route` span attribute still carried the raw unmatched path.** `FIXED`
  `transports/HTTPTransport.ts` — the H1 fix collapsed the span _name_ and
  metric label but not the `http.route` _attribute_, which re-introduced
  attacker input / unbounded cardinality into traces. Now `<unmatched>` when
  no route matched.
- **`compress` skipped compression for any `q=0.x` (e.g. `gzip;q=0.9`).** `FIXED`
  `middlewares/compress.ts` — the `q=0` disable lookahead false-matched the `0`
  prefix of `q=0.9`. Now anchored to a true zero. **Test.**
- **`rapid init ""` (empty name) bypassed the directory-escape guard.** `FIXED`
  `cli/commands/init.ts` — an empty positional skipped the default and made
  `root` the filesystem root. Guard now rejects empty/whitespace names. **Test.**

---

## Gated — needs your decision (11 items; ALL dispositioned 2026-08-22 → only G8/G9 deferred)

These are correct-to-do but involve a product decision, a breaking change, or a
larger build. Each has a recommendation. **2026-08-22 outcome: every gated item
is resolved or deliberately deferred.** G1/G2/G3/G4/G5/G6/G7/G10/G11 shipped
(the cross-package ones — radrouter 1.2.0, doctor 1.4.0 + 1.5.0, compat 2.4.0 —
released to JSR one-at-a-time then consumed by the rapid branch); **G8**
(cron double-fire) and **G9** (streaming/SSE) are deferred to the roadmap.

**G1 — Validation → 400 wiring (HIGH). ✅ RESOLVED 2026-08-22 (BOTH).** A thrown `GuardianError` from a bound
validator maps to `RAPID_UNHANDLED`/**500**, not 400 — so a malformed body
500s out of the box. The bridge (`validated()`) exists only in
`examples/validated.ts` and isn't exported. _Recommend:_ export a `validated()`
helper, or teach `RapidError.from` to recognize `GuardianError` → 400. (The
"how" is the decision: a thin exported helper vs. a guardian-aware error map.)

**G2 — Graceful request drain on shutdown (HIGH). ✅ RESOLVED 2026-08-22.**
Shipped compat 2.4.0 `WebServer.stop(true, timeoutMs)` — a real bounded drain
(Node `closeIdleConnections()` before `close()` fixes the idle-keepalive hang;
Bun `stop()`/`stop(true)`; Deno races `finished`). rapid-side:
`HTTPTransport.stop(drainMs)` → `server.stop(true, drainMs)` (else `stop(false)`
when `shutdownTimeout` is 0); `shutdownTimeout` is now the graceful-drain window
and the nuclear `process.exit` backstop moved to `ceil(shutdownTimeout*1.1)`, so
the drain's force-close + module dispose finish first. Websockets are held to
the deadline then force-closed. Test: `Application.drain.test.ts`.

**G3 — Auto HEAD / 405 / generic OPTIONS (P0 for 1.0). ✅ RESOLVED 2026-08-22.**
Auto-HEAD (`server.autoHead`, default true — synthesizes a bodiless HEAD for
every GET at boot, correct `content-length`); 405 + `Allow` and generic OPTIONS
→ 204 (`server.methodNotAllowed`, default false — off keeps 404 to hide the
path) computed from radrouter 1.2.0's new `allowedMethods(path, version)` on the
miss path only. Tests: `Application.methodnotallowed.test.ts`.

**G4 — Per-request error hook (MED). ✅ RESOLVED 2026-08-22.** `app.onError()`
lets the app override the disclosure envelope centrally; the hook runs inside
`disclose()` in the request's ambient scope, and a hook that throws falls back
to the default envelope. New type `RapidErrorHandler<S>`.

**G5 — Context base leaks transport concepts (MED). ✅ RESOLVED 2026-08-22.**
`ctx.metrics` / `ctx.socketMetrics` getters removed from the base `Context`
(read app-level metrics via `ctx.app.metrics`); `ctx.meter`, `ctx.jobMetrics`,
and `ctx.publish` (deliberately cross-transport) remain.

**G6 — `openapi()` default `expose: 'ALL'` (LOW). ✅ RESOLVED 2026-08-22.**
Was: shipped the full spec to anonymous clients in PRODUCTION once mounted.
Default is now `'DEVELOPMENT'` (secure-by-default); pass `expose: 'ALL'` to
serve everywhere (e.g. behind auth).

**G7 — `serveStatic` symlink escape (LOW). ✅ RESOLVED 2026-08-22.** After the
lexical guard, the resolved file path is re-checked with `realPath()` and must
equal `root` or sit under `root + SEPARATOR`; a symlink inside `root` pointing
outside now 404s. `root` itself is resolved once (lazily) and cached.

**G8 — Cron jobs double-fire under N replicas (MED, scaling). ✅ ACKNOWLEDGED —
already covered by the cluster design.** The `onlyIfCronLeader` sticky-leader
middleware in the converged master/worker plan (ROADMAP → Distributed
deployment) is the intended fix; no separate action. Until that ships, running
the scheduler on a single replica is the operating assumption.

**G9 — Streaming / SSE response model (P2, structural). 🔵 DEFERRED.** `content`
is `string | Record | Uint8Array` only — no `ReadableStream`. `serve()` and
`serveStatic` read whole files into memory; no SSE, no Range. Parked post-1.0 by
decision; the one large structural change on the horizon (roadmap).

**G10 — Module/DI isolation via process-global doctor (MED). ✅ RESOLVED
2026-08-22.** Shipped doctor 1.4.0 (`createContainer` — a child that reads the
global's registrations but keeps its own instances) + doctor 1.5.0
(`setContainerProvider`, an async-context seam because the sync ambient stack
can't cross an `await`). rapid-side: each `Application` owns a child container
(`app.container`); one global provider (installed once) reads the container off
the request's ambient bag, where `Transport`/`ModuleRuntime` pin it
non-enumerably, so a handler's `inject()` — even after an `await` — resolves
against THAT app. `initModules` dispenses registered modules from the container
and builds unregistered ones via `container.resolve()` (constructs under the
container ambient). `harness()` now defaults to a fresh child and stocks stubs
there, never touching the process-wide `Doctor`. Tests:
`Application.container.test.ts`.

**G11 — Monorepo-wide: `ROADMAP.md` ships from other packages. ✅ RESOLVED
2026-08-22.** The root `deno.json` `publish.exclude` globs are now
`**/REVIEW*.md`, `**/DESIGN*.md`, and `**/ROADMAP.md`, so no package ships
internal notes (verified: tracer's `ROADMAP.md` no longer in its tarball). The
rapid-scoped package-level exclude was removed as redundant — the root globs
are the single source. NOTE: this is a workspace-root change touching every
package's publish set (intentional, per your go-ahead).

Smaller gated/noted: decorator stacking-order footgun — ✅ RESOLVED 2026-08-22: the registry is now keyed by method NAME in the class's TC39 decorator metadata (`Symbol.metadata` polyfilled by rapid at load), so wrapping decorators may sit above or below rapid's; `coerceComparable` accepts hex/exp numerics
(`?n=gt:0x1F`) inconsistently with `parsePaging`; decorator option-type naming
skew (`RouteDecoratorOptions` vs `Job/SocketDecoratorOptions`);
`Application.stop()` reaches `Deno`/`process` globals directly (guarded, no
compat exit primitive exists); eager per-request `state` clone (cheap for the
default `{}`, scales with template size).

---

## Missing functionality (added to ROADMAP as pending)

Prioritized against a 1.0 HTTP-framework baseline (oak / Hono / NestJS /
Fastify): **P0** auto HEAD/405/OPTIONS (G3), validation→400 (G1);
**P1** graceful drain (G2), per-request error hook (G4), sessions + CSRF
middleware, static ETag/If-None-Match/Range, content negotiation;
**P2** streaming/SSE (G9), trailing-slash policy, brotli, DI ergonomics.
Plus (your request) a CLI feature that scaffolds **AI agent instructions**
for a new project. See `packages/rapid/ROADMAP.md`.

---

## Capability comparison (condensed, rapid column verified against source)

Present: routing (params/wildcards/**versioning**), universal middleware,
body parsing **with size limits**, file download (`ctx.serve`), static files,
cookies, CORS, security headers, compression (gzip/deflate), rate limiting,
OpenAPI (JSON), WebSockets + pub/sub, DI/modules, first-class testing,
observability (logs always-on, traces + metrics opt-in).
Absent/partial: streaming/SSE, sessions, CSRF, content negotiation, auto
HEAD/405/generic OPTIONS, graceful drain, brotli, cluster (seams only).

---

## Test coverage & docs

- **Coverage:** +50 tests (311→361 cross-runtime). Every fixed bug and every
  new-feature branch now has a falsifiable regression test. rapid's own
  transports/context/modules/endpoints/middlewares are ~85–100% line coverage.
  Remaining low files are deliberately out of scope: `cli/git.ts` (spawns a
  subprocess), `cli/latestVersion.ts` (network fetch, no injection seam),
  `cli/commands/init.ts` (interactive prompts) — noted, not chased.
- **Docs:** README written; all JSDoc gaps in the enumerated set closed;
  all `deno check --doc-only` failures fixed (the barrel-only gate was
  missing per-file examples — worth adding a full doc-only sweep to CI).

## What's already solid

Prototype-pollution defenses (null-proto accumulators, spread-copied socket
payloads, ULID upload filenames); the disclosure model (no stack/detail leak
in production on any transport path); consistent throw-vs-return with `@throws`
docs; body/DoS caps enforced on bytes actually read; the sync-through invoke
cycle; no CLI command injection; auth middleware fail-closed; no header/response
injection; CORS never emits `*`+credentials; rate-limit respects `trustProxy`.
