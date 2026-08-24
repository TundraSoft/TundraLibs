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

- `rapid-server.ts` (:4001) / `oak-parity-server.ts` (:4012) /
  `express-parity-server.ts` (:4013) / `fastify-parity-server.ts` (:4014) — each
  runs on **all three** runtimes (cross-runtime env; `@oak/oak` resolves to jsr
  on Deno and the npm build on Node/Bun; express/fastify resolve to node_modules
  on Node/Bun and via Deno's node-compat — the root `deno.json` maps all three).
  Peer + parity middleware. Env: `MODE` (`id`|`full`, default `full`), `IDGEN`
  (`seq`|`ulid`, default `seq`), `PORT`.

> **Non-native combos are compat-shim reads, not the framework's true ceiling.**
> Each framework is fastest on its home runtime — oak on Deno, express/fastify
> on Node. oak-on-Node/Bun (npm build) and express/fastify-on-Deno (node-compat)
> carry the runtime's shim overhead, so read those cells as informational.

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

### Current standing (`autocannon -c 50`, this machine, all four everywhere)

req/s, `GET /users/:id`, peers at full parity (**bold** = fastest per runtime;
_italic_ = non-native, compat-shim):

| Runtime |      rAPId |      oak |  express |    fastify |
| ------- | ---------: | -------: | -------: | ---------: |
| Deno    | **57,974** |   55,772 | _36,026_ |   _52,830_ |
| Bun     | **71,672** | _58,596_ |   56,452 |     66,344 |
| Node    |     37,982 | _31,393_ |   39,380 | **57,590** |

- **rAPId is the fastest framework on Deno and Bun.**
- **Node** is rAPId's weak lane: ≈ express, ahead of oak, behind **fastify**
  (which runs on raw `node:http` — the honest ceiling for a Fetch-contract
  framework). The gap is the undici `Response` construction tax.
- Each framework peaks on its home runtime; treat the _italic_ cells (oak off
  Deno, express/fastify off Node) as shim reads, not the framework's ceiling.

## Not benchmarks

`cron-socket-explore.ts`, `module-testability-explore.ts` — exploration scripts.
