# Compat-Bench

Cross-runtime micro-benchmark harness — one measurement engine on Deno, Bun,
and Node.js, so numbers from different runtimes are comparable.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

Bun and Node have no native bench runner, and `Deno.bench` files only run on
Deno. `@tundralibs/compat/bench` replaces that split with one
`Deno.bench`-compatible `bench()` registration API and one hand-rolled,
dependency-free engine (only `performance.now()` and `setTimeout`), so a
single `*.bench.ts` file runs unmodified on all three runtimes — and because
the engine is identical everywhere, cross-runtime comparisons measure the
runtimes, not two different harnesses.

Files are RUN DIRECTLY (there is no runner command): execution schedules
itself after module evaluation.

```bash
deno run --allow-env --allow-read my.bench.ts
bun run my.bench.ts
node --import tsx my.bench.ts
```

Methodology, per bench: warmup (with a convergence check that extends it once
if the JIT is still tiering up) → batch-size auto-calibration until a batch
spans ≥2ms (sub-µs operations cannot be timed per call against timer
resolution) → batch sampling until the time budget, with a GC nudge between
batches where the runtime exposes a hook. Results flow through a
`globalThis`-escaping sink so the JIT cannot dead-code-eliminate the benched
call.

### Features

| Feature                                       | Bun | Deno | Node.js |
| --------------------------------------------- | --- | ---- | ------- |
| `bench()` (all `Deno.bench` call shapes)      | ✅  | ✅   | ✅      |
| `group` / `baseline` relative summaries       | ✅  | ✅   | ✅      |
| `only` / `ignore` / runtime+OS skip flags     | ✅  | ✅   | ✅      |
| `BENCH_FILTER` (substring or `/regex/`)       | ✅  | ✅   | ✅      |
| `b.start()` / `b.end()` sectioned timing      | ✅  | ✅   | ✅      |
| `concurrency` throughput mode (ops/s)         | ✅  | ✅   | ✅      |
| Fixed batch size (`n`)                        | ✅  | ✅   | ✅      |
| async benches (auto-detected)                 | ✅  | ✅   | ✅      |
| stats: avg, iter/s, min/max, p50/p75/p99, MAD | ✅  | ✅   | ✅      |
| JSON report (`BENCH_FORMAT=json`)             | ✅  | ✅   | ✅      |
| smoke mode (`BENCH_SMOKE=1`)                  | ✅  | ✅   | ✅      |
| env stamp (runtime version, arch, cores)      | ✅  | ✅   | ✅      |

## Usage

```typescript
import { bench } from '@tundralibs/compat/bench';

// Whole-call timing — the common case.
bench('join two segments', () => {
  return ['a', 'b'].join('/');
});

// Groups compare against a baseline in the printed summary.
bench('spread copy', { group: 'copy', baseline: true }, () => {
  return [...[1, 2, 3]];
});
bench('slice copy', { group: 'copy' }, () => {
  return [1, 2, 3].slice();
});

// Sectioned timing: per-iteration setup stays out of the numbers.
bench('parse (excluding fixture build)', (b) => {
  const fixture = JSON.stringify({ n: Math.random() });
  b.start();
  JSON.parse(fixture);
  b.end();
});

// Restrict where a bench runs, or pin its batch size.
bench('deno-only path', { node: false, bun: false }, () => 1);
bench('cache-sensitive', { n: 1000 }, () => 2);
```

### Throughput (concurrency mode)

The default is a per-operation **latency** measure (one call at a time). For a
server or any I/O-bound op, the cost that matters shows up **under
concurrency** — pass `concurrency` to switch to a **steady-state throughput**
measure: the harness keeps N invocations in flight, counts completions over the
budget, and reports **operations/second** as the headline plus the per-op
latency-under-load percentiles.

```typescript
import { bench } from '@tundralibs/compat/bench';

// Keep 50 requests in flight; the headline becomes ops/s.
bench(
  'GET /users/:id',
  { group: 'route', baseline: true, concurrency: 50 },
  async () => {
    const r = await fetch('http://localhost:8080/users/42');
    await r.arrayBuffer();
  },
);
```

- The printed table shows `latency (avg)` (per-op, **under load**) and `ops/s`
  (real throughput, not `1 / latency`); the row is tagged `(c=N)`.
- Group summaries compare by **throughput** (higher ops/s = _faster_), the
  inverse of a latency group.
- Each concurrent worker gets its own {@link BenchContext}, so `b.start()` /
  `b.end()` sectioning still works per op.
- `warmupMs` / `budgetMs` default higher when `concurrency` is set (a stable
  throughput read needs a window); override to tune.
- Default `1` (or unset) keeps the latency behavior exactly as before.

Programmatic use returns the typed report instead of printing:

```typescript
import { bench, runBenches } from '@tundralibs/compat/bench';

bench('example', () => 1 + 1);
const report = await runBenches({ quiet: true });
console.log(report.benches[0]?.p50Ns);
```

### Environment variables

| Variable       | Effect                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------ |
| `BENCH_FILTER` | Run only matching benches: plain value = substring, `/wrapped/` = regex                    |
| `BENCH_FORMAT` | `json` → machine-readable report on stdout (consumed by `scripts/bench-all.ts`)            |
| `BENCH_SMOKE`  | `1` → 1ms warmup / 5ms budget / capped `n`: a compiles-and-runs check, numbers meaningless |

`only: true` restricts a run to the marked benches, and an auto-run that used
`only` exits non-zero afterwards (like `deno bench`) so it cannot slip through
CI. `ignore: true` skips unconditionally and wins over `only`.

## The cross-runtime aggregator

`packages/compat/scripts/bench-all.ts` (a repo tool, Deno-only because it
spawns the other runtimes) runs each file under Deno, Bun, and Node
sequentially and merges the reports into one table with a column per runtime,
fastest marked:

```bash
deno task bench                        # every *.bench.ts, all three runtimes
deno task bench:deno                   # single lane (also :bun / :node)
deno task bench:smoke                  # rot check: everything, tiny budgets
```

Direct invocation takes files, directories, or `--all`, plus:
`--filter=<substr|/re/>`, `--lanes=deno,bun,node`, `--format=table|md|csv`,
`--save-baseline=<file>`, `--baseline=<file>` (compares on p50, flags ≥10%
changes, e.g. `⚠ path.join [NODE]: 31.2% SLOWER since a1b2c3d`), and
`--smoke`.

## Notes

- Benches must be able to run standalone — the file IS the entry point.
- `b.start()`/`b.end()` must be used on every invocation or on none; misuse
  throws with the bench's name in the message. Sectioned timing reads the
  clock per iteration, so very short sections (≪1µs) re-expose the timer
  resolution that whole-call batching hides.
- The `deno bench` `permissions` option has no equivalent — permissions come
  from the `deno run` invocation's flags.
- Lanes run sequentially everywhere; running benches concurrently corrupts
  the numbers.
