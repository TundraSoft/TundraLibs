# TundraLibs — Capability Roadmap

Proposed new packages that extend the TundraLibs suite, consolidated from the
two adversarial-review ideation passes. **Nothing listed here is built** — this
is a scoped roadmap for deciding what to take on. Capabilities from the original
passes that have since shipped are removed, not struck through: `rapid`
(the HTTP keystone, formerly "rAPId/outpost"), `ambient`, `tracer`, and the two
fold candidates that landed inside rapid — OpenAPI generation (`blueprint` →
`openapi()`/`docs()`) and health probes (`vitals` → `health()`/`ready()`).
Last pruned **2026-09-22**.

**Every capability is listed as its own standalone package.** Where the review
discussion flagged that a capability _could_ instead be a module, a middleware,
or a fold into another package, that is captured under **Notes / open
questions** — the capability is not pre-merged; the decision is deferred.

---

## Dependency chains (the only hard sequencing constraints)

- **relay → herald, cadence** — both ride the queue for async fan-out / scheduling.
- **governor ⊇ fuse** — governor absorbs fuse's breaker/retry; build one, not both.

**Keystone:** **relay** (async/background anchor) — the HTTP keystone, `rapid`,
is shipped. Most remaining capabilities gain value once relay exists. A sensible
build order is: `relay → governor → silo → keyring → herald → cadence`, with
`strata`/`fuse` optional.

Everything not in a chain above is independent and can be built in any order.

---

## Capabilities

### relay — background job / message queue _(keystone)_

Background **job / message queue** + worker pool with swappable durable engines
(memory, Redis, Postgres, SQLite, SQS-style HTTP): enqueue/consume, ack/nack,
delayed & scheduled delivery, retry-with-backoff, concurrency limits, and
dead-letter handling — built in the `cacher`/`drivers` manager + `AbstractEngine`
mold. Payloads validate through `guardian`; at-least-once pairs with a `norm`
transactional-outbox engine. Fills the async/background-work gap — nothing in the
suite moves work off the request path today.

- **Composes:** drivers, norm, cacher, guardian, slogger
- **New-pkg prereq:** none
- **Notes / open questions:** Keystone for the async side — `herald` and
  `cadence` both ride it. `cadence`'s scheduling could live here as relay's
  scheduling half instead of a separate package (see cadence).

### silo — object / blob storage

