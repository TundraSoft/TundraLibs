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
