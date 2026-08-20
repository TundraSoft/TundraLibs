# WebServer vs. native, all three runtimes

`autocannon -c 50 -d 10`, same machine, same two routes
(`GET /` / `GET /users/:id`), bare `WebServer` vs. that runtime's own
native HTTP server with the identical routing logic. This machine has
real run-to-run noise (see `packages/rapid/bench/REPORT.md`'s caveat) —
read these as directional, not exact.

| Runtime | Server                | `GET /` | `GET /users/:id` |     % of native |
| ------- | --------------------- | ------: | ---------------: | --------------: |
| Deno    | `Deno.serve` (native) |  76,849 |           81,370 |            100% |
| Deno    | `WebServer`           |  74,278 |           76,454 |   96.7% / 94.0% |
| Bun     | `Bun.serve` (native)  |  73,719 |           74,900 |            100% |
| Bun     | `WebServer`           |  77,763 |           77,350 | 105.5% / 103.3% |
| Node    | `http` (native)       |  59,600 |           58,915 |            100% |
| Node    | `WebServer`           |  39,987 |           40,028 |   67.1% / 67.9% |

## Reading this

**Deno and Bun: no measurable cost.** Both ship a Fetch-API-native HTTP
server (`Deno.serve`, `Bun.serve`), so `WebServer` hands the runtime's
own `Request`/`Response` straight through with no translation. The
Deno numbers land a few points under native (94-97%) and the Bun numbers
land a few points _over_ native (103-106%) — that spread is noise, not
signal; `WebServer`'s cost on these two runtimes is not distinguishable
from zero at this sample size.

**Node: a real, repeatable ~32-33% cost.** Node's `http` module predates
the Fetch API — it hands you `IncomingMessage`/`ServerResponse`, not
`Request`/`Response`. `WebServer` has to manufacture Fetch-standard
objects from Node's native types on every request, and give the
response back through `res.write()`/`res.end()`. That's real, allocating
work Deno/Bun never do. See `packages/rapid/bench/REPORT.md`'s "#4
explained" section for the three concrete costs (inbound
`Request`/`Headers` construction, outbound `ReadableStream` pump,
discarded per-request `requestId`/`requestTime` metadata) and file:line
citations — reproduced/cross-checked as part of this benchmark, not
re-derived.

## Take

The portability cost of `WebServer`'s Fetch-API-first design is paid
almost entirely on ONE runtime (Node), not spread evenly across all
three. Any optimization work here should target the Node code path
specifically (`_startNodeServer`, `__nodeReqToFetchRequest` in
`WebServer.ts`) — Deno and Bun are already at parity with their native
servers and don't need it.
