# Restler Examples

| File                                     | What it demonstrates                                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`vendor-client.ts`](./vendor-client.ts) | BEARER auth + a vendor envelope `_responseHandler` + `responseSchema` + `call`/`rateLimit` events + typed error handling, all on one client |

See also: [`docs/Restler-Security.md`](../docs/Restler-Security.md) — the
credential-redaction contract these requests are subject to.

## Running

The example imports `@tundralibs/restler` and `@tundralibs/compat` via the
workspace, and starts its own local server, so it needs no external network
access:

```bash
# Deno
deno run --allow-net packages/restler/examples/vendor-client.ts

# Bun
bun run packages/restler/examples/vendor-client.ts

# Node (requires tsx for inline TS)
node --import tsx packages/restler/examples/vendor-client.ts
```
