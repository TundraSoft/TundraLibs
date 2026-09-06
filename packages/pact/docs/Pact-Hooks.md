# Hooks

The storage seam: flat, optional, Promise-friendly functions that connect
pact to your database. pact calls them, optionally caches what they return
(see [Caching](Pact-Caching.md)), and never owns a schema. Ready-made
tables for every hook are in [Storage](Pact-Storage.md).

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Which features need which hooks](#which-features-need-which-hooks)
- [Stored shapes](#stored-shapes)
- [The hooks](#the-hooks)
- [How secrets are stored](#how-secrets-are-stored)
- [Contract rules](#contract-rules)

## Which features need which hooks

Every hook is optional. A feature whose hooks are missing throws
`MISSING_HOOK` the first time it is used, so misconfiguration is loud and
immediate.

| Feature                                    | Hooks required                                                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hasPermission` / `assert` / `principalOf` | `getPrincipal`, or `getUser`, or `getApiKey`                                                                                                                           |
| `register`                                 | `getUser` + `createUser`                                                                                                                                               |
| `login` / `verifyCredentials`              | `getUser`, plus a session store (below)                                                                                                                                |
| Session store                              | `saveSession` + `getSession` + `deleteSession` — or a `session` cache TTL (cache-only mode)                                                                            |
| `authenticate` `BEARER`                    | the session store + `getUser`/`getPrincipal`                                                                                                                           |
| `authenticate` `BASIC`                     | `getUser`                                                                                                                                                              |
| `authenticate` `APIKEY` / `HMAC`           | `getApiKey`                                                                                                                                                            |
| `issueApiKey` / `revokeApiKey`             | `saveApiKey` / `revokeApiKey`                                                                                                                                          |
| `logoutAll`                                | `deleteSessions`                                                                                                                                                       |
| `setPassword` / password reset             | `setPassword` (+ `saveResetToken` / `consumeResetToken` for the reset flow)                                                                                            |
| `verifyMFA`                                | `getUser`                                                                                                                                                              |
| OAuth login                                | `getUser` (+ `createUser` when `autoProvision` is on)                                                                                                                  |
| Passkeys (all four ceremonies)             | `getPasskey` + `getPasskeys` + `savePasskey` + `updatePasskeyCounter` + `getUser` — checked at construction; `finishPasskeyLogin` additionally needs the session store |

## Stored shapes

All shapes are exported from `@tundralibs/pact/types`.

| Type                   | Purpose                                                                                                        |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- |
| `PactStoredUser`       | `id`, `status`, `passwordHash?`, `mfaSecret?`, `grants`, `metadata?`                                           |
| `PactStoredApiKey`     | `id`, `userId?`, `status`, `secret` (raw at this boundary), `grants`, `metadata?`                              |
| `PactStoredSession`    | `id` (token sha-256), `userId`, `expiresAt`, `generation?`, `rotatedAt?`, `metadata?`                          |
| `PactStoredResetToken` | `id` (token sha-256), `userId`, `expiresAt`                                                                    |
| `PactStoredPasskey`    | `id` (credential id), `userId`, `publicKey` (JWK string), `algorithm`, `signCount`, `transports?`, `metadata?` |
| `PactUserQuery`        | `{by:'ID'}` \| `{by:'IDENTIFIER'}` \| `{by:'OAUTH', provider, subject}`                                        |
| `PactCreateUserInput`  | What `createUser` receives, including the OAuth link on JIT provisioning                                       |
| `PactPrincipal`        | What `getPrincipal` returns: `kind`, `id`, per-module bigint `grants`                                          |

`grants` on stored records is the serialized form — a JSON object of module
name to decimal bit-string, produced by `serializeGrants` and parsed by
`deserializeGrants`. Deserialization drops `__proto__`/`constructor`/
`prototype` keys and caps masks at 100 digits.

## The hooks

The authoritative contracts live in the `PactHooks` JSDoc; the load-bearing
points:

- **`getPrincipal(id)`** returns a fully composed principal: effective
  per-module masks with groups/roles already folded in. Return `null` for
  an unknown actor or one that must not authorize. When both `getPrincipal`
  and `getUser` exist, `getPrincipal` wins for id-based resolution.
- **`getUser(query)`** serves three discriminated lookups: by id, by login
  identifier, and by OAuth link (`provider` + `subject`). Return `null` for
  no match; never throw for absence.
- **`createUser(input)`** persists and returns the stored record. On OAuth
  JIT provisioning `input.oauth` carries the link (`provider`, `subject`,
  normalized `profile`) — store it so the `by: 'OAUTH'` query finds the user
  next login.
- **`getApiKey(keyId)`** returns the record with `secret` decrypted — see
  [How secrets are stored](#how-secrets-are-stored).
- **`saveSession(session)`** should be an insert (or a
  conditional/keyed write), not a blind upsert of arbitrary ids: session ids
  are pact-minted, and a blind upsert lets a deleted session be resurrected
  by a late write racing a logout.
- **`consumeResetToken(id)`** returns and deletes in one motion, which is
  what makes reset tokens single-use even under concurrent attempts.

Actor ids share one namespace across kinds: a user id and an API-key id
must never collide (pact's generated `pact_ak_...` key ids make this true
by construction; prefix your own ids if you mint them yourself).

## How secrets are stored

Each credential kind has one correct storage treatment, and pact's boundary
shapes assume it:

| Value                   | Treatment                                        | Why                                                              |
| ----------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| Password                | pbkdf2 hash (pact hashes it for you)             | Verification only ever compares hashes                           |
| API-key secret          | Encrypt at rest, app-side                        | APIKEY comparison and HMAC recomputation both need the raw bytes |
| TOTP seed (`mfaSecret`) | Encrypt at rest, app-side                        | TOTP computation needs the raw seed                              |
| Session / reset tokens  | Nothing — the stored `id` is the token's sha-256 | The raw token is shown once and never stored                     |

Hooks return raw secrets: decrypt inside `getApiKey`/`getUser`, encrypt
inside `saveApiKey`/your enrollment write. pact never sees or owns your
encryption keys. The AWS SigV4 model is the precedent for retrievable API
secrets: one secret serves both presented-secret and signature schemes.

## Contract rules

1. Return `null` for absence; throw only for real faults (a down database).
   A thrown hook error surfaces to the caller unchanged — it is never
   swallowed into a false "denied".
2. Hooks may be sync or async; pact awaits everything.
3. Statuses are yours. pact only asks "is this status in `activeStatuses`";
   `PENDING`, `LOCKED`, `TRIAL` and friends are app vocabulary.
4. After changing an actor's grants or status in storage, call
   `invalidatePrincipal(id)` — with caching on, pact cannot see your
   writes. See [Caching](Pact-Caching.md).

---

[← Back to Pact](../README.md)
