# Turso (HTTP) Engine

SQLite-over-HTTP for edge/serverless — a pool-free `SQLConnectionEngine` that
drives Turso / libSQL's Hrana-v3 HTTP query API instead of a native SQLite
binding. Fetch-only, so no runtime-specific dependency and no native module.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

`TursoEngine` is "`SQLiteEngine` over HTTP". Each `execute()` becomes a single
`POST https://<host>/v3/pipeline` request — an `[execute, close]` Hrana pipeline
— over [`@tundralibs/restler`](../../../restler/README.md) → the runtime's
native global `fetch`, so it never opens a socket and never loads a native
SQLite binding (`bun:sqlite` / `@db/sqlite` / `better-sqlite3` / `node:sqlite`),
staying edge/serverless-safe. It emits SQLite SQL via the shared
`SQLiteTranslator` (`Dialect = 'sqlite'`) and maps SQLite error codes with the
shared SQLite error map — the emitted SQL and mapped errors are identical to the
native [`SQLiteEngine`](../sqlite/Drivers-SQLite.md); only the transport differs.

Because a query is one standalone HTTP request, there is no session to carry a
transaction, prepared statement, advisory lock, or connection pool across
calls — those capabilities are declared `false` (see
[Capabilities](#capabilities) and [Limitations](#limitations)).

## Installation

Ships with `@tundralibs/drivers` — see the
[package README](../../README.md#installation).

### Import

```typescript
// Per-engine subpath (keeps the edge bundle free of the native SQLite binding).
import { TursoEngine } from '@tundralibs/drivers/turso';
```

## Quick Start

```typescript
import { TursoEngine } from '@tundralibs/drivers/turso';

const turso = new TursoEngine('edge', {
  // A Turso `libsql://…` URL (mapped to `https://…` for the HTTP transport):
  url: 'libsql://my-db-my-org.turso.io',
  // The Turso auth token (a JWT), sent as `Authorization: Bearer <token>`:
  authToken: '<jwt>',
  // Optional per-request timeout in seconds (1–120, default 30):
  // timeout: 30,
});

const r = await turso.execute({
  sql: 'SELECT id, name FROM users WHERE id = :id:',
  params: { id: 1 },
});

console.log(r.data);
await turso.disconnect();
```

Point it at a **local `sqld`** (the standalone libSQL server) by giving an
`http(s)://…` URL and omitting `authToken` (a bare `sqld` needs no auth, so no
`Authorization` header is sent):

```typescript
const local = new TursoEngine('local', { url: 'http://localhost:8080' });
```

`:name:` placeholders are rewritten to libSQL's `:name` markers and sent as the
pipeline statement's `named_args`. No network happens at construction or on
`connect()` — the client is stateless (one HTTP request per query), which is
exactly what makes it edge-safe.

## Configuration

