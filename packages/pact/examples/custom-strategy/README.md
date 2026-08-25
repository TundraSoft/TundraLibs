# Custom login strategy

The `strategies` escape hatch — a login method pact does **not** verify itself.
Password login, OAuth, and the API-key/token schemes are checked by pact; a
strategy is for anything **something else** already verified: LDAP, SSO, or —
here — a one-time **magic link** that an email service validated. You do the
verification, hand pact a typed result, and pact mints a normal JWT session
from it. Backed by an **in-memory store**; swap the `hooks`/token store for your
own and the shape is unchanged.

## Files

| File      | Purpose                                                             |
| --------- | ------------------------------------------------------------------- |
| `main.ts` | A single-use magic-link strategy, wired end-to-end. Runnable as-is. |

## Run

```bash
deno run packages/pact/examples/custom-strategy/main.ts
bun run  packages/pact/examples/custom-strategy/main.ts
node --import tsx packages/pact/examples/custom-strategy/main.ts
```

## What to notice

- **A strategy is `(credentials) => PactStrategyResult`** — the typed union
  `{ ok: true; user; isNew? }` or `{ ok: false; reason? }`. On `ok: true` pact
  takes the `user` you supply and mints a session; the login path never touches
  `getUser`.
- **`getUser` is still required** — `verify()` resolves the principal by `ID`
  from the minted token, so the by-`ID` lookup must be wired even though the
  strategy provides the user at login time.
- **A JWT session is minted, so `secret` is required** (HS256 needs ≥ 32 bytes).
- **The link is single-use** — the strategy consumes the token, so replaying
  the same one resolves to `null`, as does an unknown token.
- **`{ ok: false }` is a clean `null`** (emits `loginFailed` with no error),
  the same uniform contract as a wrong password. An operational **throw** inside
  the strategy is different: it rethrows out of `login()` and emits
  `loginFailed` **with** the error.
- The `secret` is an inline literal for the demo only — in production load it
  from an env var or secret manager.
