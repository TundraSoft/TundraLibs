# Request Correlation

One simulated request walking through `ambient`'s full surface — scope
opening, deep reads, live mutation, the nested-`run()` footgun (and its
`child()` fix), concurrent-request isolation, and a background-job
rehydration pattern using both `ambient` and an independent `createContext()`
store.

## Files

| File                                                 | What it demonstrates                                                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [`request-correlation.ts`](./request-correlation.ts) | Edge `ambient.run()`, deep `get()`/`set()`, `run()` vs `child()`, concurrent isolation, and job-queue rehydration via `createContext()` |

See also: [`docs/Ambient-Concepts.md`](../../docs/Ambient-Concepts.md) and
[`docs/Ambient-Integration.md`](../../docs/Ambient-Integration.md) — the
underlying concepts and integration patterns this file walks through.

## Running

This example imports from `@tundralibs/ambient` via the workspace, so it
works with all three runtimes:

```bash
# Deno
deno run --allow-all packages/ambient/examples/request-correlation/request-correlation.ts

# Bun
bun run packages/ambient/examples/request-correlation/request-correlation.ts

# Node (requires tsx for inline TS)
node --import tsx packages/ambient/examples/request-correlation/request-correlation.ts
```

Output is deterministic and identical across all three runtimes.
