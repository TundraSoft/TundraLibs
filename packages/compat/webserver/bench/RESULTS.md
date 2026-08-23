# WebServer vs. native, all three runtimes

**PAIRED measurement** (the authoritative numbers): for each runtime the
native server and bare `WebServer` run SIMULTANEOUSLY on different ports,
`autocannon -c 50 -d 8` hits them in ALTERNATING rounds (native, compat,
native, compat, …), so this machine's real run-to-run drift cancels out
instead of contaminating a native-vs-compat delta. Same two routes
(`GET /` / `GET /users/:id`), identical hand-routing in both servers.
avg req/s over the rounds:

| Runtime             |  native | `WebServer` | `WebServer` vs native |
| ------------------- | ------: | ----------: | --------------------: |
| Deno (`Deno.serve`) | ~81,500 |     ~75,150 |        **~92% (−8%)** |
| Bun (`Bun.serve`)   | ~74,300 |     ~77,200 |       **~104% (+4%)** |
| Node (`node:http`)  | ~59,000 |     ~41,000 |       **~69% (−31%)** |

(`GET /users/:id`: Deno native 83.8/82.0/80.1k vs compat 74.8/74.4/75.7k;
Bun native 74.2/74.8/71.8k vs compat 76.1/76.4/76.9k; Node native
58.9/59.2/58.0k vs compat 40.0/41.0/40.8k. `GET /` tracked the same. In
EVERY round the winner was consistent — native on Deno/Node, compat on
Bun — so these gaps are signal, not noise.)

## Reading this

**Bun: at parity (or a hair ahead).** `Bun.serve` is Fetch-native, so
`WebServer` hands the runtime's own `Request`/`Response` straight
through — no translation — and compat's path nets out even with (won
every round by ~4%; treat as "no meaningful overhead").

**Deno: a real ~7-9% cost — NOT noise.** (An earlier UNPAIRED table here
claimed 94-106% "noise" — that was wrong; it compared a compat run
against a native run measured at a different, lower moment. Paired,
native beats compat in every round.) `Deno.serve` is also Fetch-native
so there's NO translation tax; this ~8% is `WebServer`'s OWN fixed
per-request bookkeeping — `_processRequest`'s two `performance.now()`
calls, the active/peak/total counters, the status-code tally + min/max/
avg update, the try/finally, and the adapter indirection. Because native
`Deno.serve` is so fast (~81k), that fixed cost is a larger _fraction_
here than on the slower-floored runtimes. Unlike Node's, this overhead
is plausibly REDUCIBLE — make the metrics/timing opt-in the way
`requestId`/`requestTime` were already made lazy. Not done yet.

**Node: a real ~30-31% cost.** Node's `http` module predates the Fetch
API — it hands you `IncomingMessage`/`ServerResponse`, not
`Request`/`Response`. `WebServer` must manufacture Fetch-standard objects
from Node's native types every request (the ~3.5µs undici
`Request`/`Response` constructor cost — see OPTIMIZATION-NOTES.md) and
return the body through `res.write()`/`res.end()`. That undici
constructor cost is the price of the Fetch contract on Node itself and
is the current floor; the cheap edge costs around it were already
trimmed (see the Node-lane optimization section below).

## Take

The Fetch-API translation tax is Node-only (~31%) and hits an undici-
constructor floor. But `WebServer` ALSO carries a smaller, universal
bookkeeping overhead that only becomes visible against a very fast native
floor — it's ~0 on Bun, ~8% on Deno, and is dwarfed by the translation
tax on Node. Two separate optimization targets, then: (a) the Node
translation path (largely a wall now, short of lightweight-Request), and
(b) the universal `_processRequest` bookkeeping (opt-in metrics/timing),
which is where the Deno ~8% lives.

## After the Node-lane optimizations (see OPTIMIZATION-NOTES.md)

The three candidates landed (concat-URL + pairs-array inbound, lazy
`requestId`/`requestTime`, single-write outbound fast path with
Content-Length instead of chunked). Because this machine's run-to-run
noise (~±5%) swallows a single before/after comparison, the honest
measurement is a PAIRED A/B: the pre-change `WebServer` (extracted via
`git show HEAD:...` into a sibling file so its relative imports still
resolve) and the optimized one running SIMULTANEOUSLY on different
ports, measured in alternating autocannon rounds
(`-c 50 -d 8`, avg req/s per round):

| Route            | Round | Baseline | Optimized | Delta |
| ---------------- | ----- | -------: | --------: | ----: |
| `GET /users/:id` | 1     |   40,084 |    40,168 | +0.2% |
| `GET /users/:id` | 2     |   39,980 |    40,948 | +2.4% |
| `GET /users/:id` | 3     |   39,984 |    41,720 | +4.3% |
| `GET /`          | 1     |   39,600 |    40,668 | +2.7% |
| `GET /`          | 2     |   40,100 |    42,196 | +5.2% |

Baseline is rock-stable (±0.3%) while optimized trends upward across
rounds (JIT warming) — read the aggregate as **+2-5% Node throughput**,
plus a wire-format improvement autocannon doesn't fully credit:
single-chunk responses now carry `Content-Length` instead of
`Transfer-Encoding: chunked` (one socket write instead of two, no
chunk framing — verified via curl header inspection and a live
progressive-streaming check that real streams still stream).

Why not more: micro-benchmarking (full table in OPTIMIZATION-NOTES.md)
showed the dominant remaining cost is undici's `Request`/`Response`
CONSTRUCTORS (~3.5µs/request combined; `new Response(str)` alone is
~1.7µs, while draining its stream adds <300ns). That is the price of
the Fetch contract on Node itself — not removable inside `WebServer`
short of a Hono-node-server-style lightweight-Request scheme, and the
Response-side internal shortcut is blocked on Node 26+ (undici's true
`#private` fields, verified empirically). These Node-lane changes left
Deno/Bun untouched — Bun stays at native parity, Deno keeps its ~8%
`_processRequest`-bookkeeping overhead (a separate, still-open target;
see the paired table at the top).

## Current standing (2026-08-23) — throughput bench + lightweight Request

`WebServer.bench.ts` now measures both views via the harness's `concurrency`
mode (a compat/bench feature): `[latency]` (single connection) AND
`[throughput]` (50 concurrent; 30 on Bun — its fetch caps self-connections;
`WS_BENCH_CONC` overrides). Throughput is the honest server metric — the Node
gap is visibly wider under load than at single-connection latency, which the
old latency-only bench under-represented. Caveat: the harness runs benches
sequentially, so native vs WebServer here is back-to-back, not simultaneous —
for the drift-free A/B see Round 3 in OPTIMIZATION-NOTES.md.

WebServer-vs-native, WITH the lightweight inbound Request (Round 3), `GET
/users/:id`, this machine:

| Runtime | latency (single conn) | throughput (concurrent) |
| ------- | --------------------: | ----------------------: |
| Deno    |           ~1.01-1.03x |           ~1.04x (c=50) |
| Bun     |                ~1.03x |      ~1.07-1.08x (c=30) |
| Node    |           ~1.04-1.11x |      ~1.14-1.16x (c=50) |

Node's residual (~14-16% under load) is now the undici **Response**-constructor
half + `_processRequest` bookkeeping — the inbound `Request` half was cut ~22%
by the lightweight Request (Round 3: +4.3% Node throughput in the paired A/B).
Bun/Deno were never translation-bound; their small gaps are the universal
bookkeeping (Deno's ~8% throughput-records gap is the open profiler target).
