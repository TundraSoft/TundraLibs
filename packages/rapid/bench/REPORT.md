# rAPId perf review vs. oak (Deno) and express (Node)

Scratch report — throwaway, see [README.md](README.md). Bench scripts live
alongside this file (`rapid-server.ts`, `oak-server.ts`, `express-server.mjs` —
see the README for the `npm install --no-workspaces` step express needs).

All three servers expose the same two routes and nothing else — no middleware,
no modules, no validation — to measure framework baseline overhead, not
example-app logic:

```
GET /             -> { ok: true }
GET /users/:id    -> { id: <id> }
```

`autocannon -c 50 -d 10`, same machine, same-runtime pairings (fair comparison:
Deno vs Deno, Node vs Node).

## Results (avg req/s over a 10s run)

| Runtime | Framework | `GET /` | `GET /users/:id` |
| ------- | --------- | ------: | ---------------: |
| Deno    | rapid     |  59,091 |           52,095 |
| Deno    | oak       |  83,386 |           83,738 |
| Node    | rapid     |  31,209 |           28,856 |
| Node    | express   |  43,167 |           42,128 |

oak is ~1.4-1.6x rapid's throughput on Deno; express is ~1.4x rapid's on Node.
Latency at this concurrency is sub-millisecond to low-single-digit-ms for all
four — the gap only shows up as reduced max throughput, not as user-visible
latency at normal load.

## Why: per-request overhead sources (zero middleware, zero modules)

Investigated the hot path directly (not guessing from the numbers). In order of
expected impact:

1. **`ambient.run()` entered twice per request** `transports/Transport.ts:48`
   and `transports/HTTPTransport.ts:284-287` each call
   `ambient.run({ ...seed }, fn)` for log-correlation context — two separate
   `AsyncLocalStorage.run()` entries plus two object-spread allocations, even
   though nothing in a zero-middleware handler reads that context.

2. **Unconditional client-IP classification** `context/HTTPContext.ts:99-107`
   calls `resolveClientAddress` in every context's constructor. Even with
   `trustProxy: false` (default), it still runs `isPublicIP()`
   (`utils/isPublicIP.ts:99-141`) — a regex test plus a linear scan over 14 CIDR
   ranges — for a value (`ctx.remoteAddress`) most handlers never read.

3. **The middleware onion is rebuilt from scratch every request**
   `transports/Transport.ts:52` calls `compose(middlewares)` fresh per
   invocation instead of once at route-registration time.
   `utils/compose.ts:29-62` allocates a new outer closure plus per-call
   `dispatch`/`next` closures for a chain whose shape never changes between
   requests on a given route.

4. **Node-only Fetch-API translation tax** — see the dedicated section below for
   the full explanation; this is the one deferred to a separate
   `packages/compat` PR.

**Ruled out**: `utils/serializeResponse.ts` (two `Set.has()`, one `typeof`, one
`JSON.stringify` — cheap, and oak pays the same `Response`-construction cost).
radrouter's `find()` (`packages/radrouter/RadRouter.ts:776-964`) is a tight
integer-cursor trie walk with no regex/`split()` on the hot path — likely
_cheaper_ than path-to-regexp matching, not the bottleneck.

## Take

rAPId's overhead here isn't a routing or serialization problem — it's a handful
of "runs even when nobody asked for it" costs (dual ambient-context entry,
always-on IP classification, per-request middleware-chain recomposition) stacked
on top of the web-standard Fetch API surface, which is structurally pricier on
Node than raw `http` (a cost express doesn't pay, and oak _does_ pay yet still
wins — so it isn't purely "Fetch API tax", the Deno lane shows rAPId has its own
overhead independent of that).

## Fixes applied (#1-#3), then re-measured

#4 (the Node compat/WebServer Fetch-API tax) is untouched — separate package,
separate PR, per the repo's one-package-per-PR rule; deferred to a follow-up
decision.

