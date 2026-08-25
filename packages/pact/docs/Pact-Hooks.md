# Hooks — the storage seam

pact owns no storage. Users, sessions, api keys, and tokens live in YOUR
database under YOUR schema; pact reaches them through `hooks` — a flat
object of **optional, promise-returning functions**. No adapter interface,
no base class to extend, no generated tables: each hook is one obvious
read or write, and you implement only the ones the features you enable
need.

All crypto happens inside pact (via `@tundralibs/crypt`) **before** a hook
runs — hooks only ever see opaque hash strings, never a password, token,
or api-key secret.

## The one lookup: `getUser(query)`

One hook serves every user lookup, discriminated by `by`:

| Query                                | Used by                                 | Must the result carry `secret`? |
| ------------------------------------ | --------------------------------------- | ------------------------------- |
| `{ by: 'IDENTIFIER', identifier }`   | `login('password')`, the `BASIC` scheme | yes (pbkdf2 hash)               |
| `{ by: 'ID', id }`                   | token/session → principal resolution    | no                              |
| `{ by: 'OAUTH', provider, subject }` | federated login mapping                 | no                              |

```typescript
import { Pact } from '@tundralibs/pact';
import type { PactStoredUser } from '@tundralibs/pact/types';

declare const db: {
  byEmail(email: string): Promise<PactStoredUser | null>;
  byId(id: string): Promise<PactStoredUser | null>;
  byOAuth(provider: string, subject: string): Promise<PactStoredUser | null>;
};

const pact = Pact.create({
  bits: { READ: 1n },
  hooks: {
    getUser: (q) =>
      q.by === 'ID'
        ? db.byId(q.id)
        : q.by === 'IDENTIFIER'
        ? db.byEmail(q.identifier)
        : db.byOAuth(q.provider, q.subject),
  },
});
```

## Stored shapes

The contracts are plain objects — how you persist them is your business:

- **`PactStoredUser`** — `{ id, secret?, otpSecret?, grants?, status?,
  metadata? }`. `grants` are the user's **effective** per-module masks as
  decimal strings — compose group/role membership yourself (the
  [`./authz` algebra](Pact-Authorization.md) makes it a one-liner) and
  return the flat result. `status` defaults to `'ACTIVE'`; `'LOCKED'` /
  `'DISABLED'` users cannot log in, authenticate, or pass `can`.
- **`PactStoredSession`** — opaque session AND refresh-family record:
  `{ id, userId, expiresAt, generation?, rotatedAt?, revokedAt? }`.
- **`PactStoredApiKey`** — `{ id, userId, secretHash?, secret?, grants?,
  revokedAt? }`. Presented (`APIKEY`) keys store only `secretHash`;
  `HMAC` signing keys must store the retrievable `secret` (encrypt at
  rest via crypt when warranted).
- **`PactStoredToken`** — simple static token, keyed by its sha-256:
  `{ hash, userId, grants?, expiresAt?, revokedAt? }`. The token itself
  is never stored.

`grants` on an api key or token **override** the user's grants — a scoped
key checks against its own mask, not the owner's full set.

## Hook reference

| Hook                 | Signature (all may be sync or async)     | Enables                                 |
| -------------------- | ---------------------------------------- | --------------------------------------- |
| `getUser`            | `(query) => PactStoredUser \| null`      | nearly everything — see the table below |
| `createUser`         | `(draft) => PactStoredUser`              | `register()`, OAuth first-login         |
| `updateUser`         | `(id, patch) => void`                    | `setPassword()`, `enrollOtp()`          |
| `saveSession`        | `(session) => void`                      | `'OPAQUE'` sessions, refresh rotation   |
| `getSession`         | `(id) => PactStoredSession \| null`      | 〃                                      |
| `deleteSession`      | `(id) => void`                           | 〃 + `logout()`                         |
| `deleteUserSessions` | `(userId) => void`                       | `logoutAll()`                           |
| `getApiKey`          | `(keyId) => PactStoredApiKey \| null`    | `APIKEY` + `HMAC` schemes               |
| `saveApiKey`         | `(record) => void`                       | `issueApiKey()`                         |
| `revokeApiKey`       | `(keyId) => void`                        | optional revocation sugar               |
| `getToken`           | `(tokenHash) => PactStoredToken \| null` | `TOKEN` scheme                          |
| `saveToken`          | `(record) => void`                       | `issueToken()`                          |
| `isRevoked`          | `(claims) => boolean`                    | extra verify-time JWT veto (denylists)  |

## The requiredness table

Enabling a capability gates its hooks — the constructor throws
`MISSING_HOOK` on a gap, at startup rather than mid-request:

| You enable…                             | Required hooks                                 |
| --------------------------------------- | ---------------------------------------------- |
| authorization only                      | none                                           |
| `password` / the `BASIC` scheme         | `getUser`                                      |
| `oauth`                                 | `getUser` + `createUser`                       |
| `apiKeys` (`APIKEY`/`HMAC` schemes)     | `getApiKey` + `getUser`                        |
| `tokens` (`TOKEN` scheme)               | `getToken` + `getUser`                         |
| `session.strategy: 'OPAQUE'` or refresh | `saveSession` + `getSession` + `deleteSession` |

Methods with a single obvious hook (`register` → `createUser`,
`setPassword`/`enrollOtp` → `updateUser`, `logoutAll` →
`deleteUserSessions`, `issueApiKey` → `saveApiKey`, `issueToken` →
`saveToken`) check at call time instead.

## OAuth first login: the policy is yours

On a federated login pact looks up `getUser({ by: 'OAUTH', … })`; when
that returns `null` it calls `createUser` with the **verified** profile in
`draft.oauth`. Whether that creates a fresh account or links to an
existing one (e.g. by verified email) is app policy — deliberately: silent
auto-linking on an unverified email is a classic account-takeover vector,
so pact never bakes that decision in.

```typescript
import type { PactNewUser, PactStoredUser } from '@tundralibs/pact/types';

declare const db: {
  byVerifiedEmail(email: string): Promise<PactStoredUser | null>;
  link(userId: string, provider: string, subject: string): Promise<void>;
  insert(draft: PactNewUser): Promise<PactStoredUser>;
};

// a createUser hook that links by VERIFIED provider email, else creates
export const createUser = async (
  draft: PactNewUser,
): Promise<PactStoredUser> => {
  const oauth = draft.oauth;
  if (oauth !== undefined && oauth.profile.emailVerified === true) {
    const existing = await db.byVerifiedEmail(oauth.profile.email ?? '');
    if (existing !== null) {
      await db.link(existing.id, oauth.provider, oauth.subject);
      return existing;
    }
  }
  return await db.insert(draft);
};
```
