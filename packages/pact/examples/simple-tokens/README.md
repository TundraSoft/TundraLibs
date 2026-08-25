# Opaque static bearer tokens

Long-lived personal-access-style tokens — the `TOKEN` scheme. Issue a token,
authenticate it, and watch expiry, revocation, and unknown tokens all resolve
to `null`, backed by an **in-memory store**. Swap the `hooks` for your database
and the shape is unchanged.

## Files

| File      | Purpose                                                          |
| --------- | ---------------------------------------------------------------- |
| `main.ts` | Issue → authenticate → expire → revoke, with `Map`-backed hooks. |

## Run

```bash
deno run packages/pact/examples/simple-tokens/main.ts
bun run  packages/pact/examples/simple-tokens/main.ts
node --import tsx packages/pact/examples/simple-tokens/main.ts
```

## What to notice

- **`tokens: true`** enables the `TOKEN` scheme and `issueToken()`. It needs
  only `getToken` + `getUser` (plus `saveToken` to issue) — **no `secret`**,
  because nothing is signed. The token is opaque, not a JWT.
- **`issueToken()` returns the token once.** pact stores only its **sha-256
  hash** via `saveToken`; the raw string never touches your store. A leaked
  store row can't be turned back into a working token.
- **`authenticate({ scheme: 'TOKEN', token })`** sha-256-hashes the token,
  looks the record up through `getToken`, and gates on `revokedAt` / `expiresAt`
  before resolving the principal by `userId`.
- **Every failure resolves to `null`, never an exception** — a past
  `expiresAt`, a `revokedAt` your store flipped on the live record, and a
  made-up token string all return `null` through the same uniform contract.
- **Revocation is your store's job.** Setting `revokedAt` on the stored record
  is enough; pact re-reads it via `getToken` on the very next check.