Object/**blob storage** abstraction with swappable engines (local FS via
`compat/file`, in-memory, S3, GCS, Azure Blob) behind one put/get/stat/list/
delete API, mirroring the `cacher`/`drivers` pattern; presigned URLs, streaming
bodies, and content-addressed keys are first-class. `crypt` supplies envelope
encryption-at-rest (`norm` already does at-rest column encryption, so the
primitive exists). The suite covers cache, DB, and queue-adjacent concerns but
has nowhere to put files — silo is that missing primitive.

- **Composes:** restler (cloud transport), crypt, id, compat/file, slogger
- **New-pkg prereq:** none
- **Notes / open questions:** none material — cleanly standalone.

### herald — messaging / notification dispatch

Transactional **messaging / notification** dispatch: email (SMTP + provider APIs
— SES, SendGrid, Postmark, Mailgun), SMS, webhooks, and push, behind one `send`
API with swappable provider engines (thin `restler` subclasses), templating, and
delivery events. Payloads validate via `guardian`; async fan-out rides `relay`
for retries and dead-lettering. Rounds out the outbound-communication side
`restler` enables but doesn't package.

- **Composes:** restler, guardian, slogger
- **New-pkg prereq:** relay (for durable async fan-out)
- **Notes / open questions:** Synchronous send works without relay; the
  retry/dead-letter guarantees are what pull in relay.

### keyring — secrets provider

**Secrets-provider** abstraction: read secrets uniformly from env, `.env`/Docker
secrets, files, or a remote store (Vault / cloud KMS via `restler`) under one
resolver API, with optional envelope decryption via `crypt` so encrypted-at-rest
secrets are transparent to callers. Extends what `utils`' `envArgs` starts —
adds caching (`cacher`), lazy resolution, and rotation hooks (`crypt` already
ships `rotateKey`). Centralizes the credential handling that `drivers`, `pact`,
and `restler` each do ad hoc today.

- **Composes:** crypt, utils, cacher, restler
- **New-pkg prereq:** none
- **Notes / open questions:** none material — cleanly standalone; genuinely
  cross-cutting (used by drivers/pact/restler).

### governor — rate-limiting + circuit-breaker

**Rate-limiting + circuit-breaker** primitives: token-bucket / sliding-window /
fixed-window limiters plus a breaker state machine, with a pluggable store so
counters are process-local (memory) or cluster-wide (Redis via `cacher`). A
storage-agnostic _kernel_ — it decides, you supply the store and key function.
Mounts as `radrouter`/`rpc`/`rapid` middleware (inbound protection) and wraps
`restler`/`drivers` (outbound resilience). `rapid` already ships a
fixed-window `rateLimit()` middleware over an atomic `increment` hook (memory
default, any shared store); `rpc` names rate-limiting as a use case but ships
none, and nothing covers the outbound side.

- **Composes:** cacher, radrouter, rpc, restler, drivers
- **New-pkg prereq:** none
- **Notes / open questions:** _This is a "just middleware?" candidate — and the
  answer is no._ The **value is the framework-agnostic decision kernel**
  (algorithm + store), reused inbound (as middleware), outbound (as a call
  wrapper), and inside `relay` workers — so it should **not** stay buried
  inside rapid's middleware, or `rpc` and outbound code couldn't reuse it.
  rapid's `rateLimit()` becomes a thin adapter over the kernel. **Absorbs
  `fuse`** (build governor's breaker/retry once).

### fuse — resilience primitives

**Resilience primitives** — retry with backoff/jitter, timeout, circuit-breaker,
bulkhead — as small composable wrappers around any async call. Pure algorithmic
logic, zero dependencies.

- **Composes:** none (zero-dep)
- **New-pkg prereq:** none
- **Notes / open questions:** _Another "just middleware?" candidate — and again
  no:_ fuse wraps **outbound** calls (a `restler` request, a `drivers` query) and
  arbitrary async functions; the inbound request pipeline never sees it, so it is
  not middleware. But it is tiny and overlaps governor's breaker/retry —
  **recommendation is to fold it into `governor`** rather than ship separately.
  Keep standalone only if a zero-dep resilience micro-package is wanted on its
  own.

### cadence — job scheduler

The **cluster half** of scheduling: a pluggable persistence/lock store so only
one instance fires a given job (leader election via `cacher` or a `drivers`
backend), plus enqueueing scheduled work onto `relay`. The scheduler itself is
shipped — `cronus` (cron expressions, run-once/run-now, overlap prevention) and
rapid's `@JOB` over it — but both are per-process: N replicas fire every job N
times.

- **Composes:** cronus, cacher, drivers, metro-man
- **New-pkg prereq:** relay (to enqueue scheduled work)
- **Notes / open questions:** **Overlaps `relay`'s scheduling** (round-1 folded
  scheduling into relay; round-2 split it out) **and rapid's cluster design**,
  whose master-designated cron leader (`onlyIfCronLeader`, see
  `packages/rapid/ROADMAP.md`) solves single-fire for rapid apps without a lock
  store. Decide whether anything is left for a standalone package once that
  ships — likely only the non-rapid `cronus` + lock-store case.

### strata — standalone schema-migration runner

Standalone **schema-migration runner** for the data layer: ordered, versioned
up/down migrations with a tracked migrations table, locking against concurrent
runners, and dry-run/diff output; executes DDL through `drivers` and authors
migrations via `oql`'s builder. Ships a small Deno/Bun/Node CLI.

- **Composes:** norm, oql, drivers
- **New-pkg prereq:** none
- **Notes / open questions:** **Overlaps norm's existing `Migrator`, but a
  different paradigm.** norm's Migrator is **state-based / declarative** (snapshot
  your entity schema; the diff between snapshots _is_ the migration; coupled to
  norm). strata is **imperative / version-based** (hand-written ordered up/down
  files, Flyway/Alembic style; decoupled from norm, for raw `drivers`/`oql`
  users). Only earns its place if there is demand for non-norm imperative
  migrations. **Alternatives:** drop it, or reframe as "extract norm's Migrator
  into a standalone engine that norm itself re-consumes" (one engine, two entry
  points) rather than a second, differently-shaped tool.

---

## Cross-cutting engineering

Not new packages — monorepo-wide hardening passes that touch existing packages.

### Browser-bundlability — one line in `compat` _(do this first)_

**14 of the 20 package barrels cannot be bundled for the browser today**, and
every one fails at the same site: the `cloudflare:sockets` dynamic import in
`compat/net.ts`. The `as string` cast there hides the specifier from
TypeScript's module resolution but **not** from the bundler, which tries to
resolve it and aborts. Measured 2026-09-22 with `deno bundle --platform
browser <pkg>/mod.ts`:

| Bundles today (6)                          | Fails (14)                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| ambient, doctor, drivers, id, oql, restler | cacher, compat, cronus, crypt, guardian, metro-man, norm, pact, radrouter, rapid, rpc, slogger, tracer, utils |

Subpaths split the same way: `rapid/ui` and `rapid/types` bundle, while
`rapid`'s `mod`, `endpoints`, `middlewares`, `decorators` and `testing` do not.

The failing list includes packages with no business touching a socket —
`guardian` (validation), `crypt` (WebCrypto), `radrouter` (routing),
`metro-man` (metrics) — which is the tell that this is one plumbing defect,
not fourteen design problems.

**Verified fix:** make the specifier non-literal so the bundler cannot resolve
it statically (`['cloudflare', 'sockets'].join(':')`). Tested 2026-09-22: all
**20** barrels then bundle, `deno check` on the compat barrel is clean, and
`compat/net.test.ts` passes (64 steps). One package, one line, **non-breaking**
— no consumer changes, nothing relocated.

- **Composes:** compat
- **New-pkg prereq:** none
- **Notes / open questions:** The one thing to confirm before shipping is the
  **workerd** direction: with the specifier computed, a bundler targeting
  workerd can no longer see the dependency statically, so `cloudflare:sockets`
  must still resolve at **runtime** there (it does under `nodejs_compat`, but
  prove it on a real deploy, not by reasoning). Also note the existing
  `check:edge-safety` import-smoke check is scoped to **drivers only**
  (`deno task --cwd packages/drivers check:edge-safety`, run in CI), which is
  exactly why this regressed everywhere else unnoticed — **extend it
  repo-wide** in the same PR so the fix stays fixed.

### Barrel-pull hygiene — subpath relocation _(the breaking half)_

What is left **after** the bundlability fix above, and genuinely breaking:
a consumer importing a barrel for one _pure_ symbol still drags the whole
runtime-only stack into its static import graph. Bundlable, but fat — and the
reason a pure package's graph reaches `compat/net` at all.

- **compat** barrel re-exports `net` / `udp` / `webserver` / `websocket`
  (→ `node:net`/`node:tls`/`node:dgram`/`node:http`/`node:https`).
- **utils** barrel re-exports `getFreePort` (→ `compat/net`), `envArgs`,
  `isInSubnet` / `isPublicIP` / `isSubnet`. This is the specific hop that puts
  `compat/net` in the graph of every package importing `@tundralibs/utils`
  for `BaseError` or `Options` — rapid alone does so from nine modules.
- **cronus** exports only `.` / `./errors` / `./types` — no `./schedule`. So
  `rapid`'s `Application.ts` and `decorators/job.ts`, which import
  `parseSchedule` for decoration-time validation, statically pull the whole
  `Cronus` scheduler and its timers. Called out during the rapid audit
  (2026-09-20) and deferred then as "a cronus PR"; this is that PR.

**The shipped precedent is `norm`.** It already splits `./core` +
`./engines/<dialect>` and documents the pattern in its own barrel header, so
an edge consumer takes `@tundralibs/norm/core` plus one engine. Its `.` barrel
stays deliberately unbundlable-by-design (it registers every dialect) — the
escape hatch is the point, not barrel purity. Relocating compat's and utils'
net symbols onto subpaths is the same move.

- **Composes:** compat, utils, cronus (+ every consumer)
- **New-pkg prereq:** none
- **Notes / open questions:** **Breaking** (consumers of relocated symbols
  switch to subpaths), so a deliberate coordinated pass, not incremental —
  and worth far less urgency now that bundlability is severable from it. Do it
  **after** the one-line fix, never as a prerequisite for it. Drivers was
  already made edge-clean this way, surgically, and is the worked example.

---

## Summary

| Package  | New-pkg prereq | Fold/decision flagged?                                    |
| -------- | -------------- | --------------------------------------------------------- |
| relay    | —              | keystone                                                  |
| silo     | —              | —                                                         |
| herald   | relay          | —                                                         |
| keyring  | —              | —                                                         |
| governor | —              | absorbs `fuse`; rapid's `rateLimit()` becomes its adapter |
| cadence  | relay          | overlaps relay scheduling and rapid's cluster cron leader |
| strata   | —              | overlaps norm Migrator                                    |
| fuse     | —              | fold candidate → `governor`                               |

| Cross-cutting pass   | Size                                  | Breaking? |
| -------------------- | ------------------------------------- | --------- |
| Browser-bundlability | one line in `compat` + CI             | no        |
| Barrel-pull hygiene  | compat, utils, cronus + all consumers | yes       |

_Capabilities are proposals only — nothing under **Capabilities** is built, and
shipped items are removed (see the top). **Cross-cutting engineering** is a
different kind of entry: those describe measured defects in shipped code, with
the measurement date and command recorded so the numbers can be re-run._