- **#1 — one `ambient.run()` per invocation, not two.** `Transport._invoke` now
  takes an optional `finalize` callback that runs LAST, still inside its one
  ambient scope — `HTTPTransport.__handle` passes `__finalize` there instead of
  opening a second `ambient.run()` after `_invoke` returns. Verified safe: both
  scopes always carried the exact same immutable `ctx.requestId`/`ctx.action`
  (`public readonly`, never reassigned after construction), so collapsing them
  changes zero observable behavior. JOB/SOCKET don't pass `finalize` — unchanged
  either way, since they never had the second wrap in the first place.
- **#2 — lazy client-IP resolution.** `HTTPContext.remoteAddress`/
  `remoteAddrList` are now getters that resolve (and cache) on first access
  instead of running `resolveClientAddress`/`isPublicIP` unconditionally in the
  constructor. Confirmed by grep that outside `rateLimit.ts` (opt-in middleware)
  nothing else reads either property — a bare 2-route app now never resolves it
  at all.
- **#3 — middleware chain composed once, not per request.** Each transport now
  calls `compose()` ONCE per route/command (`HTTPTransport.start()` precomputes
  and caches per-entry via a `Map` keyed by the route/command object) or once
  per transport instance (`JOBTransport`, lazily — jobs share one universal
  chain, and `triggerJob` can fire through a throwaway transport before
  `start()` ever runs). `_invoke` now takes the pre-composed runner directly
  instead of a raw middleware array.

All three are `packages/rapid`-only. Verified: `deno check` clean, full suite
green on Deno (25 files/221 steps), Bun (206/206), and Node (206/206); the
WebSocket+cron live exploration script re-run clean with identical output.

### Re-measured (same machine, same `autocannon -c 50 -d 10`, immediately

### after re-running oak/express too — this machine has real run-to-run

### noise, see caveat below)

| Runtime | Framework        | `GET /` | `GET /users/:id` |                rapid as % of baseline |
| ------- | ---------------- | ------: | ---------------: | ------------------------------------: |
| Deno    | rapid (before)   |  59,091 |           52,095 |                  70.9% / 62.2% of oak |
| Deno    | rapid (after)    |  59,888 |           53,436 |     **87.2% / 76.9%** of oak (re-run) |
| Deno    | oak (before)     |  83,386 |           83,738 |                                     — |
| Deno    | oak (re-run)     |  68,650 |           69,472 |                                     — |
| Node    | rapid (before)   |  31,209 |           28,856 |              72.3% / 68.5% of express |
| Node    | rapid (after)    |  33,227 |           29,825 | **81.3% / 75.6%** of express (re-run) |
| Node    | express (before) |  43,167 |           42,128 |                                     — |
| Node    | express (re-run) |  40,848 |           39,460 |                                     — |

**Caveat — this machine is noisy.** oak's re-run throughput is ~15-18% _lower_
than its original run, express's is ~5-6% lower, with nothing in either server
changed — background load (VS Code TS servers, deno lsp, etc. were all running)
moves these numbers run-to-run more than the fixes themselves do. rapid's own
before/after absolute numbers land inside that same noise band (+1-3% on Deno,
+4-7% on Node), so **don't read the raw before/after rapid row as "the fix
bought 3-7%"** — that's not distinguishable from noise on this box.

The more reliable signal is the **relative** column: rapid's throughput _as a
percentage of oak/express measured in the same run_, which controls for shared
system load since both processes were tested under the same conditions in that
pass. On that measure the gap consistently closed by 10-16 percentage points in
every one of the four before/after pairs — a real, repeatable direction even
though the noisy machine makes the exact magnitude imprecise. A clean
re-measurement on an idle/dedicated machine (or `hyperfine`-style repeated
sampling) would tighten this; not done here.

## #4 explained: the Node-only Fetch-API translation tax

