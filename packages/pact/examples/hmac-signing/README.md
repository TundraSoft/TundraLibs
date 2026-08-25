# HMAC request signing + content signing

Two mirror-image HMAC flows on one pact instance, backed by an **in-memory
store**:

1. **Inbound** — a client signs a canonical request payload with a shared
   secret; `authenticate({ scheme: 'HMAC' })` recomputes the signature against
   the key's stored secret and resolves a principal (or `null`).
2. **Outbound** — pact signs content your api emits (a webhook body) with
   `sign()`, and the receiver checks it with `verifySignature()`.

Swap the `hooks` for your database and the shape is unchanged.

## Files

| File      | Purpose                                                              |
| --------- | ------------------------------------------------------------------- |
| `main.ts` | Both HMAC flows with in-memory `Map`-backed hooks. Runnable as-is.  |

## Run

```bash
deno run packages/pact/examples/hmac-signing/main.ts
bun run  packages/pact/examples/hmac-signing/main.ts
node --import tsx packages/pact/examples/hmac-signing/main.ts
```

## What to notice

- **An HMAC api-key stores the RAW `secret`**, not a hash — verification
  *recomputes* the signature, so a hash-only key cannot verify. (The `APIKEY`
  scheme is the opposite: it stores only `secretHash`.) Encrypt the secret at
  rest in real code.
- **The signed `payload` carries a timestamp and a nonce.** pact verifies the
  signature but cannot see freshness inside an opaque payload, so **replay
  defense is yours**: a captured `(payload, signature)` pair verifies forever
  unless you reject stale timestamps and remember recently-seen nonces.
- **A tampered payload or unknown key resolves to `null`**, never a throw — the
  uniform contract shared by every `authenticate` scheme.
- **`verifySignature` returns `false` for a garbled signature**, never an
  exception — an attacker-supplied header can't 500 the verifier.
- **The content-signing key is HKDF-derived from `secret`** under a distinct
  domain label — *not* the raw JWT signing secret. Content you sign can never be
  replayed as a valid JWT signature, even though both are HMAC under the same
  configured `secret`.
- The `secret` is an inline literal for the demo only — in production load it
  from an env var or secret manager, and keep it ≥ 32 bytes for HS256.
