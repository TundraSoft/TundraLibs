# RBAC-style bitmask authorization

The pure `@tundralibs/pact/authz` kernel on its own — no Pact engine, no
crypto, no hooks. A permission registry plus a module catalog: evaluate a
principal's grants, edit masks, compose roles into effective grants,
round-trip them over the wire as decimal strings, and turn catalog typos into
loud config errors.

## Files

| File      | Purpose                                                          |
| --------- | --------------------------------------------------------------- |
| `main.ts` | The full authorization flow with in-memory grants. Runnable as-is. |

## Run

```bash
deno run packages/pact/examples/rbac-authz/main.ts
bun run  packages/pact/examples/rbac-authz/main.ts
node --import tsx packages/pact/examples/rbac-authz/main.ts
```

## What to notice

- **Permissions are unique, positive BigInt bits** — BigInt masks have no
  31-bit `number` ceiling, so the permission count is unbounded.
- **`combineGrants` is allow-only** — it ORs role grant sets and can only
  *add* bits, so stacking roles never silently strips an already-granted power.
- **`assert` throws `PactDeniedError`** (not a boolean) — a caller maps the
  denial straight to a 403, distinct from a config bug.
- **Masks are immutable values** — `grant`/`revoke` return a *new* BigInt and
  `diff` reports `{ added, removed }`, so an admin UI can preview a pending
  change without mutating the live grant.
- **Serialize before the wire** — BigInt masks are not JSON-safe, so grants
  travel as decimal strings; the strict codec rejects hex/negative/empty so a
  tampered claim fails loudly.
- **A catalog turns typos into `PactDefinitionError`** — an unknown module
  (`UNKNOWN_MODULE`) or an off-module permission (`PERMISSION_NOT_IN_MODULE`)
  throws instead of returning a silent `false` that would quietly lock users
  out.