**Why it's Node-only.** Deno and Bun both ship a Fetch-API-native HTTP server
(`Deno.serve`, `Bun.serve`) — the runtime hands the handler a real `Request` and
expects a real `Response` back, no translation needed. Node's `http` module
predates the Fetch API entirely: it hands you an
`IncomingMessage`/`ServerResponse` pair instead. `packages/compat`'s `WebServer`
is the cross-runtime abstraction every package (not just rapid) builds on to
accept/return Fetch-standard `Request`/`Response` everywhere — the "golden rule"
in this repo's `CLAUDE.md` ("every package runs identically on Deno, Bun, and
Node... go through `@tundralibs/compat`"). On Node, honoring that contract means
compat itself has to manufacture `Request`/`Response` objects from Node's native
types — work oak never pays (Deno hands it real ones) and express never pays (it
works with `IncomingMessage`/`ServerResponse` directly, no Fetch layer at all).

**Three concrete costs, all in `packages/compat/webserver/WebServer.ts`:**

1. **Inbound translation** — `__nodeReqToFetchRequest` (line 2353-2387): builds
   a `new URL(...)` from the `Host` header, a `new Headers()` populated by
   iterating every inbound header and calling `.append()` one at a time (line
   2361-2369), and wraps the result in `new Request(url, {...})` (line 2380).
   For non-GET/HEAD requests it also wraps the body in a `new ReadableStream`
   bridging Node's event-based `req.on('data'/'end'/'error')` into a stream
   (line 2372-2378) — not exercised by our GET-only bench, but real cost on
   write routes.
