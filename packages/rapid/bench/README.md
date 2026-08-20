# Scratch performance investigation

Throwaway scripts used to find and verify the fixes in
`perf(rapid): close
3 per-request overhead sources...`. Not the repo's
`.bench.ts`/`Deno.bench` convention (see
`.github/instructions/testing.instructions.md`) — plain runnable servers,
load-tested with `autocannon`, because the question was end-to-end HTTP
throughput across Deno/Bun/Node, not in-process function timing. Expect this
directory to be changed or removed once the investigation it supports is done.

## Servers

- `rapid-server.ts` — minimal rAPId app (2 routes, no middleware/modules).
- `oak-server.ts` — same 2 routes on oak (Deno only, `jsr:@oak/oak`).
- `express-server.mjs` — same 2 routes on express (Node only). Needs `express`
  installed locally first: `npm install --no-workspaces --prefix .` from this
  directory (plain `npm install` fails — this monorepo's workspace member
  `package.json`s use the `workspace:*` protocol, which only pnpm/yarn
  understand, not npm; `--no-workspaces` skips that resolution).
- `node-http-server.mjs` — same 2 routes on raw Node `http` (no framework, no
  Fetch API) — the absolute floor for the Node lane.
- `raw-deno-server.ts` — same 2 routes on raw `Deno.serve` — the absolute floor
  for the Deno lane.
- `compat-server.ts` — same 2 routes on bare `@tundralibs/compat` `WebServer`
  (hand-routed, no rAPId `Application`/router/context) — isolates compat's own
  translation/bookkeeping cost from rAPId's.

## Exploration scripts (not benchmarks)

- `cron-socket-explore.ts` — hands-on `triggerJob()`/WebSocket round-trip check.
- `module-testability-explore.ts` — confirms a `@Module` class unit-tests with
  zero server involvement.

## Running

```bash
# from the repo root
deno run --config deno.json --allow-net --allow-read --allow-env --allow-sys --allow-write packages/rapid/bench/rapid-server.ts
node --import tsx packages/rapid/bench/rapid-server.ts
deno run --allow-net --allow-read --allow-env packages/rapid/bench/oak-server.ts
node packages/rapid/bench/express-server.mjs   # after the npm install above
node packages/rapid/bench/node-http-server.mjs
deno run --allow-net packages/rapid/bench/raw-deno-server.ts
deno run --config deno.json --allow-net --allow-read --allow-env --allow-sys --allow-write packages/rapid/bench/compat-server.ts
node --import tsx packages/rapid/bench/compat-server.ts

npx --yes autocannon -c 50 -d 10 http://localhost:<port>/
```

Full writeup and results: [REPORT.md](REPORT.md).
