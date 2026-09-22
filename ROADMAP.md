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

### Browser-bundlability — **shipped** 2026-09-22

Kept here as the record of what the gate now protects, and removed from the
pending list.

**14 of the 20 package barrels could not be bundled for a browser**, every one
aborting on the same site: the `cloudflare:sockets` dynamic import in
`compat/net.ts`, whose `as string` cast hid the specifier from TypeScript's
module resolution but not from a bundler. The casualties included `guardian`,
`crypt`, `radrouter` and `metro-man` — packages with no business touching a
socket, which is what a missing gate looks like rather than fourteen design
problems.

Fixed in **compat 2.7.4** by building the specifier at runtime, so a bundler
has nothing to resolve while workerd still resolves it at load. All barrels
bundle now, and `deno task check:bundle` gates every published export of every
package, failing closed, with five carve-outs named and reasoned
(`drivers/engines`, `drivers/sqlite`, `norm/engines/sqlite`, `norm/cli`,
`rapid/cli` — native bindings and filesystem CLIs). It runs in PR checks.

**The lesson worth keeping:** `check:edge-safety` existed the whole time but is
scoped to `packages/drivers` alone, so it protected one package while the other
nineteen regressed unnoticed. A gate that covers one package is a gate that
tells you nothing about the others.

### Barrel-pull hygiene — narrow the imports _(in progress, non-breaking)_

Everything bundles now; what remains is **size**. A barrel is one module graph,
so importing it for a single symbol pulls the whole package — and because
packages import each other's barrels, the cost compounds.

Measured with `deno info`:

| Import                        | Modules in graph |
| ----------------------------- | ---------------- |
| `@tundralibs/utils`           | 158              |
| `@tundralibs/utils/syslog`    | 2                |
| `cronus/schedule.ts` (before) | 172              |
| `cronus/schedule.ts` (after)  | 100              |

**This does NOT need a breaking change.** The approach is additive: give every
module a subpath, then narrow each package's own imports onto them. The barrels
keep every export they have.

Shipped so far: **utils 1.4.0** exports every module under its own name in both
manifests (the three most-imported symbols in this workspace —
`SyslogSeverities`, `envArgs`, `loadConfig` — previously had no subpath at all,
so the README's long-standing "prefer subpaths" advice could not be followed).
**cronus 1.1.0** adds `./schedule` and `./Cronus`.

**The lesson from cronus:** adding the subpath changed nothing on its own
(172 → 172 modules). It only paid off once cronus's _own_ `errors/Base.ts`
stopped importing the utils barrel (→ 100). A subpath is worthless if the
package behind it still drags the barrel.

Still to do, each its own PR, none breaking:

- **~109 bare-barrel imports across 16 packages** still to narrow — the biggest
  holders are slogger (32 files), drivers (26), then rapid, oql and norm (9
  each). `rapid` additionally still imports `parseSchedule` from the cronus
  barrel; it can move to `cronus/schedule` now that 1.1.0 is out.
- **compat's barrel** re-exports `net` / `udp` / `webserver` / `websocket`. Its
  subpaths already exist, so this is consumer-side narrowing, not relocation.
- **`BaseError` pulls 71 modules of `@std/path`**, via `compat/file`, because it
  reads source files to build rich stack traces. Every error class in the suite
  pays that. Worth a decision: keep it, make the source-reading lazy, or move it
  behind a flag. Not a barrel problem — a design one.

**The precedent is `norm`**, which already splits `./core` + `./engines/<dialect>`
and documents it in its own barrel header. Its `.` barrel stays deliberately
unbundlable-by-design because it registers every dialect; the escape hatch is
the point, not barrel purity.

- **Composes:** every package (+ compat, utils, cronus as the providers)
- **New-pkg prereq:** none
- **Notes / open questions:** Only a _later, optional_ major would slim the
  barrels themselves. Nothing here requires it, and the measured win comes from
  narrowing consumers, not from removing exports.

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
