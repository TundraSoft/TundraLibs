# API keys

Issue API keys and authenticate them with the `APIKEY` scheme — mint a key,
authenticate a presented `keyId` + `secret`, scope a key below its owner's
grants, and revoke it — backed by an **in-memory store**. Swap the `hooks` for
your database and the shape is unchanged.

## Files

| File      | Purpose                                                             |
| --------- | ------------------------------------------------------------------- |
| `main.ts` | The full flow with in-memory `Map`-backed hooks. Runnable as-is.    |

## Run

```bash
deno run packages/pact/examples/api-keys/main.ts
bun run  packages/pact/examples/api-keys/main.ts
node --import tsx packages/pact/examples/api-keys/main.ts
```

## What to notice

- **`apiKeys: true`** enables the `APIKEY` + `HMAC` schemes and `issueApiKey()`.
  No `secret` is needed — the scheme signs nothing; it hashes and constant-time-
  compares a per-request secret.
- **The plaintext secret is returned once and is unrecoverable** —
  `issueApiKey()` stores only its sha-256 hash via `saveApiKey`, so hooks never
  see the plaintext. Lose it and you must issue a new key.
- **A wrong secret or an unknown key id resolves to `null`**, never an
  exception — the uniform contract that lets one middleware treat every failure
  the same way.
- **A key can carry its own `grants`**, which override the owner's — here a
  scoped key gets `READ|EDIT` on `Post` even though the user is `READ`-only.
- **Revocation stamps `revokedAt`** in the store; authentication then fails
  immediately.
