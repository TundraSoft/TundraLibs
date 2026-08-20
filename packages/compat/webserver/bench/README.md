# WebServer performance investigation — records

The LIVE benchmark is [`../WebServer.bench.ts`](../WebServer.bench.ts) —
native server vs. bare `WebServer` on the cross-runtime harness
(`@tundralibs/compat/bench`), one file for all three lanes:

```bash
# from the repo root — one lane directly:
deno run --config deno.json --allow-net --allow-read --allow-env --allow-sys --allow-write packages/compat/webserver/WebServer.bench.ts
bun run packages/compat/webserver/WebServer.bench.ts
node --import tsx packages/compat/webserver/WebServer.bench.ts

# or all three lanes merged into one table:
deno run --allow-run --allow-read --allow-env --allow-write packages/compat/scripts/bench-all.ts packages/compat/webserver/WebServer.bench.ts
```

The harness measures sequential localhost round trips — a per-request
latency comparison, not a load test. The concurrency-throughput numbers
(autocannon, 50 connections) that drove the optimization work live in
the two records below; the ad-hoc server scripts that produced them
were retired when the harness bench landed.

- [RESULTS.md](RESULTS.md) — native-vs-WebServer throughput on all
  three runtimes, before/after the optimization passes, with the
  paired-measurement methodology and its noise caveats.
- [OPTIMIZATION-NOTES.md](OPTIMIZATION-NOTES.md) — the requestId /
  outbound-streaming / inbound-translation review, the per-operation
  micro-benchmarks, what was implemented in each pass, and the recorded
  stopping points (undici constructor floor on Node; profiler-needed
  residual on Deno).
