# Drivers

Cross-runtime connection drivers for databases and key-value stores.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Overview

`@tundralibs/drivers` provides the wire-level connection layer for higher-level
TundraLibs packages (Cacher, future NORM) and for application code that needs
direct access to a backend.

Each driver speaks its target service's native protocol over plain TCP / Unix
sockets, with no runtime-specific dependencies. Connection lifecycle, pooling,
SSL loading, and statistics are handled once in `BaseEngine`; concrete drivers
just supply the protocol-level hooks (create connection, validate, ping, run
commands).

The result is a uniform API across services — you connect, run operations,
disconnect — with the same shape whether you're talking to Memcached, a SQL
database, or anything else.

For socket-less edge/serverless runtimes (Cloudflare Workers, Vercel Edge, Deno
Deploy), `NeonHttpEngine` speaks Postgres over HTTPS `fetch`, and `TursoEngine`
and `D1Engine` speak SQLite (Turso / libSQL, and Cloudflare D1) over HTTPS
`fetch` — instead of a TCP socket or a native binding, same engine surface, no
sockets. See the [compatibility matrix](docs/Drivers-Compatibility.md) for how
every engine compares on transport, edge-safety, and capabilities.

## Modules

| Module                                                | Description                                                                                       | Documentation                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [BaseEngine](docs/Drivers-BaseEngine.md)              | Abstract base — connection lifecycle, inline pool, SSL, events                                    | [Docs](docs/Drivers-BaseEngine.md)             |
| [SQLEngine](docs/Drivers-SQLEngine.md)                | Abstract SQL/document base — transactions, query execution, named-param rewriting                 | [Docs](docs/Drivers-SQLEngine.md)              |
| [Error Handling](docs/Drivers-Errors.md)              | Standardized error codes and handling patterns for all engines                                    | [Docs](docs/Drivers-Errors.md)                 |
| [Memcached](engines/memcached/Drivers-Memcached.md)   | Memcached driver (text protocol over TCP)                                                         | [Docs](engines/memcached/Drivers-Memcached.md) |
| [Redis](engines/redis/Drivers-Redis.md)               | Redis driver (RESP3, from scratch)                                                                | [Docs](engines/redis/Drivers-Redis.md)         |
| [Postgres](engines/postgres/Drivers-Postgres.md)      | Postgres driver (wire protocol from scratch, SCRAM-SHA-256). **Status: 1.0.0-rc.**                | [Docs](engines/postgres/Drivers-Postgres.md)   |
| [MariaDB](engines/maria/Drivers-Maria.md)             | MariaDB / MySQL driver (wraps `npm:mariadb`)                                                      | [Docs](engines/maria/Drivers-Maria.md)         |
| [SQLite](engines/sqlite/Drivers-SQLite.md)            | SQLite driver (runtime-branched: `bun:sqlite` / `jsr:@db/sqlite` / `node:sqlite`)                 | [Docs](engines/sqlite/Drivers-SQLite.md)       |
| [MongoDB](engines/mongo/Drivers-Mongo.md)             | MongoDB driver (wraps `npm:mongodb`)                                                              | [Docs](engines/mongo/Drivers-Mongo.md)         |
| [Neon (HTTP)](engines/neon/Drivers-Neon.md)           | Postgres-over-HTTP edge driver — fetch-only, no sockets. **Edge/serverless-safe.**                | [Docs](engines/neon/Drivers-Neon.md)           |
| [Turso (HTTP)](engines/turso/Drivers-Turso.md)        | SQLite-over-HTTP edge driver — fetch-only, no native binding. **Edge/serverless-safe.**           | [Docs](engines/turso/Drivers-Turso.md)         |
| [Cloudflare D1 (HTTP)](engines/d1/Drivers-D1.md)      | SQLite-over-HTTP (D1 REST) edge driver — fetch-only, no native binding. **Edge/serverless-safe.** | [Docs](engines/d1/Drivers-D1.md)               |
| [Compatibility matrix](docs/Drivers-Compatibility.md) | Every engine's kind, dialect, transport, edge-safety, and declared capabilities                   | [Docs](docs/Drivers-Compatibility.md)          |

## Installation

**Deno:**

```bash
deno add jsr:@tundralibs/drivers
```

**Bun:**

```bash
bunx jsr add @tundralibs/drivers
```

**Node.js:**

```bash
npx jsr add @tundralibs/drivers
```

### Import

