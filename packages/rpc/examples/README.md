# RPC Examples

Runnable demos of common patterns. Each file is self-contained — start
the demo, point a WebSocket client at it, watch the console.

## Files

| File                                             | What it demonstrates                                                    |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| [`pattern-subscribe.ts`](./pattern-subscribe.ts) | Glob-style channel patterns (`chat:*`, `user:**`) via subclass override |

See also: [`docs/Rpc-Extending.md`](../docs/Rpc-Extending.md) — the
override surface, recipes, and when to subclass vs propose a core
feature.

## Running

These examples import from `@tundralibs/rpc` via the workspace, so
they work with all three runtimes:

```bash
# Deno
deno run --allow-net packages/rpc/examples/pattern-subscribe.ts

# Bun
bun run packages/rpc/examples/pattern-subscribe.ts

# Node (requires tsx for inline TS)
node --import tsx packages/rpc/examples/pattern-subscribe.ts
```
