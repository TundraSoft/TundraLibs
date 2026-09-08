# rAPId Roadmap

What is still to build. Only pending work is listed — nothing here has
shipped. Shipped capabilities and the reasoning behind them are recorded in
[DESIGN.md](./DESIGN.md), the guides under `docs/` and the changelog; build
history lives in git. One pool, no 1.0-vs-later gate: everything is in scope
and up for scheduling. Where an item notes a dependency ("after caching",
"downstream of OpenAPI") that is a sequencing fact, not a deferral. Last
updated **2026-09-09**.

## Next up

- **Dashboard (`@tundralibs/rapid/dashboard`) — agreed 2026-09-08.** A
  server-status page built on rapid's OWN UI layer (templates, `data-load`
  panels, the live bridge) — the showcase of the UI layer as well as of the
  server; no bundler, no CDN, runs wherever routes run. Mounted in one call
  (`dashboard(app, { path, expose, guards })`) — a decorated module with
  `@Module({ middleware: guards })`, or plain `app.get()` registrations —
  the same page-of-the-app pattern as `docs()`; `uiOnly`; gated like `openapi()` (`expose` DEVELOPMENT
  by default). Panels, all from existing seams: overview (name, mode,
  instance, runtime, uptime, address, surfaces, static mounts, metrics/tracing
  on/off); traffic (in-flight, req/s and status classes from the server
  counters, the latency histogram and error codes from the meter when
  `server.metrics` is on); inventory (routes with version and surface, socket
  commands, channels, jobs with schedule / last run / running-now and a
  guarded "run now" → `triggerJob`); a live feed of the last N invocations
  (the one new primitive: a bounded ring buffer fed from the access-log path,
  on only while mounted) streamed over a `__rapid.dashboard` channel; recent
  errors by code with request ids. Access under the cluster model: entering
  the cluster or node secret unlocks it; the master's dashboard shows the
  fleet.

## Backlog

- **Extract to lower packages** (from the 2026-08-23 full-pass review; each
  is its own cross-package PR — release the lower package, then rapid
  consumes). Candidates still in rapid, each self-contained:
  `utils/resolveClientAddress.ts` → utils (sibling of `isPublicIP`);
  `utils/compose.ts` → utils (`ModuleRuntime` keeps its own sync-through
  onion on purpose: invoke contexts are not `Context`s and a sync `@Use`
  chain must stay promise-free); `utils/streams.ts` → a compat stream
  subpath; `parseCookies`/`serializeCookie` in `utils/cookies.ts` →
  compat/http; `utils/pickEncoding.ts` → compat/http beside `negotiate`; the
  TC39 decorator-metadata side-table in `decorators/registry.ts` → utils;
  `pinHidden` (`utils/hiddenSlot.ts`) → ambient.

### UI follow-ups

- **`live: 'sse'`** — a Server-Sent-Events variant of the live bridge
  (server: one `ctx.sse()` endpoint fanning in from `app.channel()`s;
  client: `EventSource`, same `rapid:push`/`rapid:live` events) so live
  updates work on Cloudflare Workers, where the rpc WebSocket cannot
  listen. Documented as a known limit in docs/Rapid-UI.md until then.
- **`cores` registry** (YAML `ui.core: <name>` selecting the document
  per replica) — deferred from the tiers round: chrome moved to the
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
option sugar (`{ cache: { ttl, tags } }`) over the decorators' `middleware`
option.

### metro-man tidy-up (PINNED 2026-09-08 — discuss after caching)

A standard way for middleware to record their own counters (rate-limit
rejections, idempotency replays, cache hit ratio) instead of ad-hoc
`ctx.meter` use, and one clock: the meter's histogram measures the onion
while the access line and `headers.responseTime` measure arrival→finalize
from the transport's `started` — unify on the latter.

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

### Scaling & ops

- **Distributed deployment & management. 🧭 architecture converged 2026-08-22.**
  A **master + workers** model, built as modules/middleware/routes on the one
  core seam that already exists (`app.instanceId` + `app.cluster`):
  - A single app-agnostic **MASTER** (control-plane, never serves external
    traffic) and N **WORKERS** (the full app). Workers dial the master over an
    authed WS (shared secret on upgrade), register, and send pings + stat
    summaries + a sampled log tail.
  - **Refined 2026-09-08 (user):** ONE master container, no master replica
    for now. The master's job is to track the workers, designate the job
    node, and MAYBE push config updates dynamically. Joining and viewing go
    through endpoints authenticated by a **cluster secret** (per cluster) or
    a **node secret** (per worker). The dashboard rides the same secrets: it
    is not visible until the cluster or node secret is entered; on the master
    it shows the fleet (`ClusterSnapshot`), on a worker it shows that node.
    Not fully designed yet — the idea, not the contract.
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
    upgrade-auth/reconnect); net-new build = the WS log-tail handler + master
    pipeline, a `/metrics` aggregator, leader designation + `onlyIfCronLeader`,
    and the views. **Rejected:** worker-side leader election / peer mesh /
    cacher-lease — the static master removes the need.
  - Later: drain-aware rolling deploys, fleet cron pause / remote trigger,
    config & feature-flag broadcast, alerting webhooks, a TUI `reqId`→trace
    jump, multi-master HA via rpc's Redis `PubSubAdapter`.

## Parked

- **JSX authoring runtime — PARKED (beta feedback 2026-09-04, user call).**
  The only "SFC-like" option consistent with "the type checker is the
  template compiler": a `ui/jsx-runtime` producing the same `Html`
  (escape-by-default, `raw` the one opt-out), typed props for free, no
  tooling of ours (every runtime compiles JSX). A few hundred lines +
  intrinsic-element types + a second authoring syntax to document.
  Mustache/SFC compilers rejected (a language + a Workers file-loading
  story, and the typed handler↔view contract is lost). Decide on its own
  merits, not as a reaction to one report.
- Browser as a rAPId **listener** surface — permanently out of scope (no
  server socket). Distinct from the UI layer, which SERVES pages to browsers.
  Cloudflare Workers is a best-effort HTTP-only target via `app.fetch()`: no
  filesystem, no socket commands, jobs via Cron Triggers.