```typescript
// Base abstractions + every engine in one barrel
import {
  BaseEngine,
  D1Engine,
  MariaEngine,
  MemcachedEngine,
  MongoEngine,
  NeonHttpEngine,
  PostgresEngine,
  RedisEngine,
  SQLEngine,
  SQLiteEngine,
  TursoEngine,
} from '@tundralibs/drivers';

import { EngineError } from '@tundralibs/drivers/errors';
import type { EngineOptions, EnginePoolStats } from '@tundralibs/drivers/types';

// Per-engine subpath imports keep tree-shaking happy when you only
// need one engine.
import { MemcachedEngine } from '@tundralibs/drivers/memcached';
import { RedisEngine } from '@tundralibs/drivers/redis';
import { PostgresEngine } from '@tundralibs/drivers/postgres';
import { MariaEngine } from '@tundralibs/drivers/maria';
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';
import { MongoEngine } from '@tundralibs/drivers/mongo';

// Edge / serverless: fetch-only (no sockets, no native binding).
import { NeonHttpEngine } from '@tundralibs/drivers/neon'; // Postgres-over-HTTP
import { TursoEngine } from '@tundralibs/drivers/turso'; // SQLite-over-HTTP
import { D1Engine } from '@tundralibs/drivers/d1'; // SQLite-over-HTTP (Cloudflare D1)
```

## Quick Start

```typescript
import { MemcachedEngine } from '@tundralibs/drivers/memcached';

const cache = new MemcachedEngine('app-cache', {
  host: 'localhost',
  port: 11211,
  pool: { min: 1, max: 8 },
});

// Auto-connects on first call.
await cache.set('user:1', JSON.stringify({ name: 'Alice' }), 60);
const raw = await cache.get('user:1');
console.log(JSON.parse(raw!));

await cache.disconnect();
```

## Transactions

Wrap work in a callback — the connection is reserved on entry and released on
exit (COMMIT if the callback resolves, ROLLBACK if it throws), so it can never
leak from the pool:

```typescript
import { SQLiteEngine } from '@tundralibs/drivers/sqlite';

const engine = new SQLiteEngine('app', { path: './data' });

const rows = await engine.transaction(async (tx) => {
  await tx.execute({
    sql: 'INSERT INTO users (id, email) VALUES (:id:, :email:)',
    params: { id: 1, email: 'ada@x.dev' },
  });
  return await tx.execute({ sql: 'SELECT * FROM users' });
});
```

Nest with the scope's own `transaction()` to open a `SAVEPOINT`: the inner
block rolls back to the savepoint on failure — a thrown error **or** a SQL
error such as a constraint violation — while the outer transaction survives, so
you can `try/catch` and carry on:

```typescript
await engine.transaction(async (tx) => {
  await tx.execute({ sql: 'INSERT INTO orders ...' });
  try {
    await tx.transaction(async (sp) => {
      await sp.execute({ sql: 'INSERT INTO line_items ...' });
      await sp.execute({ sql: 'INSERT INTO line_items ...duplicate' }); // fails
    });
  } catch {
    // only the line_items work rolled back to the savepoint; the order stays
  }
  // outer commits → the order persists
});
```

Savepoints nest arbitrarily deep (LIFO). The `SAVEPOINT` syntax is identical
across SQLite, PostgreSQL, and MariaDB; MongoDB has no transactions, so
`transaction()` is unavailable there. The lower-level `beginTransaction` /
`commitTransaction` / `createSavepoint` primitives exist but are `@internal` —
the callback form is the supported API because it can't leak a connection.

A transaction is bound to a **single** connection, so run its statements one at
a time — `await` each in turn. Firing overlapping statements on the same scope
(e.g. `Promise.all([tx.execute(a), tx.execute(b)])`) is refused with a
`TRANSACTION_OPERATION_ERROR` rather than allowed to corrupt the wire protocol.
Likewise, the `tx` scope is only valid for the duration of its callback; using
it after the callback returns throws `TRANSACTION_NOT_FOUND`.

## Architecture

```
    Consumer code (Cacher, NORM, app code)
                  │
    ┌─────────────┼─────────────┐
    │             │             │
Redis,        Postgres,     Mongo,
Memcached     MariaDB,      …                  ← driver engines
              SQLite
    │             │             │
    │         SQLEngine         │              ← +tx, +execute, +stats
    │             │             │
    └─────────────┴─────────────┘
                  │
             BaseEngine                        ← lifecycle + inline pool
                  │
         @tundralibs/compat                    ← cross-runtime TCP
```

`BaseEngine` composes an internal `ConnectionPool<T>` (owned as `this._pool`,
not part of the public API — you never construct or pass a `Pool` object). With
no `pool` option configured, the engine runs in single-connection mode (one
warm connection, no idle eviction) — which is what you want when sitting
behind a server-side pooler like PgBouncer / pgcat / RDS Proxy. Configure
`pool: { min, max, idleTimeoutSeconds, acquireTimeoutSeconds }` for
multi-connection behavior.

Drivers implement four hooks:

| Hook                | Purpose                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| `_createResource`   | Open one fresh connection                                                                               |
| `_destroyResource`  | Close one connection                                                                                    |
| `_ping`             | Liveness check on a pooled connection                                                                   |
| `_validateResource` | (Optional) Health check before a connection is reused — from the idle list or handed to a queued waiter |

