# API Keys

Self-contained API key minting: PACT issues a public id and a one-time
secret, and asks you to store only a SHA-256 hash, so no external key service
is needed. Minting draws on `@tundralibs/id` (nanoID) and `@tundralibs/crypt`
(SHA-256) with zero external dependencies.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Minting a Key](#minting-a-key)
- [Options](#options)
- [Storage Model](#storage-model)
- [Verifying a Secret](#verifying-a-secret)
- [Lifecycle Example](#lifecycle-example)
- [Signing Requests](#signing-requests)
- [Related](#related)

## Minting a Key

`generateAPIKey(options?)` returns a three-field pair — `{ id, secret,
secretHash }`:

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({ bits: { READ: 1n } }); // bits is the required registry

const key = await pact.generateAPIKey();
// {
//   id:         'pact_ak_V1StGXR8Z5jdHi6B',       // public — safe to store/index
//   secret:     'pact_sk_IpoRWTff6Qw9y8xKn2…',    // show once, never store
//   secretHash: 'd2e1f0a3c7b4…',                  // SHA-256 hex — persist this
// }
```

- **`id`** — the public identifier, formatted `<prefix>_ak_…`. Safe to store,
  index, and log; use it to look the record up on verification.
- **`secret`** — the credential, formatted `<prefix>_sk_…`. Return it to the
  caller exactly once; it is never recoverable afterwards.
- **`secretHash`** — the SHA-256 hex of `secret`. This is the only part you
  persist for later verification.

## Options

`generateAPIKey(options?)` accepts:

| Option         | Type     | Default  | Description                                                                                                     |
| -------------- | -------- | -------- | --------------------------------------------------------------------------------------------------------------- |
| `prefix`       | `string` | `'pact'` | Stamped on both parts (`<prefix>_ak_…` / `<prefix>_sk_…`) so keys are recognizable in logs and secret scanners. |
| `idLength`     | `number` | `16`     | Random length of the id portion.                                                                                |
| `secretLength` | `number` | `32`     | Random length of the secret. At the default this is ~168 bits of entropy over nanoID's web-safe alphabet.       |

## Storage Model

The consumer stores the `id` and the `secretHash`, and **never** the `secret`:

| Field        | Persist?  | Notes                                                                     |
| ------------ | --------- | ------------------------------------------------------------------------- |
| `id`         | Yes       | Public identifier; safe to index and log. Look the record up by it.       |
| `secretHash` | Yes       | SHA-256 hex; the only value you compare against on verification.          |
| `secret`     | **Never** | Shown once at mint time. Not recoverable — if it is lost, mint a new key. |

The secret lives only in the response from `generateAPIKey` and in whatever you
hand to the caller — PACT keeps no copy. A leaked hash cannot be turned back
into a working secret.

## Verifying a Secret

`verifyAPIKey(secret, secretHash)` re-hashes the presented secret and compares
it against the stored hash in **constant time**, returning a boolean:

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({ bits: { READ: 1n } });

// `presented` comes off the request; `stored.secretHash` from your database
const ok = await pact.verifyAPIKey(presented, stored.secretHash);
if (!ok) {
  // reject the request — the secret does not match the stored hash
}
```

The comparison is length-checked and then digest-for-digest constant-time, so
it leaks no timing signal about how much of the secret matched. Neither
`generateAPIKey` nor `verifyAPIKey` throws for malformed input — a wrong or
empty secret simply returns `false`.

## Lifecycle Example

Mint on issue, store the id + hash, verify on each request:

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({ bits: { READ: 1n } });

// 1. Mint — when a user creates an API key
async function issueKey() {
  const key = await pact.generateAPIKey({ prefix: 'acme' });
  // 2. Store — only the id + secretHash ever reach the database
  await db.apiKeys.insert({ id: key.id, secretHash: key.secretHash });
  // Show key.secret to the user exactly once; you will never see it again
  return { id: key.id, secret: key.secret };
}

// 3. Verify — on an incoming request carrying its id and secret
async function authenticate(incoming: { id: string; secret: string }) {
  const row = await db.apiKeys.findById(incoming.id);
  return row !== null &&
    await pact.verifyAPIKey(incoming.secret, row.secretHash);
}
```

## Signing Requests

The minted `secret` is an ordinary string, so a caller can use it as the HMAC
key for request signing via `sign()` / `verify()`:

```typescript
import { PACT } from '@tundralibs/pact';

const pact = new PACT({ bits: { READ: 1n } });

const key = await pact.generateAPIKey();

// The client signs a request body with its secret…
const signature = await pact.sign(body, key.secret);
// …and the server verifies with the same secret.
const valid = await pact.verify(body, signature, key.secret);
```

See [Tokens](./Pact-Tokens.md) for the full `sign()` / `verify()` and JWT
surface.

## Related

- [Tokens](./Pact-Tokens.md) — JWT issue/verify/refresh and HMAC request signing with `sign()` / `verify()`.

---

[← Back to Pact](../README.md)
