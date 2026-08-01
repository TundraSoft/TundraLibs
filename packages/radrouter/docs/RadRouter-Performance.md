# Performance

The router stores routes in a path-compressed trie:

- **Static lookups:** O(L) where L = path length (single-pass walk
  with one integer cursor).
- **Parameter / greedy lookups:** O(L) average; worst case adds a
  small constant for backtracking when a `:name:<suffix>` doesn't
  match.
- **No allocation per lookup** on the common path (`path.split('/')`
  isn't called; the cursor walks `path` directly).
- **No `Map.get()` per hop** — `staticChildren` uses an indexed
  `Object.create(null)`.

## Table of Contents

- [Reproducing](#reproducing)
- [Per-shape lookup](#per-shape-lookup)
- [Case-sensitive vs case-insensitive](#case-sensitive-vs-case-insensitive)
- [Router shootout](#router-shootout)

## Reproducing

Two benchmark suites live in the package:

- **`RadRouter.bench.ts`** — six lookup shapes against a fully-loaded
  router (1150 routes), plus a case-sensitive vs case-insensitive
  comparison. Static lookup is the baseline within each group.
- **`RadRouter.compare.bench.ts`** — head-to-head against find-my-way
  (Fastify) and radix3 (Nitro/Nuxt) under an identical workload.

```bash
deno bench --allow-all packages/radrouter/RadRouter.bench.ts
deno bench --allow-all packages/radrouter/RadRouter.compare.bench.ts
```

## Per-shape lookup

One run on an Apple M2 Max / Deno 2.7.14. Treat these as a snapshot,
not a contract — re-run on your own hardware.

1150 routes registered; static is the baseline within the group.

| Lookup shape               | time/iter | iter/s | vs static |
| -------------------------- | --------- | ------ | --------- |
| static (versioned)         | 102.1 ns  | 9.79M  | 1.00×     |
| static (deep, unversioned) | 100.3 ns  | 9.97M  | 1.02×     |
| greedy (multi segment)     | 119.0 ns  | 8.40M  | 0.86×     |
| greedy (single segment)    | 122.2 ns  | 8.18M  | 0.84×     |
| param (2 params)           | 236.4 ns  | 4.23M  | 0.43×     |
| miss                       | 32.1 ns   | 31.2M  | 3.18×     |

A miss is faster than a hit because the walk terminates as soon as
the trie diverges from the path — no further node traversal or
parameter capture happens.

## Case-sensitive vs case-insensitive

Same lookup workload, just the option flipped:

| Mode             | time/iter | iter/s | vs CS |
| ---------------- | --------- | ------ | ----- |
| case-sensitive   | 102.2 ns  | 9.78M  | 1.00× |
| case-insensitive | 128.8 ns  | 7.77M  | 0.79× |

CI mode lowercases the URL once at lookup entry and threads both the
case-folded view (for label matching) and the original view (for
param-value extraction) through the trie walk. That costs ~26% on
this workload. Set `caseSensitive: true` (the default) if you don't
actually need forgiving matching.

## Router shootout

1150 routes registered, blended 5-path workload, one consumer running
each router back-to-back. Same machine, same workload, single Deno
process per row.

| Router                | time/iter | iter/s | Setup   |
| --------------------- | --------- | ------ | ------- |
| RadRouter (CS)        | 133.1 ns  | 7.51M  | 2.18ms  |
| RadRouter (CI)        | 145.0 ns  | 6.90M  | 1.34ms  |
| radix3 (Nitro)        | 147.1 ns  | 6.80M  | 1.80ms  |
| find-my-way (Fastify) | 159.1 ns  | 6.29M  | 18.95ms |

Practical reading: RadRouter (CS) leads both peers on per-iteration
lookup; CI mode and radix3 sit in a similar tier ~9–11% behind; find-
my-way trails by ~20% on lookup and ~9× on setup. The benchmark file
at `RadRouter.compare.bench.ts` is the source — re-run on your own
hardware to get current numbers.

---

[← Back to RadRouter](../README.md)
