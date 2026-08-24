# rAPId benchmarks

Two complementary views. **Same-runtime pairings only** (Deno vs Deno, etc.).

## 1. In-process baseline — rAPId's own framework CPU

`../transports/HTTPTransport.bench.ts` drives the FULL rAPId pipeline
(`HTTPTransport.__handle`: route → context → onion → serialize) and a bare
compat `WebServer._processRequest` cycle through the identical path, **no
socket** — so the number is per-request CPU, not RTT. This is rAPId's baseline,
not a peer comparison; run it directly:

```bash
deno run -A --config deno.json packages/rapid/transports/HTTPTransport.bench.ts
bun  run                        packages/rapid/transports/HTTPTransport.bench.ts
node --import tsx               packages/rapid/transports/HTTPTransport.bench.ts
```

Measured (full pipeline, per request): **Bun ~2.2µs, Deno ~11.2µs, Node
~21.2µs** — Node is object-construction-bound (undici `Request`/`Response`).

## 2. Socket comparison — rAPId vs oak / express / fastify

Real servers over a socket, **apples-to-apples**: every peer carries the same
per-request work rAPId ships — a request id from the SAME generator rAPId
defaults to (a shared `sequenceID()`, stringified) echoed on the response, plus
the `@tundralibs/ambient` ALS correlation scope (`MODE=full`, `IDGEN=seq` — both
the defaults). Same two routes as rAPId, nothing else:

```
GET /             -> { ok: true }
GET /users/:id    -> { id: <id> }
```

- `rapid-server.ts` — rAPId (:4001). oak runs on Deno, express/fastify on
  Node+Bun, rAPId on all three.
- `oak-parity-server.ts` (:4012, Deno) / `express-parity-server.ts` (:4013) /
  `fastify-parity-server.ts` (:4014) — peer + parity middleware. Env: `MODE`
  (`id`|`full`, default `full`), `IDGEN` (`seq`|`ulid`, default `seq`), `PORT`.

**Load is driven by `autocannon`** via `parity-driver.mjs` (its programmatic API
from one node process; `ROUNDS`/`CONN`/`DUR` env). autocannon — not the compat
`concurrency` bench — because a `fetch()`-loop client is client-bound for
cross-process localhost HTTP (it saturates before the server does, collapsing
every server to the client's ceiling); a raw-socket loader is required to
saturate the servers. (The compat concurrency bench is for in-process
throughput, a different job.)

```bash
# install peer deps once (npm's workspace protocol needs --no-workspaces):
npm install --no-workspaces --prefix packages/rapid/bench
# start the servers for a lane (backgrounded), then:
ROUNDS=3 CONN=50 DUR=8 node packages/rapid/bench/parity-driver.mjs \
  '[{"label":"rapid","url":"http://localhost:4001/users/42"},
    {"label":"express","url":"http://localhost:4013/users/42"}]'
```

### Current standing (`autocannon -c 50 -d 8`, 3-round avg, this machine)

req/s, `GET /users/:id` (peers at full parity):

| Runtime |  rAPId |    oak | express | fastify | rAPId vs peer                       |
| ------- | -----: | -----: | ------: | ------: | ----------------------------------- |
| Deno    | 59,251 | 59,017 |       — |       — | ≈ oak (100%)                        |
| Bun     | 69,199 |      — |  55,660 |  64,623 | **>express (+24%), >fastify (+7%)** |
| Node    | 37,361 |      — |  39,989 |  58,860 | 93% express, 64% fastify            |

rAPId is at-or-ahead of its peers on Deno and Bun; Node is the weak lane — the
undici `Response` construction tax (fastify runs on raw `node:http`). fastify is
the honest ceiling for a Fetch-contract framework.

## Not benchmarks

`cron-socket-explore.ts`, `module-testability-explore.ts` — exploration scripts.
