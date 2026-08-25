# Sessions — JWT, opaque, and refresh rotation

`login()` mints a session; `verify()` resolves it back to a principal;
`refresh()`/`logout()` manage its lifetime. Two strategies share one
surface:

| `session.strategy`  | Token                        | State              | Revocation                                   |
| ------------------- | ---------------------------- | ------------------ | -------------------------------------------- |
| `'JWT'` (default)   | signed JWT (crypt)           | none (stateless)…  | at expiry — keep `ttl` short, or add refresh |
| `'JWT'` + `refresh` | short JWT + rotating refresh | one family record  | instant via the family                       |
| `'OPAQUE'`          | random id, store-backed      | one session record | instant (`logout` deletes the record)        |

**Choosing a strategy.** Reach for stateless `'JWT'` only when scale or
statelessness outweighs revocation — a leaked or over-privileged token stays
valid until it expires, so pair it with a **short `ttl`** (and the `isRevoked`
denylist seam below) as the backstop. Choose `'OPAQUE'`, or `'JWT'` + `refresh`,
whenever you need **instant** revocation — logout-everywhere, lock-on-abuse,
high-value sessions — since both kill a session the moment its record is
deleted. When in doubt, `'JWT'` + `refresh` is the balanced default: stateless
access checks with a revocable family behind them.

## JWT claims layout

Access token: `{ sub, use: 'ACCESS', iat, exp, iss?, aud?, sid?, grants? }`.
Refresh token: `{ sub, use: 'REFRESH', sid, gen, iat, exp, iss?, aud? }`.

The `use` claim is **pinned**: `verify()` refuses anything but `'ACCESS'`
and `refresh()` anything but `'REFRESH'` (`TOKEN_TYPE_MISMATCH`) — a
long-lived refresh token can never be replayed as an access token.

### `embedGrants`

With `session: { embedGrants: true }` the principal's serialized masks
ride the access token and `verify()` rebuilds the principal with **zero
store lookups** — the right default for edge/high-throughput checks. The
cost is staleness: grant AND status changes are invisible until the
(short) token expiry. Without it, `verify()` resolves the user fresh via
`getUser({ by: 'ID' })`, so a `LOCKED` user dies immediately.

**Pitfall — stale authorization.** Because the token is self-contained, a
grant downgrade or a `LOCKED`/`DISABLED` status flip is _invisible until
expiry_: the token keeps its old authority for its whole lifetime. So do
**not** embed when grants or status change often, and when you do embed, bound
the access `ttl` to the staleness you can tolerate (≤ 5 minutes is typical).
The [`isRevoked`](Pact-Hooks.md) hook is the _only_ mid-token veto an
embedded-grant token has — revoking a role or emptying a group updates future
`getUser` results but does **not** retroactively invalidate tokens already
minted.

## Refresh rotation

Enable with `session: { refresh: {} }` (defaults: family `ttl` 30 days,
access `ttl` 900 s, `grace` 5 s). Every login creates a **family**
(`PactStoredSession` with `generation: 0`); every `refresh()`:

1. verifies the refresh JWT (`use: 'REFRESH'`, signature, `iss`/`aud`);
2. loads the family — missing/revoked/expired resolves `null`;
3. compares the token's `gen` to the family's:
   - **match** → rotate: `generation + 1` saved, fresh access+refresh
     pair returned;
   - **previous generation, within `grace` of the last rotation** → a
     legitimate concurrent refresh (two tabs, a flaky retry): re-issued
     at the current generation, no penalty;
   - **anything else** → replay of a stolen token: the family is
     tombstoned (`revokedAt`), the **`refreshReuse` event fires** —
     alert on it — and both the thief's and the victim's tokens are dead.

**Tune the windows.** The family `ttl` (default 30 days) is the outer bound on
how long a stolen-but-unused refresh token stays usable — shorten it for
sensitive apps. Keep `grace` to a few seconds: it exists only to absorb
legitimate concurrent refreshes (two tabs, a flaky retry), and an oversized
window is exactly the gap a thief races inside to look legitimate, blunting
reuse detection. `grace: 0` disables it entirely (strict single-use), at the
cost of failing genuine concurrent refreshes.

```typescript
import { Pact } from '@tundralibs/pact';

declare const pact: Pact;
declare const oldRefreshToken: string;

const rotated = await pact.refresh(oldRefreshToken);
if (rotated !== null) {
  // hand rotated.token + rotated.refreshToken back to the client
}
```

## The `verify` contract

`verify(token)` resolves **`null` for every bad-token outcome** — bad
signature/claims, wrong `use`, revoked, dead session, unknown or
non-`ACTIVE` user — emitting `verifyFailed` with the typed error for
audit. It throws only for configuration mistakes (`MISSING_OPTION` /
`MISSING_HOOK`). That uniform null contract is what lets
`authenticate()` treat every scheme identically.

To add revocation to an otherwise-stateless JWT, wire the
[`isRevoked`](Pact-Hooks.md) hook — a fast denylist check (by `jti`/`sid`/user)
that `verify()` consults on every call. Keep it O(1)/cached: it runs on every
request, and with `embedGrants` it is the only revocation seam you have.

## Logout semantics

| Setup             | `logout(token)` does…                                                                                                        |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `'OPAQUE'`        | deletes the session — immediate                                                                                              |
| `'JWT'` + refresh | deletes the family (access OR refresh token accepted — both carry `sid`); refresh dies instantly, access at its short expiry |
| `'JWT'` stateless | no-op — nothing to kill; use a short `ttl`                                                                                   |

`logout` is idempotent: invalid tokens are ignored. `logoutAll(userId)`
ends every session/family via the `deleteUserSessions` hook. Both emit
`logout`.

`'OPAQUE'` sessions have a **fixed lifetime** (`ttl` from mint); sliding
renewal is on the [roadmap](../ROADMAP.md) as an opt-in.

An `'OPAQUE'` token is a bearer secret, so pact stores it hashed: `saveSession`,
`getSession`, and `deleteSession` see the **sha-256 of the token**, never the
raw id, and the raw token lives only in the client's hands. A read-only leak of
the sessions table therefore yields no usable session ids.
