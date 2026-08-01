# Neon (HTTP) Engine

Postgres-over-HTTP for edge/serverless — a pool-free `SQLConnectionEngine` that
drives Neon's SQL-over-HTTP endpoint instead of a TCP socket. Fetch-only, so no
runtime-specific dependency and no raw socket.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

`NeonHttpEngine` is "`PostgresEngine` over HTTP". Each `execute()` becomes a
single `POST https://<host>/sql` request (over
[`@tundralibs/restler`](../../../restler/README.md) → the runtime's native
global `fetch`), so it never opens a socket and stays edge/serverless-safe. It
emits Postgres SQL via the shared `PostgresTranslator` (`Dialect = 'postgres'`)
and decodes result values with the shared Postgres text decoder — the emitted
SQL and decoded rows are identical to the socket-based
[`PostgresEngine`](../postgres/Drivers-Postgres.md); only the transport
differs.

Because a query is one standalone HTTP request, there is no session to carry a
transaction, prepared statement, advisory lock, or connection pool across
calls — those capabilities are declared `false` (see
[Capabilities](#capabilities) and [Limitations](#limitations)).

## Installation

Ships with `@tundralibs/drivers` — see the
[package README](../../README.md#installation).

### Import

```typescript
// Per-engine subpath (keeps the edge bundle free of the TCP wire stack).
import { NeonHttpEngine } from '@tundralibs/drivers/neon';
```

## Quick Start

```typescript
import { NeonHttpEngine } from '@tundralibs/drivers/neon';

const neon = new NeonHttpEngine('edge', {
  host: 'ep-cool-name-a1b2c3.us-east-2.aws.neon.tech',
  // Either a ready-made connection string …
  connectionString: 'postgresql://user:pass@ep-cool-name-a1b2c3…/neondb',
  // … or the discrete components (username + password + database):
  // username: 'user',
  // password: '...',
  // database: 'neondb',
  // Optional bearer JWT for Neon Authorize / RLS:
  // token: '<jwt>',
  // Optional per-request timeout in seconds (1–120, default 30):
  // timeout: 30,
});

const r = await neon.execute({
  sql: 'SELECT id, name FROM users WHERE id = :id:',
  params: { id: 1 },
});

console.log(r.data);
await neon.disconnect();
```

`:name:` placeholders are rewritten to Postgres `$N` markers and the ordered
values are sent as the request's `params` array. No network happens at
construction or on `connect()` — the client is stateless (one HTTP request per
query), which is exactly what makes it edge-safe.

## Configuration

Extends [`SQLEngineOptions`](../../docs/Drivers-SQLEngine.md#configuration).
`host` is always required (it forms the request URL); supply **at least one**
authentication mechanism — a `connectionString`, the
`username`+`password`+`database` components, or a bearer `token`. The
constructor throws `MISSING_CONFIG_VALUE` otherwise.

| Option             | Type     | Default | Notes                                                                                                                                                       |
| ------------------ | -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`             | `string` | —       | Required. Neon endpoint host, e.g. `ep-cool-name-a1b2c3.us-east-2.aws.neon.tech`. The request URL is `https://<host>/sql`.                                  |
| `connectionString` | `string` | —       | Full `postgresql://user:password@host/db`. Sent in the `Neon-Connection-String` header; the password in it authenticates. Takes precedence over components. |
| `username`         | `string` | —       | Component auth: assembled into a connection string with `password` + `database`.                                                                            |
| `password`         | `string` | —       | Component auth (see `username`).                                                                                                                            |
| `database`         | `string` | —       | Component auth (see `username`).                                                                                                                            |
| `token`            | `string` | —       | Bearer JWT for Neon Authorize / row-level security. Sent as `Authorization: Bearer <token>`. May accompany a connection string or stand alone.              |
| `timeout`          | `number` | `30`    | Per-request timeout in seconds (1–120), passed through to RESTler. Must be a positive number.                                                               |

The pool-related fields on `SQLEngineOptions` (`pool`) are inert — this engine
is pool-free (one stateless HTTP client, no socket pool).

## Capabilities

Read straight from the engine's `Capabilities` object:

| Capability           | Value   | Why                                                      |
| -------------------- | ------- | -------------------------------------------------------- |
| `transactions`       | `false` | One-shot HTTP — no session spans requests.               |
| `preparedStatements` | `false` | No session to hold a prepared statement.                 |
| `pooledConnections`  | `false` | Fetch-based; the platform pools, not the driver.         |
| `advisoryLock`       | `false` | No session-scoped `pg_advisory_lock` over one-shot HTTP. |
| `referentialActions` | `true`  | Postgres enforces FK actions — a per-server fact.        |
| `inPlaceAlter`       | `true`  | Postgres accepts in-place `ALTER COLUMN ... TYPE`.       |

## Type round-trips

Neon returns raw Postgres text (the client sets `Neon-Raw-Text-Output: true`),
which is decoded with the **same** OID → JS mapping the socket-based
`PostgresEngine` uses — see
[Postgres → Type round-trips](../postgres/Drivers-Postgres.md#type-round-trips)
(`int8` → `bigint`, `bool` → `boolean`, `json`/`jsonb` → parsed object,
`bytea` → `Uint8Array`, timestamps → `Date`, `numeric` → `string`, …).

## Limitations

- **No interactive transactions** (`transactions: false`). Neon's `/sql`
  endpoint runs one statement per HTTP request, so `transaction()` /
  `beginTransaction()` reject with `UNSUPPORTED_OPERATION` at the base guard,
  before any client is reserved.
- **No prepared statements / advisory locks** (`preparedStatements: false`,
  `advisoryLock: false`) — both need a session that survives across requests.
- **Native Postgres array columns are unsupported by the param encoder.**
  `_encodeValue` serializes objects and arrays as JSON, so an array-typed
  column (`int[]`, `text[]`, …) can't be bound directly — pass such a value
  pre-formatted as a Postgres array-literal string, or use a `jsonb` column
  instead. Scalars (`boolean`/`number`/`string`), `bigint` (→ decimal string),
  `Date` (→ ISO-8601), and `Uint8Array` (→ `\x`-hex `bytea`) all encode
  natively.
- **Connection string in a header.** The `Neon-Connection-String` header
  carries the database password. It lives on the RESTler client, never on a
  thrown error — `_wrapDriverError` copies only safe, query-relevant fields
  (`sqlState`, `table`, `column`, `constraint`, `detail`, the SQL text) — and
  RESTler redacts the header in its own error/log output.

## Edge / serverless deployment

Because the engine talks only over global `fetch` (RESTler never sets the
`tls` / `socketPath` transport options), it runs unchanged on socket-less edge
runtimes — **Cloudflare Workers, Vercel Edge, Deno Deploy** — and on Deno, Bun,
and Node. The `@tundralibs/drivers/neon` subpath deliberately imports none of
the Postgres TCP wire stack (`PgConnection` / `protocol` / `binary` / `auth` /
compat `connect`), so the edge bundle stays clean; its only heavy dependency is
`@tundralibs/restler`.

See the [driver compatibility matrix](../../docs/Drivers-Compatibility.md) for
how Neon compares to the socket-based engines and what one-shot HTTP KEEPS /
LOSES / DEGRADES for a higher-level consumer.

## Errors

Postgres SQLSTATE codes (returned in Neon's error JSON) are mapped to standard
`EngineError.code` values via the shared SQLSTATE table — the same mapping the
socket-based `PostgresEngine` applies. See
[Drivers → Standardized error codes](../../README.md#standardized-error-codes).

[← Back to Drivers](../../README.md)
