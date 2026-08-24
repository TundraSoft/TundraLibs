# Tracer Examples

Runnable demos — copy a file wholesale into a real project, or run it here.

## Files

| File                                   | What it demonstrates                                                                                                                                                                                      |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`nested-spans.ts`](./nested-spans.ts) | Automatic parenting across real call depth (`checkout` → `chargeCard` → `recordLedgerEntry` → `db.query`) and isolation between two concurrent requests, printed as the reconstructed span tree per trace |

See also: [`docs/Tracer-Concepts.md`](../docs/Tracer-Concepts.md) — why
nesting is automatic, and what happens on a runtime with no
`AsyncLocalStorage`.

## Running

These examples import from `@tundralibs/tracer` via the workspace, so they
work with all three runtimes:

```bash
# Deno
deno run packages/tracer/examples/nested-spans.ts

# Bun
bun run packages/tracer/examples/nested-spans.ts

# Node (requires tsx for inline TS)
node --import tsx packages/tracer/examples/nested-spans.ts
```
