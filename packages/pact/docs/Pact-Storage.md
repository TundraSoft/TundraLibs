# Storage

A suggested table structure that supports every pact capability — login,
sessions and refresh families, API keys, HMAC, password reset, MFA, OAuth
sign-in, and grants. pact never reads your database directly; these tables
are one proven way to back the [hooks](Pact-Hooks.md), sized so each hook
is a single indexed query. Rename anything; the hook shapes are the only
contract.

## Table of Contents

- [Schema](#schema)
- [Exact requirements](#exact-requirements)
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

## Exact requirements

One matrix per table: the exact hook-shape field and TypeScript type each
column serves, whether pact requires it, and the constraint that makes the
hook correct. `NULL` columns map to `undefined` on the hook boundary in
both directions. `created_at` columns are app-only; pact never reads them.

### users

| Column          | Type | Null     | Hook field · TS type                     | Requirement                                                                     |
| --------------- | ---- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| `id`            | TEXT | NOT NULL | `PactStoredUser.id` · `string`           | Primary key; becomes the USER principal id; one id namespace with API keys      |
| `identifier`    | TEXT | NOT NULL | — (lookup only)                          | UNIQUE — serves `getUser({by:'IDENTIFIER'})` and settles register races         |
| `status`        | TEXT | NOT NULL | `.status` · `string`                     | Must hold a value comparable against `activeStatuses`                           |
| `password_hash` | TEXT | NULL     | `.passwordHash?` · `string`              | pact-written pbkdf2 string via `createUser`/`setPassword`; NULL = password-less |
| `mfa_secret`    | TEXT | NULL     | `.mfaSecret?` · `string`                 | Store encrypted; `getUser` returns it decrypted (raw base32 seed)               |
| `grants`        | TEXT | NOT NULL | `.grants` · `string`                     | Verbatim `serializeGrants` JSON; never edited in SQL                            |
| `metadata`      | JSON | NULL     | `.metadata?` · `Record<string, unknown>` | Copied verbatim onto the resolved principal                                     |

### user_oauth_links

| Column     | Type | Null     | Hook field · TS type                | Requirement                                                          |
| ---------- | ---- | -------- | ----------------------------------- | -------------------------------------------------------------------- |
| `provider` | TEXT | NOT NULL | `PactUserQuery.provider` · `string` | The oauth instance name; composite PK `(provider, subject)`          |
| `subject`  | TEXT | NOT NULL | `PactUserQuery.subject` · `string`  | Provider's stable user id; the PK bars one identity → two users      |
| `user_id`  | TEXT | NOT NULL | — (join to `users`)                 | FK; row written from `PactCreateUserInput.oauth` on JIT provisioning |
| `profile`  | JSON | NULL     | `PactCreateUserInput.oauth.profile` | Optional convenience copy; pact never reads it back                  |

### api_keys

| Column     | Type | Null     | Hook field · TS type                     | Requirement                                                                                |
| ---------- | ---- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `id`       | TEXT | NOT NULL | `PactStoredApiKey.id` · `string`         | Primary key; `<prefix>_ak_` + 32 hex chars as pact generates it                            |
| `user_id`  | TEXT | NULL     | `.userId?` · `string`                    | FK; NULL = service key (no owner gate); non-NULL keys inherit the owner's status           |
| `status`   | TEXT | NOT NULL | `.status` · `string`                     | Gated against `activeStatuses` like a user status                                          |
| `secret`   | TEXT | NOT NULL | `.secret` · `string`                     | Encrypt at rest; `getApiKey` MUST return it decrypted (raw, `<prefix>_as_` + 64 hex chars) |
| `grants`   | TEXT | NOT NULL | `.grants` · `string`                     | Verbatim `serializeGrants` JSON                                                            |
| `metadata` | JSON | NULL     | `.metadata?` · `Record<string, unknown>` | Copied onto the APIKEY principal                                                           |

### sessions

| Column       | Type      | Null     | Hook field · TS type                     | Requirement                                                                                            |
| ------------ | --------- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `id`         | TEXT      | NOT NULL | `PactStoredSession.id` · `string`        | Primary key, pact-minted: 64 hex chars (opaque, sha-256 of the token) or 32 hex chars (JWT family sid) |
| `user_id`    | TEXT      | NOT NULL | `.userId` · `string`                     | FK; index required — `deleteSessions(userId)` deletes by it                                            |
| `expires_at` | TIMESTAMP | NOT NULL | `.expiresAt` · `Date`                    | Absolute expiry; must round-trip as a `Date`                                                           |
| `generation` | INTEGER   | NULL     | `.generation?` · `number`                | JWT strategy only; monotonically overwritten on refresh                                                |
| `rotated_at` | TIMESTAMP | NULL     | `.rotatedAt?` · `Date`                   | JWT strategy only; timestamps the last rotation for the grace window                                   |
| `metadata`   | JSON      | NULL     | `.metadata?` · `Record<string, unknown>` | From `createSession(..., { metadata })`                                                                |

### passkeys

| Column       | Type    | Null     | Hook field · TS type                     | Requirement                                                                    |
| ------------ | ------- | -------- | ---------------------------------------- | ------------------------------------------------------------------------------ |
| `id`         | TEXT    | NOT NULL | `PactStoredPasskey.id` · `string`        | Primary key; base64url WebAuthn credential id, at most 1364 chars (1023 bytes) |
| `user_id`    | TEXT    | NOT NULL | `.userId` · `string`                     | FK; index required — `getPasskeys(userId)` selects by it                       |
| `public_key` | TEXT    | NOT NULL | `.publicKey` · `string`                  | JSON-serialized JWK, stored verbatim; verification key, not a secret           |
| `algorithm`  | TEXT    | NOT NULL | `.algorithm` · `'ES256' \| 'RS256'`      | Exactly one of the two values                                                  |
| `sign_count` | INTEGER | NOT NULL | `.signCount` · `number`                  | 0 to 2^32-1; write via `updatePasskeyCounter` guarded `WHERE sign_count < ?`   |
| `transports` | JSON    | NULL     | `.transports?` · `readonly string[]`     | Echoed into `allowCredentials`; store what registration reported               |
| `metadata`   | JSON    | NULL     | `.metadata?` · `Record<string, unknown>` | App-owned (device label etc.)                                                  |

### reset_tokens

| Column       | Type      | Null     | Hook field · TS type                 | Requirement                                                    |
| ------------ | --------- | -------- | ------------------------------------ | -------------------------------------------------------------- |
| `id`         | TEXT      | NOT NULL | `PactStoredResetToken.id` · `string` | Primary key; 64 hex chars (sha-256 of the token, pact-minted)  |
| `user_id`    | TEXT      | NOT NULL | `.userId` · `string`                 | FK to the user being reset                                     |
| `expires_at` | TIMESTAMP | NOT NULL | `.expiresAt` · `Date`                | Absolute window end; `consumeResetToken` deletes on first read |

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
