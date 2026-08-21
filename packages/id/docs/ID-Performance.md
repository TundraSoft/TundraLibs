# Performance

Measured generation cost for each ID generator, and the handful of choices
that actually move the needle.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browser](https://img.shields.io/badge/Browser-4285F4?logo=googlechrome&logoColor=white)

## Table of Contents

- [Measured Results](#measured-results)
- [Choosing a Generator](#choosing-a-generator)
- [Performance Tips](#performance-tips)
- [Methodology](#methodology)

## Measured Results

Numbers are the average time to generate **one ID**, from this package's own
benchmarks (run with `deno task bench` — see [Methodology](#methodology)).
Environment: Apple M2 Max, Deno 2.9.5 / Bun 1.4.0 / Node 26.7.0,
single-threaded.

These are **indicative**. Absolute values vary with hardware and runtime
version; the relative ordering between generators is what stays stable, so
compare generators to each other rather than treating any figure as a
guarantee. Re-run the benchmarks on your target to get numbers for it.

| Generator               | Deno   | Bun    | Node   | Length    | Time-sortable |
| ----------------------- | ------ | ------ | ------ | --------- | ------------- |
| `sequenceID()`          | 57 ns  | 64 ns  | 70 ns  | bigint    | ✅            |
| `ObjectID()`            | 80 ns  | 141 ns | 117 ns | 26 chars  | ✅            |
| `simpleID()` (minLen 4) | 160 ns | 197 ns | 165 ns | ≥12 chars | ✅ (per day)  |
| `cuid2()`               | 396 ns | 144 ns | 1.3 µs | 24 chars  | ❌            |
| `ulid()`                | 510 ns | 406 ns | 1.2 µs | 26 chars  | ✅            |
| `nanoID(10)`            | 514 ns | 311 ns | 1.2 µs | 10 chars  | ❌            |
| `cuid()`                | 609 ns | 134 ns | 1.3 µs | 25 chars  | ✅ (in-proc)  |
| `nanoID(32)`            | 1.0 µs | 952 ns | 1.5 µs | 32 chars  | ❌            |

The four crypto-backed generators (`ulid`, `cuid`, `cuid2`, `nanoID`) each draw
from `crypto.getRandomValues` once per ID. That call is cheapest on Bun and
most expensive on Node, which is why their Node column is markedly higher than
Deno/Bun while the counter/time-based generators (`sequenceID`, `ObjectID`,
`simpleID`) — which touch no CSPRNG on the hot path — stay flat across runtimes.

Batch generation holds the per-ID cost: 100 IDs in a loop cost ~52 µs
(`ulid`), ~40 µs (`cuid2`), ~61 µs (`cuid`) on Deno — i.e. the same ~0.4–0.6 µs
each, with no per-batch penalty.

## Choosing a Generator

Order the shortlist by the property you need, then let cost break ties — every
generator here is well under ~1.5 µs, so ID generation is rarely a bottleneck
next to the I/O it usually accompanies.

| Need                                           | Reach for    |
| ---------------------------------------------- | ------------ |
| Fastest possible, single process               | `sequenceID` |
| Time-sortable + fast, MongoDB-style            | `ObjectID`   |
| Time-sortable + distributed + unguessable-ish  | `ulid`       |
| Compact URL-safe token, tunable length         | `nanoID`     |
| Collision-resistant, minting-time kept private | `cuid2`      |
| Human-readable daily sequence                  | `simpleID`   |

`sequenceID`, `ObjectID`, and `simpleID` embed a predictable timestamp/counter
and are **not** unguessable — never use them for tokens or secrets. When the
value must be hard to guess, use a CSPRNG-backed generator (`nanoID`, `ulid`,
`cuid2`).

## Performance Tips

**Create factory generators once, reuse the returned function.** `ObjectID`,
`sequenceID`, `simpleID`, and `monotonicFactory` do their setup (machine ID,
process ID, worker ID, closure state) when you call the factory — not per ID.
Recreating them in a hot path repeats that work.

```ts
import { ObjectID } from '@tundralibs/id';

// Create once…
const nextId = ObjectID();

// …then call cheaply.
const a = nextId();
const b = nextId();
```

**Use plain `ulid()` unless you need intra-millisecond ordering.** The monotonic
variants carry increment state, so they cost a little more and share a chain;
reach for them only when two IDs minted in the same millisecond must sort
deterministically. Prefer `monotonicFactory()` over `monotonicUlid()` so
independent streams don't interleave on one chain.

```ts
import { monotonicFactory, ulid } from '@tundralibs/id';

const id = ulid(); // standard — no ordering guarantee within a ms

const nextOrdered = monotonicFactory();
const first = nextOrdered();
const second = nextOrdered(); // guaranteed second > first
```

**For `nanoID`, length and alphabet drive the cost.** Fewer characters and a
smaller alphabet mean fewer random bytes to consume: `nanoID(10)` is roughly
half the cost of `nanoID(32)`. Pick the shortest length that meets your
collision budget rather than defaulting to a long ID.

**Extracting a ULID's timestamp is cheap** (`getTimestamp()` ≈ 1 µs) — decode it
rather than re-deriving time some other way, and never regenerate an ID just to
read its embedded time.

## Methodology

Benchmarks use `@tundralibs/compat/bench` — one `Deno.bench`-compatible API with
a single dependency-free measurement engine on all three runtimes, so the
numbers compare the runtimes rather than three different harnesses. The
`packages/compat/scripts/bench-all.ts` aggregator runs each `*.bench.ts` file on
every lane and merges the results into one table per benchmark (a column per
runtime, fastest marked).

```bash
# Every *.bench.ts across Deno, Bun, and Node
deno task bench

# One lane at a time
deno task bench:deno    # also :bun / :node

# Rot check — tiny budgets, meaningless numbers, just verifies benches run
deno task bench:smoke

# A single package or a filtered subset
deno run --allow-run --allow-read --allow-env --allow-write \
  packages/compat/scripts/bench-all.ts --filter=cuid packages/id
```

The raw benchmark sources live alongside the generators as
`packages/id/*.bench.ts`. `bench-all.ts` also accepts `--format=md|csv`,
`--save-baseline=<file>` / `--baseline=<file>` (regression compare on p50, ±10%
flagged), and `--lanes=`.

---

[← Back to ID Documentation](../README.md)
