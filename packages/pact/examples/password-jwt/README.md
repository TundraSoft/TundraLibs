# Password login + JWT sessions

The canonical getting-started flow — register a user, log in with a password,
verify the session token, run an authorization check, rotate the session with a
refresh token, and log out — backed by an **in-memory store**. Swap the `hooks`
for your database and the shape is unchanged.

## Files

| File      | Purpose                                                              |
| --------- | ------------------------------------------------------------------- |
| `main.ts` | The full flow with in-memory `Map`-backed hooks. Runnable as-is.    |

## Run

```bash
deno run packages/pact/examples/password-jwt/main.ts
bun run  packages/pact/examples/password-jwt/main.ts
node --import tsx packages/pact/examples/password-jwt/main.ts
```

## What to notice

- **`Pact.create(...)`** is the only constructor.
- **`createUser` stores `draft.secret` verbatim** — pact has already
  pbkdf2-hashed the password before the hook runs; hooks never see plaintext.
- **A wrong password resolves to `null`**, never an exception — the uniform
  contract that lets one middleware treat every failure the same way.
- **`refresh()` rotates the refresh token** (its generation bumps) and issues a
  fresh access token; **`logout()` kills the whole family**, so the old refresh
  token is dead afterward.
- The `secret` is an inline literal for the demo only — in production load it
  from an env var or secret manager, and keep it ≥ 32 bytes for HS256.
