# WebServer cross-runtime benchmark

Throwaway (see `packages/rapid/bench/README.md` for why this isn't the
repo's `.bench.ts`/`Deno.bench` convention — `Deno.bench` doesn't run on
Bun/Node, and the question here is end-to-end HTTP throughput, not
in-process function timing). Compares bare `WebServer` against each
runtime's own native HTTP server, isolating what compat's Fetch-API
translation layer costs on each of the three runtimes it supports.

## Servers

- `compat-server.ts` — two hand-routed routes (`GET /`, `GET /users/:id`)
  on bare `WebServer`, no framework on top. Runs unmodified under
  `deno run`, `bun run`, `node --import tsx`.
- `raw-deno-server.ts` — same two routes on raw `Deno.serve` (the floor).
- `raw-bun-server.ts` — same two routes on raw `Bun.serve` (the floor).
- `raw-node-server.mjs` — same two routes on raw Node `http` (the floor).

## Running

```bash
# from the repo root
deno run --config deno.json --allow-net --allow-read --allow-env --allow-sys --allow-write packages/compat/webserver/bench/compat-server.ts
bun run packages/compat/webserver/bench/compat-server.ts
node --import tsx packages/compat/webserver/bench/compat-server.ts

deno run --allow-net packages/compat/webserver/bench/raw-deno-server.ts
bun run packages/compat/webserver/bench/raw-bun-server.ts
node packages/compat/webserver/bench/raw-node-server.mjs

npx --yes autocannon -c 50 -d 10 http://localhost:<port>/
```

Results and analysis: [RESULTS.md](RESULTS.md).