Subclasses of `SQLEngine` add transaction hooks:

| Hook                   | Purpose                                |
| ---------------------- | -------------------------------------- |
| `_execute`             | Run one query on a given client        |
| `_beginTransaction`    | Issue BEGIN on the given client        |
| `_commitTransaction`   | Issue COMMIT                           |
| `_rollbackTransaction` | Issue ROLLBACK                         |
| `_encodeValue`         | (Optional) Per-value encoding override |

The base class handles everything else: status state machine, idempotent
connect / disconnect, SSL/TLS option loading, pool min/max/idle/eviction,
event emission, named-param rewriting (`:name:`), slow-query detection,
auto-rollback, transaction-timeout enforcement, query stats.

## Key Features

### Infrastructure

| Feature                               | Bun | Deno | Node.js |
| ------------------------------------- | --- | ---- | ------- |
| Inline connection pool                | ✅  | ✅   | ✅      |
| Single-connection mode (no pool cfg)  | ✅  | ✅   | ✅      |
| Connection lifecycle state machine    | ✅  | ✅   | ✅      |
| Min/max pool sizing                   | ✅  | ✅   | ✅      |
| Idle eviction (won't drop below min)  | ✅  | ✅   | ✅      |
| Acquire-timeout queueing              | ✅  | ✅   | ✅      |
| SSL/TLS PEM + file path loading       | ✅  | ✅   | ✅      |
| Standardized cross-engine error codes | ✅  | ✅   | ✅      |
| Lifecycle + query events              | ✅  | ✅   | ✅      |
| Named-parameter rewriting (`:name:`)  | ✅  | ✅   | ✅      |
| Per-engine value encoding hook        | ✅  | ✅   | ✅      |

### Engines

| Engine     | Approach            | Notes                                                            | Bun | Deno | Node.js |
| ---------- | ------------------- | ---------------------------------------------------------------- | --- | ---- | ------- |
| Memcached  | from scratch        | Text protocol over TCP. ~480 LOC                                 | ✅  | ✅   | ✅      |
| Redis      | from scratch        | RESP3 (RESP2 fallback). String / hash / scan / pub-sub           | ✅  | ✅   | ✅      |
| Postgres   | **from scratch**    | Wire v3, SCRAM-SHA-256 auth, binary param format. **rc**         | ✅  | ✅   | ✅      |
| MariaDB    | wraps `npm:mariadb` | Per-connection mode, BaseEngine owns the pool                    | ✅  | ✅   | ✅      |
| SQLite     | runtime-branched    | `bun:sqlite` / `jsr:@db/sqlite` / `node:sqlite`                  | ✅  | ✅   | ✅\*    |
| MongoDB    | wraps `npm:mongodb` | BaseEngine pool bypassed (MongoClient pools internally)          | ✅  | ✅   | ✅      |
| Neon HTTP  | **from scratch**    | Postgres-over-HTTP, fetch-only, one-shot. **Edge-safe**          | ✅  | ✅   | ✅      |
| Turso HTTP | **from scratch**    | SQLite-over-HTTP (Hrana v3), fetch-only, one-shot. **Edge-safe** | ✅  | ✅   | ✅      |
| D1 HTTP    | **from scratch**    | SQLite-over-HTTP (D1 REST), fetch-only, one-shot. **Edge-safe**  | ✅  | ✅   | ✅      |

\*Node SQLite uses the built-in `node:sqlite` (Node 22+) by default and falls
back to `npm:better-sqlite3` if the built-in is missing. The fallback is an
optional dependency.

### Standardized error codes

Every engine maps native errors to standardized codes in `EngineError.code`.
This enables consistent error handling across different database systems.

**Key error codes:**

`INVALID_AUTH`, `PERMISSION_DENIED`, `DATABASE_NOT_FOUND`, `TABLE_NOT_FOUND`,
`COLUMN_NOT_FOUND`, `DUPLICATE_KEY`, `FOREIGN_KEY_VIOLATION`,
`NOT_NULL_VIOLATION`, `CHECK_VIOLATION`, `SYNTAX_ERROR`, `DEADLOCK`,
`LOCK_TIMEOUT`, `QUERY_TIMEOUT`, `SERIALIZATION_FAILURE`, `CONNECTION_LOST`,
`QUERY_EXECUTION_FAILED`, `MISSING_PARAMETERS`, `TRANSACTION_NOT_FOUND`,
`TRANSACTION_OPERATION_ERROR`, `OPERATION_FAILED`, `UNSUPPORTED_OPERATION`.

See [Error Handling](docs/Drivers-Errors.md) for complete documentation of all error codes, handling patterns, and examples.

## License

MIT