2. **Outbound streaming** — `_startNodeServer`'s response handling (line
   1924-1951): instead of writing the response body in one shot, it calls
   `response.body.getReader()` and recursively pumps chunks via
   `reader.read().then(...)` → `res.write(value)` → `pump()`, ending with
   `res.end()`. Even for a single-chunk JSON body (our bench's case), that's a
   `ReadableStream` reader plus at least one promise-resolution round trip
   standing between "the bytes are ready" and "the socket has them" — express
   calls `res.end(buffer)` directly, no stream involved.
3. **Discarded per-request metadata** — `_processRequest` (line 1253-1257)
   unconditionally mints `crypto.randomUUID()` and `new Date()` into
   `requestInfo` on every single request, plus active/peak request-count
   bookkeeping (line 1249-1251). `HTTPTransport.__handle` only reads
   `info.remoteAddress` from that object (rapid mints its own request id
   separately via `Application.newRequestId()`) — so the UUID and Date are
   computed and thrown away, every time, for every rapid request on Node.

**Why this isn't a quick fix like #1-3.** `WebServer` is shared infrastructure —
every package that needs an HTTP server goes through it, not just rapid. Any
change here has blast radius across the whole monorepo, and per this repo's "one
package per PR" rule it needs its own PR, review, and test pass independent of
rapid's. It's also not a pure oversight: the Fetch-API-first contract is what
lets rapid (and anything else built on compat) avoid Node-specific code paths
entirely — the cost being discussed IS the price of that portability, paid once,
in one shared place, rather than by every consumer separately.

**What could actually reduce it** (none of these are one-liners; not attempted
here):

- Make `requestId`/`requestTime` lazy (computed on first access) rather than
  unconditional — same spirit as the `remoteAddress` fix already shipped, but in
  code every `WebServer` consumer relies on, so the bar for "is this actually
  unused" is higher.
- Detect an already-fully-materialized response body (rapid's
  `serializeResponse` already has the complete string/buffer in hand, not a
  genuine stream) and `res.end(buffer)` directly instead of tearing it into a
  `ReadableStream` round trip — real complexity is distinguishing that case from
  an actual streamed/proxied body without breaking the latter.
- Skip the `Headers()`/`.append()` loop in favor of passing a `HeadersInit`
  shape directly to `new Request()` — plausible small win, but needs care around
  multi-value headers (`set-cookie`, repeated `x-forwarded-for`) that
  `.append()` currently handles correctly.
- The one option NOT on the table: bypassing compat and having rapid drive
  Node's `http` module directly (what express does) — that breaks the
  cross-runtime golden rule this whole monorepo is built on, trading a shared,
  once-paid cost for Node-specific code in every consumer.

## #4 EMPIRICALLY VERIFIED — and the finding it corrects

Everything above was reasoned from reading the code. Asked directly: is that
actually a measured cost, not just a plausible-sounding one? It wasn't — fixed
by isolating each layer with its own bench server and measuring all four
independently: raw runtime HTTP (`node-http-server.mjs`, `raw-deno-server.ts`) →
bare `compat` `WebServer` with no rapid on top (`compat-server.ts`, same two
routes hand-routed with a plain `if`/regex, no `Application`/router/context) →
full rapid → oak/express.

| Runtime | Layer                    | `GET /` | `GET /users/:id` |      % of raw |
| ------- | ------------------------ | ------: | ---------------: | ------------: |
| Node    | raw `http` (floor)       |  62,553 |           61,863 |          100% |
| Node    | compat `WebServer` alone |  40,781 |           39,731 | 65.2% / 64.2% |
| Node    | rapid (full)             |  33,227 |           29,825 | 53.1% / 48.2% |
| Node    | express                  |  40,848 |           39,460 | 65.3% / 63.8% |
| Deno    | raw `Deno.serve` (floor) |  83,203 |           83,424 |          100% |
| Deno    | compat `WebServer` alone |  74,947 |           73,216 | 90.1% / 87.8% |
| Deno    | rapid (full)             |  59,888 |           53,436 | 72.0% / 64.0% |
| Deno    | oak                      |  68,650 |           69,472 | 82.5% / 83.3% |

**#4 is real and confirmed** — compat's `WebServer` alone costs ~35% of raw
throughput on Node (the Fetch-API translation tax), vs. only ~10-12% on Deno (no
translation needed there — that residual ~10-12% is compat's _own_ per-request
bookkeeping: `_processRequest`'s `crypto.randomUUID()`/
`new Date()`/metrics/event-emission, which runs on EVERY runtime, not just Node
— see finding #3 in the discarded-metadata list above).

**But this table also corrects the original framing.** I'd attributed "rapid
trails express mostly because of the Node Fetch tax." That's not what the
isolated numbers show: **express pays almost the identical "framework tax"** —
65.3%/63.8% of raw, statistically indistinguishable from compat-bare's
65.2%/64.2%. So the compat translation cost is real, but it does NOT explain why
rapid is slower than express — express has its own comparable overhead (routing,
middleware stack) that lands in the same place. What DOES separate rapid from
both baselines, on EITHER runtime, is **rapid's own layer on top of the
transport** — the drop from compat-bare to full-rapid is 12.1-16.0 points on
Node and 18.1-23.8 points on Deno, where there's barely any compat tax to blame.
That's context construction, radrouter dispatch, response serialization, the
tracer/ambient wiring, etc. — genuinely rapid's own cost center, bigger in
percentage-point terms on Deno than compat's entire Node-side translation tax.
Not root-caused further here (would need a flamegraph to attribute within that
layer); flagging as the more consequential follow-up target over #4 itself.

## Ruled out: config + logging aren't on the hot path

Asked-and-answered: does `Application`'s `config` (loaded `ConfigType`) or `log`
(the `Slogger` instance) contribute to the residual gap? Tested directly rather
than guessed — temporarily stubbed both out in `Application.ts`'s constructor
(`this.config = {} as ConfigType`, `this.log` replaced with no-op methods,
skipping `Config({})`/`new Slogger({...})` entirely), re-measured, then reverted
(not committed, not left in the working tree).

| Runtime | Route            | With config+log | Without |                                                 Delta |
| ------- | ---------------- | --------------: | ------: | ----------------------------------------------------: |
| Deno    | `GET /`          |          59,888 |  59,769 |                                         −0.2% (noise) |
| Deno    | `GET /users/:id` |          53,436 |  53,863 |                                         +0.8% (noise) |
| Node    | `GET /`          |          33,227 |  33,420 |                                         +0.6% (noise) |
| Node    | `GET /users/:id` |          29,825 |  30,708 | +3.0% (still inside the noise band established above) |

**Conclusion: no measurable effect.** Confirmed by reading the code first, not
just the numbers — `this.config`/`this.log` are constructed ONCE at
`Application` startup; nothing in the zero-middleware request path reads
`ctx.app.config` at all, and the only `this._app.log.*` calls in the transports
live inside error-handling branches (`Transport._invoke`'s catch block,
`__finalize`'s catch, `cleanup()`'s catch) that a clean 200 response never
enters. Slogger's `contextProvider` (`__logContext`) only runs when a log line
is actually emitted — never, on this bench app. The residual gap to oak/express
is NOT explained by config/logging infrastructure being present; it's consistent
with the Node Fetch-API translation tax (#4, still untouched) plus the Deno-side
overhead that remains unaccounted for and would need deeper profiling (a
flamegraph run, not more source-reading) to pin down further.

## Parity plan: rapid == oak / express / fastify without losing features

Question (2026-08-20): can rapid match or beat oak (Deno) and express/fastify
(Node) while keeping everything built — ambient log correlation, requestId
mint+echo, tracer seam, middleware onion, error disclosure, lazy args,
per-invocation state? Answer: **oak parity on Deno yes; beating express on Node
yes; fastify parity on Node no** (fastify measures ≈ raw `node:http` itself —
see below — and matching that under the Fetch-standard request contract is not
credible without dropping that contract, which IS a functionality loss).
Everything below is measured, not inferred: `_scratch/perf-attribution.bench.ts`
(in-process variants + component costs) and fresh autocannon runs including
fastify.

### The new E2E anchor: fastify ≈ raw

Node lane, `autocannon -c 50 -d 10`, this machine (single-threaded, so µs/req =
1/throughput):

| server      | req/s (≈)  | µs/req | layer over raw |
| ----------- | ---------- | ------ | -------------- |
| raw http    | 62k        | 16.1   | —              |
| **fastify** | **61-63k** | 16.2   | **≈ 0**        |
| express     | 40.5k      | 24.7   | +8.6µs         |
| compat-bare | 40.8k      | 24.5   | +8.4µs         |
| rapid       | 33-37k     | ~28.6  | +12.5µs        |

fastify is statistically indistinguishable from raw `node:http` at this payload
size (an earlier 4-servers-up round showed fastify decaying 64k→50k across
rounds — thermal/system drift, not fastify; the clean 2-server re-run pinned it
at raw parity). express ≈ compat-bare exactly: the Fetch translation tax equals
express's entire framework. Deno lane (prior runs): raw 83k (12.0µs),
compat-bare 74.9k (13.4µs, +1.4), oak 71.4k (14.0µs, +2.0), rapid 55-62k
(16.2-18.2µs, +4.2-6.2).

### Attribution: where rapid's layer actually goes (measured)

`perf-attribution.bench.ts` runs three variants of the identical request cycle —
the real `__handle`, a **collapsed** prototype (same observable semantics:
ambient scope open across handler+finalize, same requestId policy, correlation
echo, disclosure, thenable branch for async handlers; but no async/await in the
framework path and cleanup skipped when there is provably nothing to clean), and
collapsed-minus-ambient. In-process, `GET /users/:id`, Deno/Bun/Node avg:

| variant                       | DENO   | BUN   | NODE  |
| ----------------------------- | ------ | ----- | ----- |
| `__handle` current            | 4.4µs  | 3.4µs | 8.7µs |
| collapsed (same features)     | 3.7µs  | 2.5µs | 7.7µs |
| compat-bare `_processRequest` | 0.44µs | 1.1µs | 2.5µs |

Components (DENO/BUN/NODE):

- 8-deep async ladder under ALS: **677/557/536ns** vs 3.6ns sync — the frame
  machinery is a real per-request cost, and the pipeline stacks ~8-9 async
  frames today. This is what "collapsed" removes.
- `ambient.run(seed, sync fn)` alone: 276/31/164ns — ALS entry itself is
  cheap-to-affordable; the expensive part was OUR async closures around it, not
  the feature.
- `ulid()`: 473/505/**1300**ns → pooled+time-prefix-cached prototype (same
  output format): 112/89/114ns = **4-11x**. The current impl does
  `crypto.getRandomValues(new Uint8Array(10))` + full time re-encode per call.
- `new URL(url)` for pathname only: 114/333/170ns → string scan: 38/34/74ns.
- Non-issues, measured: state CLONE 21-45ns, `new Headers()` 30-123ns, radrouter
  find ~100-200ns.
- The full feature tax (ambient + requestId post-pooling + tracer check
  - state clone + disclosure try/catch) prices out at **~0.4-0.5µs** — the 4-9µs
    overhead today is machinery, not features. That is why parity without
    feature loss is possible.

### Ranked plan

| #  | change                                                                                                                                                                                                                                              | where                               | measured/expected                                 | risk                                                                          |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| R1 | Collapse the async spine: rewrite `_invoke`/`__handle`/`__finalize` promise-free on the happy path (thenable checks; sync-through `ambient.run`; direct lane when zero-middleware + no tracer, onion lane unchanged otherwise; conditional cleanup) | rapid                               | −0.7/−0.9/−1.0µs per req (measured via prototype) | medium — core path rewrite, full 3-runtime suite + disclosure tests must hold |
| R2 | Pooled ULID: batch `getRandomValues` into a pool, cache the time prefix per ms                                                                                                                                                                      | id (own PR)                         | −0.36µs Deno, −1.19µs Node per req (measured)     | low                                                                           |
| R3 | Pathname scan instead of `new URL` in `__handle` (URL still built lazily for `args.query` — already lazy)                                                                                                                                           | rapid                               | −0.08/−0.3/−0.1µs (measured)                      | low                                                                           |
| R4 | compat `_processRequest` slimming: skip `_LazyRequestInfo`+emit when unobserved, collapse its frames                                                                                                                                                | compat (feat/compat-webserver-perf) | Deno compat layer +1.4µs → target +0.5µs          | low-medium                                                                    |
| R5 | compat Node Fetch-tax: lazy Request impersonation (hono/node-server precedent — serve method/url/headers from `IncomingMessage`, materialize undici only on body access)                                                                            | compat                              | +8.4µs → target +3µs over raw                     | high — biggest single win on Node, real design work                           |

### Projected end state (E2E, this machine)

- **Deno**: rapid layer 4.2-6.2µs → ~1.3-1.6µs (R1+R2+R3) + compat 1.4 → 0.5
  (R4) ⇒ total ≈ 13.8-14.1µs ≈ **71-72k = oak parity**, with features oak
  doesn't have (correlation, tracing seam, disclosure). R1-R3 alone lands
  ~82-84% of oak (from 77%).
- **Node vs express**: R1-R3 alone ⇒ ~36k = 89% of express; add R5 ⇒ ≈ 22.6µs ≈
  **44k, decisively ahead of express (40.5k)**.
- **Node vs fastify**: fastify IS raw-http speed. The honest ceiling for a
  Fetch-contract framework with correlation is the hono-node-server ballpark:
  **~80-90% of fastify** with R1-R5 all landed. Matching fastify would require
  abandoning the Fetch-standard `ctx.request` — a functionality loss, rejected.
- **Bun**: rapid collapsed is already 2.5µs in-process; no peer benched on the
  Bun lane yet (hono/elysia would be the honest peers — future).

Sequencing respects one-package-per-PR: R1+R3 on the rapid branch, R2 on an id
branch, R4+R5 on feat/compat-webserver-perf.

## Parity middleware: is ULID / ambient the cost? (measured, not inferred)

User's method (2026-08-20): rather than only stripping rapid down, load the
PEERS up — give oak/express/fastify the same per-request features rapid ships (a
sortable request-id echoed on the response; the ambient ALS correlation scope)
and see where THEY land. Four modes per peer, switched by env, isolate each
feature:

- `plain` — the peer as shipped.
- `idcheap` — a request-id from a counter + echo header (NO ULID) — isolates the
  middleware-frame + header cost from the id algorithm.
- `id` — ULID (same `@tundralibs/id`) + echo header.
- `full` — ULID + echo + `ambient.run(...)` ALS wrap (rapid's correlation
  feature, same package).

Servers: `oak-parity-server.ts` (Deno), `express-parity-server.ts` /
`fastify-parity-server.ts` (Node, bundled to `.mjs` so they run as plain node —
4 concurrent `tsx` compiler services exhaust the process/fd budget). Load driven
by `parity-driver.mjs` (autocannon's programmatic API from ONE node process —
`npx | node` in a zsh `$(...)` subshell was unreliable here). `-c 50 -d 10`, avg
of 3 rounds.

### oak / Deno (very stable, low variance)

| mode        | `/` req/s | µs/req | `/users` req/s | µs/req |
| ----------- | --------- | ------ | -------------- | ------ |
| plain       | 72.0k     | 13.88  | 69.9k          | 14.30  |
| +id no-ULID | 63.5k     | 15.75  | 61.8k          | 16.18  |
| +ULID       | 59.3k     | 16.86  | 57.4k          | 17.42  |
| +full       | 59.2k     | 16.90  | 57.9k          | 17.27  |
| **rapid**   | **60.7k** | 16.48  | **54.4k**      | 18.38  |

Per-feature cost on Deno: middleware frame + echo ≈ **+1.9µs**; **ULID ≈
+1.1µs**; **ambient ≈ +0.04µs (free)**. rapid vs oak-full: **104% on `/`
(faster), 96% on `/users`** — rapid is AT PARITY with oak once oak carries the
same features. The gap vs _plain_ oak was oak doing less.

### fastify / Node (sequential → "plain" runs coolest; slight bias

### against later modes, effect sizes still clear)

| mode        | `/` req/s | µs/req | `/users` req/s |
| ----------- | --------- | ------ | -------------- |
| plain       | ~62-65k   | ~15.9  | ~58k           |
| +id no-ULID | 49.3k     | 20.3   | 48.5k          |
| +ULID       | 43.3k     | 23.1   | 43.2k          |
| +full       | 43.1k     | 23.2   | 42.7k          |
| rapid       | ~35k      | ~28.6  | ~33k           |

Per-feature cost on Node: **ULID ≈ +2.8µs** (49k→43k, a 12% drop from the id
algorithm alone); **ambient ≈ +0.1µs (free)**. Node's ULID is heavier than
Deno's (undici/V8 `crypto.getRandomValues` + base32 time encode = 1.3µs micro,
~2.8µs amplified).

### What this proves

1. **Ambient/ALS correlation is NOT a perf liability** — ~0µs/req on both
   runtimes. The feature you built is free; keep it.
2. **ULID IS the dominant per-request feature cost** — +1.1µs Deno, +2.8µs Node.
   It hits EVERY framework that adds a sortable correlation id (fastify-full
   drops to 43k, oak-full to 58-59k). rapid is not uniquely slow because of it;
   it is a shared cost. This promotes **R2 (pooled ULID) to the highest-value,
   lowest-risk win**: the pooled prototype is 4-11x faster (112/89/114ns), which
   recovers ~1µs Deno / ~2.5µs Node per request for rapid — and would help any
   consumer of `@tundralibs/id`.
3. **On Deno, rapid already ≈ oak-with-equivalent-features (96-104%).** There is
   no rapid-specific Deno slowness to chase beyond R1-R3; the residual vs
   _plain_ oak is the feature set, which is the point of the framework.
4. **On Node, the residual rapid↔fastify-full gap (~6µs) is the compat
   Fetch-translation transport tax (R5)** — fastify runs on raw `node:http`;
   rapid runs on compat's undici Request/Response. That is a compat-package
   item, not rapid logic.

### Revised priority

R2 (pooled ULID, `id` package) jumps to FIRST — it is the one change that moves
BOTH runtimes for BOTH rapid and every other `@tundralibs/id` consumer, at low
risk. Then R1 (collapse async spine, rapid) and R5 (Node Fetch tax, compat).
R3/R4 are cleanup-tier.
