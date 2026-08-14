# Cloudflare D1 (HTTP) Engine

SQLite-over-HTTP for edge/serverless — a pool-free `SQLConnectionEngine` that
drives Cloudflare D1's REST query API instead of a native SQLite binding.
Fetch-only, so no runtime-specific dependency and no native module.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

`D1Engine` is "`SQLiteEngine` over HTTP". Each `execute()` becomes a single
`POST https://api.cloudflare.com/client/v4/accounts/{accountId}/d1/database/{databaseId}/query`
request — the D1 REST "Query a database" endpoint — over
[`@tundralibs/restler`](../../../restler/README.md) → the runtime's native global
`fetch`, so it never opens a socket and never loads a native SQLite binding
(`bun:sqlite` / `@db/sqlite` / `better-sqlite3` / `node:sqlite`), staying
edge/serverless-safe. It emits SQLite SQL via the shared `SQLiteTranslator`
(`Dialect = 'sqlite'`) and maps SQLite error codes with the shared SQLite error
map — the emitted SQL and mapped errors are identical to the native
[`SQLiteEngine`](../sqlite/Drivers-SQLite.md); only the transport differs.

This driver targets D1's **REST** path (the HTTP query API), not the in-Worker
`env.DB` binding — so it runs from anywhere with `fetch`, at the cost of the
REST endpoint's rate limits and higher latency versus the native binding (see
[Limitations](#limitations)).

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
import { D1Engine } from '@tundralibs/drivers/d1';
```

## Quick Start

```typescript
import { D1Engine } from '@tundralibs/drivers/d1';

const d1 = new D1Engine('edge', {
  // Cloudflare account ID that owns the database:
  accountId: '<account-id>',
  // D1 database ID (the UUID Cloudflare assigns):
  databaseId: '<database-id>',
  // Cloudflare API token with D1 access, sent as `Authorization: Bearer <token>`:
  apiToken: '<api-token>',
  // Optional per-request timeout in seconds (1–120, default 30):
  // timeout: 30,
});

const r = await d1.execute({
  sql: 'SELECT id, name FROM users WHERE id = :id:',
  params: { id: 1 },
});

console.log(r.data);
await d1.disconnect();
```

`:name:` placeholders are rewritten to D1's positional `?` markers and sent as
the request body's `params` array — a repeated `:name:` pushes its value once per
`?` (positional params cannot dedupe). No network happens at construction or on
`connect()` — the client is stateless (one HTTP request per query), which is
exactly what makes it edge-safe.

### Pointing at a Cloudflare-compatible gateway / local test proxy

The optional `endpoint` option replaces Cloudflare's API base URL
(`https://api.cloudflare.com/client/v4`) **verbatim**; the account/database
`/query` path is still appended. Use it to target a Cloudflare-compatible
gateway or a local test proxy rather than Cloudflare's cloud endpoint — leave it
unset for real D1:

```typescript
import { D1Engine } from '@tundralibs/drivers/d1';

const local = new D1Engine('local', {
  accountId: 'acct',
  databaseId: 'db',
  apiToken: 'test',
  endpoint: 'http://localhost:8787',
});
```

It carries no transport options of its own — plain HTTP(S) over native `fetch`
only — so it stays edge-safe. (This is the seam the live integration test uses to
point the engine at an in-process SQLite-backed proxy.)

## Configuration

Extends [`SQLEngineOptions`](../../docs/Drivers-SQLEngine.md#configuration).
`accountId`, `databaseId`, and `apiToken` are all required (each request is
addressed to a specific database and bearer-authenticated); the constructor
throws `MISSING_CONFIG_VALUE` otherwise.

| Option       | Type     | Default | Notes                                                                                                                                                           |
| ------------ | -------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountId`  | `string` | —       | Required. Cloudflare account ID that owns the database; forms the `/accounts/{accountId}/…` path segment.                                                       |
| `databaseId` | `string` | —       | Required. D1 database ID (the UUID Cloudflare assigns); forms the `/d1/database/{databaseId}/…` path segment.                                                   |
| `apiToken`   | `string` | —       | Required. Cloudflare API token with D1 access, sent as `Authorization: Bearer <apiToken>`. Lives only on the RESTler client; never copied onto a thrown error.  |
| `endpoint`   | `string` | —       | Optional. Full base URL used **verbatim** in place of Cloudflare's API host (for a compatible gateway / local test proxy); the `/query` path is still appended. |
| `timeout`    | `number` | `30`    | Per-request timeout in seconds (1–120), passed through to RESTler. Must be a number in range.                                                                   |

The pool-related fields on `SQLEngineOptions` (`pool`) are inert — this engine
is pool-free (one stateless HTTP client, no socket pool).

## Capabilities

Read straight from the engine's `Capabilities` object:

| Capability           | Value   | Why                                                                  |
| -------------------- | ------- | -------------------------------------------------------------------- |
| `transactions`       | `false` | One-shot REST — no session spans requests.                           |
| `preparedStatements` | `false` | No session to hold a prepared statement.                             |
| `pooledConnections`  | `false` | Fetch-based; the platform pools, not the driver.                     |
| `advisoryLock`       | `false` | SQLite has no server-side advisory lock, and no session to hold one. |
| `referentialActions` | `true`  | The translator emits FK DDL; D1 enforces FKs by default (see below). |
| `inPlaceAlter`       | `false` | SQLite `ALTER` cannot retype a column (the table is rebuilt).        |

## Type round-trips

D1's `/query` endpoint returns each row as an **object** keyed by column name
with already-JSON values, so value decoding is essentially pass-through — the one
exception is BLOB, which (JSON having no binary type) D1 serializes as an **array
of byte numbers**, decoded here to a `Uint8Array`:

| SQLite value | JS value (decoded)                                                |
| ------------ | ----------------------------------------------------------------- |
| `INTEGER`    | `number` (see the int64 caveat under [Limitations](#limitations)) |
| `REAL`       | `number`                                                          |
| `TEXT`       | `string`                                                          |
| `BLOB`       | `Uint8Array`                                                      |
| `NULL`       | `null`                                                            |

On the encode side (params), JS values fold onto SQLite's storage classes as the
native `SQLiteEngine` does, adapted for a JSON request body: `boolean` → `0`/`1`,
`bigint` → a JSON `number` (**lossy beyond ±(2^53 − 1)** — see below), `Date` →
ISO-8601 `TEXT`, `Uint8Array` → an array of byte numbers, and any other
object/array → `JSON.stringify` `TEXT` (SQLite has no JSON storage class).

> **BLOB bind form.** A `Uint8Array` bind value is sent as a JSON **array of
> byte numbers** — the same shape D1 uses to _return_ a BLOB. D1's BLOB **read**
> form (a `number[]` over JSON) is documented / well-attested
> ([`cloudflare/workers-sdk#8642`](https://github.com/cloudflare/workers-sdk/issues/8642),
> the [D1 client type-conversion docs](https://developers.cloudflare.com/d1/worker-api/d1-database/)),
> but Cloudflare's REST
> [`/query`](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/)
> reference does **not** separately specify how a BLOB is _bound_ over the
> `params` array, so the engine mirrors the documented read form (there is no
> JSON-native binary type). This BLOB bind → read-back round-trip against a
> **real** Cloudflare D1 endpoint is covered by an opt-in test gated on
> `D1_HTTP_ENDPOINT` (skipped in normal CI); the in-process test proxy cannot
> verify it, since it decodes the byte array itself.

## Limitations

- **No interactive transactions** (`transactions: false`). D1's REST query API
  runs one statement per HTTP request, so `transaction()` / `beginTransaction()`
  reject with `UNSUPPORTED_OPERATION` at the base guard, before any client is
  reserved. (D1 has a server-side `batch` for multiple statements, but that is
  not an interactive, roll-back-able transaction — it is not wired here.)
- **No prepared statements / advisory locks** (`preparedStatements: false`,
  `advisoryLock: false`) — both need a session that survives across requests,
  which stateless one-shot HTTP does not provide.
- **REST path, not the Workers binding.** This driver speaks D1's HTTP REST
  query API, which is **rate-limited and higher-latency** than the in-Worker
  `env.DB` binding. Inside a Worker with a D1 binding, the native binding is
  faster; this engine trades that for running from anywhere `fetch` exists (edge
  or not, in or out of a Worker).
- **int64 params are lossy over JSON.** A JS `bigint` is encoded to a JSON
  `number`: values within `Number.isSafeInteger` round-trip exactly, but a
  `bigint` beyond ±(2^53 − 1) **loses precision** — D1/JSON cannot carry a 64-bit
  integer losslessly (unlike Turso's Hrana transport, which strings the integer).
  Use `TEXT` for exact large-integer storage if this matters.
- **Foreign keys are enforced by default.** `referentialActions` stays `true` so
  the `SQLiteTranslator` emits FK DDL (matching the native `SQLiteEngine` and
  norm), and Cloudflare D1 **enforces foreign keys by default** on every query
  (equivalent to `PRAGMA foreign_keys = ON` per statement), so FK constraints are
  enforced at runtime with no pragma injected here.
- **`ALTER` cannot retype a column** (`inPlaceAlter: false`) — a per-dialect
  SQLite fact (the table is rebuilt), unaffected by the HTTP transport.

## Edge / serverless deployment

Because the engine talks only over global `fetch` (RESTler never sets the
`tls` / `socketPath` transport options) and imports **no** native SQLite binding
— reusing only the pure `sqlite/errorCodes.ts` map — it runs unchanged on
socket-less edge runtimes — **Cloudflare Workers, Vercel Edge, Deno Deploy** —
and on Deno, Bun, and Node. The `@tundralibs/drivers/d1` subpath deliberately
imports none of the native SQLite adapter (`sqlite/adapter.ts` /
`sqlite/Engine.ts`), so the edge bundle stays clean; its only heavy dependency is
`@tundralibs/restler`.

See the [driver compatibility matrix](../../docs/Drivers-Compatibility.md) for
how D1 compares to the socket-based engines and what one-shot HTTP KEEPS / LOSES
/ DEGRADES for a higher-level consumer.

## Errors

SQLite error codes / messages (returned in D1's error JSON) are mapped to
standard `EngineError.code` values via the shared SQLite error map — the same
mapping the native `SQLiteEngine` applies. D1 reports a query failure either as a
non-2xx response or as a 2xx envelope with `success: false`; both carry
`errors: [{ code, message }]`, where `code` is Cloudflare's numeric code
(surfaced as diagnostic meta only — the mapping keys off the message).

Cloudflare D1 (workerd's `dbErrorMessage()`) **decorates** the SQLite `message`
with a trailing `: SQLITE_<PRIMARY> [(extended: SQLITE_<EXT>)]` tail (and, for
some errors, a `at offset N` fragment). The real wire form of a unique-key
failure is therefore:

```
UNIQUE constraint failed: t.email: SQLITE_CONSTRAINT (extended: SQLITE_CONSTRAINT_UNIQUE)
```

The engine **strips that `SQLITE_<CODE>` tail** before it lifts the offending
`constraint` / `column` / `table` identifier out of the message, so those
diagnostic fields come out clean (`t.email`, not `t.email:`) — parity with the
native `SQLiteEngine`, whose local SQLite driver reports the undecorated text.
Classification itself is unaffected either way (it matches on a substring).

The Bearer API token lives only on the RESTler client (RESTler redacts it in its
own error/log output) and is never copied onto a thrown `EngineError`. See
[Drivers → Standardized error codes](../../README.md#standardized-error-codes).

[← Back to Drivers](../../README.md)
