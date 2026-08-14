# Postgres Engine

Wire-protocol Postgres driver — written from scratch over `compat.connect`.
No external dependencies, runs on Deno, Bun, and Node.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Status: 1.0.0-rc](https://img.shields.io/badge/Status-1.0.0--rc-yellow)

## Status

Functional and tested against Postgres 12+ on the common path. Treat as
needing real-world soak testing before relying on it for production. A
30-minute soak (1.08M ops, 6 concurrent workers) runs clean in the test
suite (`packages/drivers/engines/postgres/soak.ts`).

## Capabilities

- PostgreSQL wire protocol v3.0 (Postgres ≥ 7.4)
- SCRAM-SHA-256 auth (PG 10+ default) + cleartext password (warns when sent
  over an unencrypted connection — see `allowCleartextPassword`)
- **Binary parameter format** for `int4`, `int8`, `float8`, `bool`,
  `timestamptz`, `bytea`, `jsonb` — text format for everything else
- Result decoding: text format (binary decode is a v1.x add)
- `:name:` named parameters (rewritten internally to `$N`)
- Transactions (commit / rollback / auto-rollback / timeout)
- Server `NOTICE` messages emitted as the `notice` event
- Custom `applicationName` and `statementTimeoutMs`

MD5 password auth is **not** supported — configure your `pg_hba.conf` to
use `scram-sha-256`.

## Authentication

SCRAM-SHA-256 is the recommended mechanism and provides mutual
authentication (the server must prove it knows the stored key). MD5 is
refused outright.

Cleartext-password auth (`AuthenticationCleartextPassword`) sends the
password in the clear. Over an **unencrypted** connection that leaks the
credential to any on-path attacker, and it is the lever a rogue/MITM server
pulls to downgrade away from SCRAM's mutual-auth guarantee.

The driver still authenticates in that situation — `pg_hba` `password` and
PgBouncer's `auth_type = plain` are real, working deployments, and libpq
does the same unless `require_auth` is pinned — but it is **loud** about it:
every cleartext handshake over a non-TLS socket emits a `notice` beginning
`WARNING: server requested cleartext-password auth over an unencrypted
connection …`, the same treatment an `ssl.enforce: false` downgrade gets.
Subscribe to the `notice` event (or pass `_onnotice`) if you want that in
your logs.

To harden, set **`allowCleartextPassword: false`**: the driver then throws
`INVALID_AUTH` instead of sending the password over an unencrypted socket.
Combined with the unconditional MD5 refusal, that pins the connection to
SCRAM-SHA-256 (or to cleartext over TLS, which is always permitted — the
transport is already encrypted).

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

// Refuse to send a password unless the transport is encrypted.
const pg = new PostgresEngine('app', {
  host: 'db.internal',
  database: 'app',
  username: 'app',
  password: '...',
  allowCleartextPassword: false,
});
```

Password normalization follows PostgreSQL: SCRAM applies SASLprep
(RFC 4013), and for a password SASLprep rejects (a prohibited code point or
a bidi violation) the driver falls back to the **raw** password — matching
what the server and libpq do, so such credentials keep authenticating.

## Quick Start

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const pg = new PostgresEngine('app', {
  host: 'localhost',
  port: 5432,
  database: 'app',
  username: 'app',
  password: '...',
  pool: { min: 2, max: 10 },
});

const r = await pg.execute({
  sql: 'SELECT id, name FROM users WHERE id = :id:',
  params: { id: 1 },
});

console.log(r.data);
await pg.disconnect();
```

## Configuration

Extends [`SQLEngineOptions`](../../docs/Drivers-SQLEngine.md#configuration).

| Option                   | Type      | Default | Notes                                                                                                                                                                                                                        |
| ------------------------ | --------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`                   | `string`  | —       | Required.                                                                                                                                                                                                                    |
| `port`                   | `number`  | `5432`  |                                                                                                                                                                                                                              |
| `database`               | `string`  | —       | Required.                                                                                                                                                                                                                    |
| `username`               | `string`  | —       | Required.                                                                                                                                                                                                                    |
| `password`               | `string`  | —       | Optional (e.g. local trust auth).                                                                                                                                                                                            |
| `applicationName`        | `string`  | `Name`  | Sent in StartupMessage as `application_name`.                                                                                                                                                                                |
| `statementTimeoutMs`     | `number`  | —       | Sent as `statement_timeout` GUC.                                                                                                                                                                                             |
| `ssl`                    | various   | —       | See [SSL/TLS](../../docs/Drivers-BaseEngine.md#configuration).                                                                                                                                                               |
| `allowCleartextPassword` | `boolean` | `true`  | Permit cleartext-password auth over an **unencrypted** connection. Permitted by default but warns via `notice` on every such handshake; set `false` to throw `INVALID_AUTH` instead (see [Authentication](#authentication)). |

## Behind PgBouncer / pgcat / RDS Proxy

Just point `host` / `port` at the pooler. **Don't configure the driver's
`pool` option** — single-connection mode keeps a single backend and lets
the server-side pooler do its job. With `pool: { max: N }` you'd be
running a pool on top of a pool.

The driver uses the unnamed prepared-statement slot, so it is compatible
with PgBouncer's transaction-pooling mode out of the box. Don't use
LISTEN/NOTIFY, advisory locks, or session-scoped `SET` under transaction
pooling — those break regardless of the driver.

On auth: PgBouncer's `auth_type = md5` is **not** supported (MD5 is refused
outright — use `scram-sha-256`). `auth_type = plain` works, but if the hop
to the pooler is unencrypted every connection emits the cleartext-auth
warning described under [Authentication](#authentication); set
`allowCleartextPassword: false` if you would rather that be a hard failure.

## Type round-trips

| Postgres type                        | JS                             |
| ------------------------------------ | ------------------------------ |
| `int2` / `int4`                      | `number`                       |
| `int8` (BIGINT)                      | `bigint` (preserves precision) |
| `float4` / `float8`                  | `number`                       |
| `bool`                               | `boolean`                      |
| `text` / `varchar`                   | `string`                       |
| `bytea`                              | `Uint8Array`                   |
| `json` / `jsonb`                     | parsed object                  |
| `date` / `timestamp` / `timestamptz` | `Date`                         |
| `numeric`                            | `string` (preserves precision) |
| `uuid`                               | `string`                       |

## Performance

Comparable to `node-pg` on single queries; **1.92× faster** than
`node-pg` on a 16-concurrent-over-pool-of-8 workload thanks to the
inline pool. See [PERFORMANCE.md](PERFORMANCE.md) for head-to-head
numbers.

## Errors

Postgres SQLSTATE codes are mapped to standard `EngineError.code` values.
See [Drivers.md → Standardized SQL error codes](../../README.md#standardized-error-codes).

## Soak testing

```bash
# 30-minute soak with 6 concurrent workers:
deno run --allow-all packages/drivers/engines/postgres/soak.ts
SOAK_DURATION_S=120 deno run --allow-all packages/drivers/engines/postgres/soak.ts
```

[← Back to Drivers](../../README.md)
