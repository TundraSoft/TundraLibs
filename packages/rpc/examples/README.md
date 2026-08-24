# RPC Examples

Runnable demos of common patterns. Each file is self-contained.

## Files

| File                                             | What it demonstrates                                                                                                                                                                                                                                                   | Run                                                                          |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| [`client-server.ts`](./client-server.ts)         | `Client` + `Server` in one process: commands with validation, custom error codes + `.data`, middleware, channel pub/sub (server push and client `pub` via `onPublish`), and inspecting adapter capabilities. Runs to completion and exits — no external client needed. | See [Running](#running)                                                      |
| [`pattern-subscribe.ts`](./pattern-subscribe.ts) | Glob-style channel patterns (`chat:*`, `user:**`) via subclass override. Long-running server — connect an external WebSocket client (browser DevTools works) to see it.                                                                                                | See [Running](#running) plus the client snippet in the file's header comment |

See also:

- [`../README.md`](../README.md) — commands, middleware, channels,
  error codes, runtime support matrix
- [`docs/Rpc-Middleware.md`](../docs/Rpc-Middleware.md) — auth,
  rate-limiting, timing, error-routing, heartbeat recipes
- [`docs/Rpc-PubSub.md`](../docs/Rpc-PubSub.md) — adapter contract,
  capability flags, custom adapters
- [`docs/Rpc-Extending.md`](../docs/Rpc-Extending.md) — the override
  surface, recipes, and when to subclass vs propose a core feature

## Running

These examples import from `@tundralibs/rpc` via the workspace, so
they work with all three runtimes:

```bash
# Deno
deno run --allow-net packages/rpc/examples/client-server.ts
deno run --allow-net packages/rpc/examples/pattern-subscribe.ts

# Bun
bun run packages/rpc/examples/client-server.ts
bun run packages/rpc/examples/pattern-subscribe.ts

# Node (requires tsx for inline TS)
node --import tsx packages/rpc/examples/client-server.ts
node --import tsx packages/rpc/examples/pattern-subscribe.ts
```
