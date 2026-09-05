# Sessions

Login mints a session under one of two strategies; `authenticate` with the
`BEARER` scheme validates it. Both strategies share one result shape
(`PactLoginResult`) and one storage seam.

## Table of Contents

- [Choosing a strategy](#choosing-a-strategy)
- [Opaque sessions](#opaque-sessions)
- [JWT sessions and refresh families](#jwt-sessions-and-refresh-families)
- [Cache-only mode](#cache-only-mode)
- [The login seam](#the-login-seam)
- [Logout and revocation](#logout-and-revocation)
- [Options and defaults](#options-and-defaults)

## Choosing a strategy

| Property               | `OPAQUE` (default)            | `JWT`                                    |
| ---------------------- | ----------------------------- | ---------------------------------------- |
| Bearer validation      | Store lookup by token sha-256 | Signature check + family lookup          |
| Revocation             | Immediate (delete the row)    | Family kill; access tokens die at `ttl`  |
| Refresh                | —                             | Rotating refresh family, reuse detection |
| Needs a signing secret | No                            | Yes (`session.secret`, 32+ chars)        |

## Opaque sessions

`login` returns a `pact_st_...` token shown once; the store only ever holds
its sha-256 as the session id. Validation is one lookup; logout is one
delete. There is no refresh — re-login when it expires.

## JWT sessions and refresh families

With `session: { strategy: 'JWT', secret, ttl, refresh }` a login returns a
short-lived access token and a refresh token, both HS256 JWTs pinned to
their purpose by a `use` claim (an access token can never refresh; a
refresh token can never authenticate). The stored record is the refresh
family — one row per login, keyed by the `sid` claim, carrying the current
`generation`.

`refresh(refreshToken)` rotates: the presented generation must match the
family's current one, and a new access + refresh pair is issued at the next
generation.

- A token one generation behind, presented within `refresh.grace` seconds
  of the last rotation, re-issues at the current generation instead — this
  absorbs the legitimate race of two tabs refreshing at once.
- Anything older is treated as replay of a stolen token: the family is
  deleted (every access and refresh token in it dies), `refresh` throws
  `REFRESH_REUSED`, and the `refreshReused` event fires with the session
  and user ids.

The reuse verdict is always taken against an authoritative store read,
never a cached copy, so a stale cache cannot make an honest refresh look
like theft. The family `ttl` bounds how long a stolen-but-unused refresh
token stays live; the access `ttl` bounds how long a revoked family's last
access token keeps working.

## Cache-only mode

With no session hooks and a `session` cache TTL configured
(`cache: { ttl: { session: n } }`), the session cache is the store.
This is real, working session storage with two documented limits: it is
per-process on the MEMORY engine (a restart logs everyone out, and
multi-instance deployments need an external engine plus an instance
[name](Pact-Caching.md)), and `logoutAll`/`setPassword` cannot enumerate a
user's sessions from a cache — `logoutAll` still requires the
`deleteSessions` hook.

## The login seam

`login` is two public halves glued together, so app-owned flows can insert
steps between them:

```ts ignore
const { principal, mfaRequired } = await pact.verifyCredentials(email, pw);
if (mfaRequired && !await pact.verifyMFA(principal.id, code)) {
  throw new Error('bad TOTP');
}
const result = await pact.createSession(principal.id, { method: 'MFA' });
```

`verifyCredentials` proves identity with login's exact failure semantics
and reports whether the user carries an MFA secret. `createSession` mints
for an active user id with no credential proof — the caller vouches, which
is precisely what magic links and impersonation need; gate it accordingly.
It also accepts session `metadata` (stored on the record) and a `method`
label for the `login` event.

## Logout and revocation

- `logout(token)` deletes the session (JWT: the family — expired access
  tokens still identify their family, so logout works after expiry).
- `logoutAll(userId)` calls `deleteSessions` and then clears the whole
  session cache. On a shared cache engine the clear spans that namespace;
  the instance [name](Pact-Caching.md) keeps it scoped to this app.
- `setPassword` ends the user's sessions via `deleteSessions` when the
  hook exists.

A `saveSession` implemented as a blind upsert can resurrect a session that
a concurrent logout just deleted; prefer an insert plus a keyed update of
rotation fields — see [Storage](Pact-Storage.md).

## Options and defaults

| Option                  | Default  | Meaning                                           |
| ----------------------- | -------- | ------------------------------------------------- |
| `session.strategy`      | `OPAQUE` | Session strategy                                  |
| `session.ttl`           | `480`    | Minutes: opaque session / JWT access lifetime     |
| `session.secret`        | —        | JWT signing secret; required for `JWT`, 32+ chars |
| `session.refresh.ttl`   | `10080`  | Minutes the refresh family lives (7 days)         |
| `session.refresh.grace` | `30`     | Seconds a previous-generation refresh re-issues   |
| `reset.ttl`             | `15`     | Minutes a password-reset token stays valid        |

The `session` and `reset` option groups replace wholesale: passing
`session: { strategy: 'JWT', secret }` resets the other session fields to
their defaults rather than merging with an earlier value.

---

[← Back to Pact](../README.md)