Extends [`SQLEngineOptions`](../../docs/Drivers-SQLEngine.md#configuration).
`url` is always required (it forms the pipeline request URL); the constructor
throws `MISSING_CONFIG_VALUE` otherwise.

| Option      | Type     | Default | Notes                                                                                                                                                                                                                                               |
| ----------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`       | `string` | —       | Required. A `libsql://…` (or `libsqls://…`) URL — mapped to `https://…` for the HTTP transport — an `https://…` URL (Turso cloud / TLS gateway), or an `http://…` URL (local `sqld`). Only the origin is used; the `/v3/pipeline` path is appended. |
| `authToken` | `string` | —       | Turso auth token (a JWT). Sent as `Authorization: Bearer <authToken>`. Optional — omit it (or pass an empty string) for a local `sqld` that needs no auth (no header is sent).                                                                      |
| `timeout`   | `number` | `30`    | Per-request timeout in seconds (1–120), passed through to RESTler. Must be a positive number.                                                                                                                                                       |

The pool-related fields on `SQLEngineOptions` (`pool`) are inert — this engine
is pool-free (one stateless HTTP client, no socket pool).

## Capabilities

Read straight from the engine's `Capabilities` object:

| Capability           | Value   | Why                                                                  |
| -------------------- | ------- | -------------------------------------------------------------------- |
| `transactions`       | `false` | One-shot Hrana HTTP — no session spans requests.                     |
| `preparedStatements` | `false` | No session to hold a prepared statement.                             |
| `pooledConnections`  | `false` | Fetch-based; the platform pools, not the driver.                     |
| `advisoryLock`       | `false` | SQLite has no server-side advisory lock, and no session to hold one. |
| `referentialActions` | `true`  | The translator emits FK DDL (see the FK caveat under Limitations).   |
| `inPlaceAlter`       | `false` | SQLite `ALTER` cannot retype a column (the table is rebuilt).        |

## Type round-trips

libSQL returns each cell as a tagged Hrana `Value`, decoded with the **same**
pure value map the engine encodes params with (`values.ts`), following SQLite's
five storage classes (NULL / INTEGER / REAL / TEXT / BLOB):

| SQLite value         | JS value (decoded)                                     |
| -------------------- | ------------------------------------------------------ |
| `INTEGER` (≤ 2^53−1) | `number`                                               |
| `INTEGER` (> 2^53−1) | `bigint` (full 64-bit precision, never a lossy number) |
| `REAL`               | `number`                                               |
| `TEXT`               | `string`                                               |
| `BLOB`               | `Uint8Array`                                           |
| `NULL`               | `null`                                                 |

On the encode side (params), JS values fold onto those storage classes exactly
as the native `SQLiteEngine` does: `boolean` → `0`/`1`, `bigint` → integer
(decimal string, lossless int64), `Date` → ISO-8601 `TEXT`, `Uint8Array` →
`BLOB`, and any other object/array → `JSON.stringify` `TEXT` (SQLite has no
JSON storage class). So a value round-trips through the HTTP engine the same way
it would through the native SQLite driver.

## Limitations

- **No interactive transactions** (`transactions: false`). Turso's Hrana
  pipeline runs one statement per HTTP request, so `transaction()` /
  `beginTransaction()` reject with `UNSUPPORTED_OPERATION` at the base guard,
  before any client is reserved.
- **No prepared statements / advisory locks** (`preparedStatements: false`,
  `advisoryLock: false`) — both need a session that survives across requests,
  which stateless one-shot HTTP does not provide.
- **Foreign-key enforcement is server-dependent.** `referentialActions` stays
  `true` so the `SQLiteTranslator` emits FK DDL (matching the native
  `SQLiteEngine` and norm), but over stateless one-shot HTTP there is no session
  to hold a `PRAGMA foreign_keys = ON`, and **no pragma is injected**. Runtime
  FK enforcement therefore follows the server's own default: a Turso cloud
  database enforces foreign keys by default, whereas a bare `sqld` follows
  SQLite's compile-time default (typically OFF).
- **`ALTER` cannot retype a column** (`inPlaceAlter: false`) — a per-dialect
  SQLite fact (the table is rebuilt), unaffected by the HTTP transport.

## Edge / serverless deployment

Because the engine talks only over global `fetch` (RESTler never sets the
`tls` / `socketPath` transport options) and imports **no** native SQLite binding
— reusing only the pure `sqlite/errorCodes.ts` map and the pure `values.ts`
value coder — it runs unchanged on socket-less edge runtimes — **Cloudflare
Workers, Vercel Edge, Deno Deploy** — and on Deno, Bun, and Node. The
`@tundralibs/drivers/turso` subpath deliberately imports none of the native
SQLite adapter (`sqlite/adapter.ts` / `sqlite/Engine.ts`), so the edge bundle
stays clean; its only heavy dependency is `@tundralibs/restler`.

See the [driver compatibility matrix](../../docs/Drivers-Compatibility.md) for
how Turso compares to the socket-based engines and what one-shot HTTP KEEPS /
LOSES / DEGRADES for a higher-level consumer.

## Errors

SQLite error codes / messages (returned in Turso's Hrana error JSON) are mapped
to standard `EngineError.code` values via the shared SQLite error map — the same
mapping the native `SQLiteEngine` applies. The Bearer auth token lives only on
the RESTler client (RESTler redacts it in its own error/log output) and is never
copied onto a thrown `EngineError`. See
[Drivers → Standardized error codes](../../README.md#standardized-error-codes).

[← Back to Drivers](../../README.md)
