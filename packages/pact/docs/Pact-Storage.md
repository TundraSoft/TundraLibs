# Storage

A suggested table structure that supports every pact capability — login,
sessions and refresh families, API keys, HMAC, password reset, MFA, OAuth
sign-in, and grants. pact never reads your database directly; these tables
are one proven way to back the [hooks](Pact-Hooks.md), sized so each hook
is a single indexed query. Rename anything; the hook shapes are the only
contract.

## Table of Contents

- [Schema](#schema)
- [Column-to-shape mapping](#column-to-shape-mapping)
- [Hook implementation sketch](#hook-implementation-sketch)
- [Notes per table](#notes-per-table)

## Schema

ANSI-flavoured DDL; adjust types to taste (`TEXT` → `VARCHAR(n)`,
`TIMESTAMP` → `TIMESTAMPTZ` on PostgreSQL, `JSON` → `JSONB`/`TEXT`).

```sql
CREATE TABLE users (
  id             TEXT PRIMARY KEY,          -- stable actor id
  identifier     TEXT NOT NULL UNIQUE,      -- login identifier (email)
  status         TEXT NOT NULL,             -- ACTIVE / PENDING / LOCKED / ...
  password_hash  TEXT,                      -- pbkdf2 string from pact; NULL = password-less
  mfa_secret     TEXT,                      -- TOTP seed, ENCRYPTED app-side; NULL = not enrolled
  grants         TEXT NOT NULL,             -- serializeGrants() JSON
  metadata       JSON,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_oauth_links (
  provider       TEXT NOT NULL,             -- the oauth instance name ('google')
  subject        TEXT NOT NULL,             -- provider's stable user id
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  profile        JSON,                      -- last normalized profile (optional)
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (provider, subject)
);

CREATE TABLE api_keys (
  id             TEXT PRIMARY KEY,          -- pact_ak_... — the APIKEY actor id
  user_id        TEXT REFERENCES users (id) ON DELETE CASCADE,  -- NULL = service key
  status         TEXT NOT NULL,
  secret         TEXT NOT NULL,             -- ENCRYPTED app-side; hooks decrypt
  grants         TEXT NOT NULL,             -- serializeGrants() JSON
  metadata       JSON,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,          -- sha-256 of the token (JWT: the family sid)
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at     TIMESTAMP NOT NULL,
  generation     INTEGER,                   -- JWT refresh family generation; NULL for opaque
  rotated_at     TIMESTAMP,                 -- last rotation; NULL for opaque
  metadata       JSON,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX sessions_user_id ON sessions (user_id);  -- deleteSessions(userId)

CREATE TABLE passkeys (
  id             TEXT PRIMARY KEY,          -- WebAuthn credential id, base64url
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  public_key     TEXT NOT NULL,             -- JWK JSON from registration; not secret
  algorithm      TEXT NOT NULL,             -- 'ES256' | 'RS256'
  sign_count     INTEGER NOT NULL,
  transports     JSON,                      -- ['internal', 'hybrid', ...]
  metadata       JSON,                      -- device label etc.
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX passkeys_user_id ON passkeys (user_id);  -- getPasskeys(userId)

CREATE TABLE reset_tokens (
  id             TEXT PRIMARY KEY,          -- sha-256 of the reset token
  user_id        TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  expires_at     TIMESTAMP NOT NULL
);
```

## Column-to-shape mapping

| Table.column          | Hook shape field               | Notes                                                                          |
| --------------------- | ------------------------------ | ------------------------------------------------------------------------------ |
| `users.id`            | `PactStoredUser.id`            | Becomes the USER principal id                                                  |
| `users.identifier`    | — (lookup only)                | Serves `getUser({by:'IDENTIFIER'})`; unique index is the register race-settler |
| `users.status`        | `PactStoredUser.status`        | Compared against `activeStatuses`                                              |
| `users.password_hash` | `PactStoredUser.passwordHash`  | Written by pact via `createUser`/`setPassword`                                 |
| `users.mfa_secret`    | `PactStoredUser.mfaSecret`     | Decrypt in `getUser`, store encrypted                                          |
| `users.grants`        | `PactStoredUser.grants`        | The `serializeGrants` string, verbatim                                         |
| `user_oauth_links.*`  | `PactCreateUserInput.oauth`    | Written on JIT provisioning; serves `{by:'OAUTH'}`                             |
| `api_keys.secret`     | `PactStoredApiKey.secret`      | Decrypt in `getApiKey`, encrypt in `saveApiKey`                                |
| `sessions.id`         | `PactStoredSession.id`         | Already hashed by pact; store verbatim                                         |
| `sessions.generation` | `PactStoredSession.generation` | Only the JWT strategy writes it                                                |
| `passkeys.id`         | `PactStoredPasskey.id`         | The APIKEY-style lookup key for assertions                                     |
| `passkeys.public_key` | `PactStoredPasskey.publicKey`  | Verification key only — nothing here is secret                                 |
| `passkeys.sign_count` | `PactStoredPasskey.signCount`  | Written via `updatePasskeyCounter`, keyed update                               |
| `reset_tokens.id`     | `PactStoredResetToken.id`      | Already hashed by pact; store verbatim                                         |

## Hook implementation sketch

```ts ignore
import { deserializeGrants, type PactHooks } from '@tundralibs/pact';

const hooks: PactHooks<'Post' | 'Billing'> = {
  getUser: async (q) => {
    const row = q.by === 'ID'
      ? await db.one('SELECT * FROM users WHERE id = $1', [q.id])
      : q.by === 'IDENTIFIER'
      ? await db.one('SELECT * FROM users WHERE identifier = $1', [
        q.identifier,
      ])
      : await db.one(
        `SELECT u.* FROM users u
           JOIN user_oauth_links l ON l.user_id = u.id
          WHERE l.provider = $1 AND l.subject = $2`,
        [q.provider, q.subject],
      );
    if (row === null) return null;
    return {
      id: row.id,
      status: row.status,
      passwordHash: row.password_hash ?? undefined,
      mfaSecret: row.mfa_secret === null ? undefined : decrypt(row.mfa_secret),
      grants: row.grants,
      metadata: row.metadata ?? undefined,
    };
  },
  getApiKey: async (id) => {
    const row = await db.one('SELECT * FROM api_keys WHERE id = $1', [id]);
    return row === null ? null : {
      id: row.id,
      userId: row.user_id ?? undefined,
      status: row.status,
      secret: decrypt(row.secret), // raw at the hook boundary
      grants: row.grants,
    };
  },
  saveSession: (s) =>
    db.run(
      `INSERT INTO sessions (id, user_id, expires_at, generation, rotated_at, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE
         SET expires_at = $3, generation = $4, rotated_at = $5`,
      [s.id, s.userId, s.expiresAt, s.generation, s.rotatedAt, s.metadata],
    ),
  getSession: (id) => db.one('SELECT ... FROM sessions WHERE id = $1', [id]),
  deleteSession: (id) => db.run('DELETE FROM sessions WHERE id = $1', [id]),
  deleteSessions: (userId) =>
    db.run('DELETE FROM sessions WHERE user_id = $1', [userId]),
  // createUser, saveApiKey, revokeApiKey, setPassword,
  // saveResetToken, consumeResetToken: single-statement writes on the
  // tables above. consumeResetToken is DELETE ... RETURNING (or a
  // SELECT + DELETE in one transaction) — return-and-delete is what
  // makes reset tokens single-use.
};
```

## Notes per table

- **users** — the unique index on `identifier` is what ultimately settles
  concurrent `register` races; pact's existence check is advisory. Grants
  strings are opaque to SQL: update them by writing a new
  `serializeGrants(...)` value, then call `invalidatePrincipal(userId)`.
- **user_oauth_links** — one row per provider identity. The composite
  primary key prevents one provider identity from linking to two users.
  Linking an existing signed-in user to a new provider is an app flow: an
  authenticated `INSERT` into this table.
- **api_keys** — `secret` is encrypted with your key, not hashed: both the
  APIKEY scheme (constant-time compare) and HMAC (signature recompute) need
  the raw bytes. `revokeApiKey` may delete the row or set a non-active
  status; keep the row when you want revoked keys auditable.
- **sessions** — for the JWT strategy each row is a refresh family
  (`id` = the `sid` claim), not an access token; access tokens are signed,
  not stored. The upsert shown updates only rotation fields for an existing
  id — see the `saveSession` note in [Hooks](Pact-Hooks.md) about not
  resurrecting deleted sessions with blind writes. An `expires_at` sweep
  (cron `DELETE WHERE expires_at < now()`) keeps the table bounded; expiry
  is enforced by pact regardless.
- **passkeys** — one row per registered authenticator; a user may hold
  several. `public_key` is a verification key, so this table needs no
  encryption. Deleting a row revokes the passkey (app management UI).
  Write `updatePasskeyCounter` as a guarded update —
  `UPDATE passkeys SET sign_count = ? WHERE id = ? AND sign_count < ?` —
  so concurrent assertions cannot race the clone check backwards.
- **reset_tokens** — rows are short-lived (default 15-minute window) and
  deleted on consumption; the same expiry sweep applies.

---

[← Back to Pact](../README.md)
