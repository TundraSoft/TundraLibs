# Password login + OPAQUE sessions

Password login backed by **store-backed opaque sessions** instead of signed
JWTs — register a user, log in, verify the session token, then revoke it and
watch it die instantly. Backed by an **in-memory store**; swap the `hooks` for
your database and the shape is unchanged.

## Files

| File      | Purpose                                                           |
| --------- | ---------------------------------------------------------------- |
| `main.ts` | The full flow with in-memory `Map`-backed hooks. Runnable as-is. |

## Run

```bash
deno run packages/pact/examples/opaque-sessions/main.ts
bun run  packages/pact/examples/opaque-sessions/main.ts
node --import tsx packages/pact/examples/opaque-sessions/main.ts
```

## What to notice

- **`session: { strategy: 'OPAQUE' }`** stores each session in your database
  and hands back an **opaque id** as the token — not a JWT. It carries no
  payload and needs no signature, so **no `secret` is configured**.
- **OPAQUE requires the `getSession` + `saveSession` + `deleteSession` hooks**;
  `logoutAll()` additionally requires `deleteUserSessions`. There is **no
  `refreshToken`** — opaque sessions have a fixed lifetime.
- **`logout()` deletes the store record, so the session dies the instant it is
  gone** — `verify()` returns `null` immediately. This is the key contrast with
  a JWT, which stays valid until its expiry no matter what.
- **`logoutAll(userId)` deletes every session for a user** — after it, all of
  that user's tokens verify to `null` at once (a global sign-out).
- **A wrong password / bad token resolves to `null`**, never an exception — the
  uniform contract that lets one middleware treat every failure the same way.
