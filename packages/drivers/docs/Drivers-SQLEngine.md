# SQLEngine

Abstract base for SQL-style engines (relational + document). Extends
[`BaseEngine`](Drivers-BaseEngine.md) with transactions, query execution,
named-parameter rewriting, and query stats.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Configuration](#configuration)
- [Public API](#public-api)
- [OQL query surface](#oql-query-surface)
- [Transactions](#transactions)
- [Named parameters](#named-parameters)
- [Value encoding](#value-encoding)
- [Hooks for subclasses](#hooks-for-subclasses)
- [Events](#events)
- [Stats](#stats)

## Overview

`SQLEngine` is abstract — concrete drivers (`PostgresEngine`,
`MariaEngine`, `SQLiteEngine`, …) extend it. It adds:

- `execute(query)` — single-query exec (auto-connects, allocates query id,
  records timing/stats, emits `query` / `slowQuery`)
- `transaction(fn)` — callback-scoped transactions (auto commit/rollback,
  leak-safe); nesting opens a `SAVEPOINT`. The id-based
  `beginTransaction`/`commit`/`rollback` primitives are `@internal`.
- `_standardizeQuery()` — `:name:` placeholder rewriting + per-engine
  parameter encoding via `_encodeValue`
- Auto-rollback on intra-transaction failure (`autoRollbackOnFailure`)
- Per-transaction timeout with auto-rollback
- Query-stats accumulator (`engine.queryStats`)

## Configuration

`SQLEngineOptions` extends `EngineOptions`. Subclass option types extend
this further.

| Option                  | Type      | Default | Notes                                                                      |
| ----------------------- | --------- | ------- | -------------------------------------------------------------------------- |
| `slowQueryThreshold`    | `number`  | `0.5`   | Seconds. Queries longer than this fire a `slowQuery` event.                |
| `transactionTimeout`    | `number`  | `120`   | Seconds. Transactions exceeding this auto-rollback. `0` disables.          |
| `autoRollbackOnFailure` | `boolean` | `true`  | If a query inside a transaction fails, the driver auto-rolls back the txn. |

Plus everything from [`BaseEngine` Configuration](Drivers-BaseEngine.md#configuration).

## Public API

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
  username: 'app',
  password: '...',
});

const r = await engine.execute({
  sql: 'SELECT id, name FROM users WHERE active = :ac:',
  params: { ac: true },
});
console.log(r.data); // typed rows
console.log(r.count); // affected count for DML
console.log(r.time); // wall-clock ms
console.log(r.isSlow); // > slowQueryThreshold * 1000
console.log(r.id); // query id (ulid)
```

| Method                      | Purpose                                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `execute(query)`            | Run one query. Auto-connects.                                                                                          |
| `batchExecute(queries[])`   | Run a list of queries sequentially, halting on first error.                                                            |
| `transaction(fn, opts?)`    | **The transaction API.** Run `fn` in a transaction; auto COMMIT/ROLLBACK; nested `tx.transaction()` opens a savepoint. |
| `beginTransaction(opts?)`   | _@internal_ — low-level; returns `transactionId`. Prefer `transaction(fn)`.                                            |
| `commitTransaction(id)`     | _@internal_ — idempotent.                                                                                              |
| `rollbackTransaction(id)`   | _@internal_ — idempotent.                                                                                              |
| `rollbackAllTransactions()` | Best-effort rollback of every active txn (shutdown).                                                                   |
| `queryStats`                | `{ totalQueries, successfulQueries, failedQueries, slowQueries, averageExecutionTimeMs }`                              |
| `stats`                     | Combined `{ pool, query }` snapshot.                                                                                   |

## OQL query surface

In addition to raw `execute`, `SQLEngine` exposes typed methods that take an
OQL `Query` object, translate it to the dialect via the engine's translator,
and execute the result. Every method accepts an optional `transactionId` to
run inside an existing transaction. All resolve to one or more
[`EngineQueryResult`](../types/EngineQueryResult.ts) values.

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
});

const r = await engine.select<{ id: number; name: string }>({
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'name'],
  projection: { '@id': true, '@name': true },
  // ...rest of the OQL Query
});
console.log(r.data); // typed rows (R[])
console.log(r.count); // rows returned
```

### DML

| Method                              | Returns                         | Notes                                                                                                                   |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `select<R>(q, transactionId?)`      | `Promise<EngineQueryResult<R>>` | Translate and run a `SELECT`. Rows come back as `R[]` in `data`; `count` is the rows returned.                          |
| `insert<R>(q, transactionId?)`      | `Promise<EngineQueryResult<R>>` | Run an `INSERT`. Postgres / SQLite emit `RETURNING` and surface inserted rows in `data`; MariaDB also emits it (10.5+). |
| `insertQuery<R>(q, transactionId?)` | `Promise<EngineQueryResult<R>>` | Run an `INSERT … SELECT` — a single statement copying rows from a SELECT into the target table.                         |
| `update<R>(q, transactionId?)`      | `Promise<EngineQueryResult<R>>` | Run an `UPDATE`. No `RETURNING` is ever emitted — `data` is `[]` and `count` carries the affected-row count.            |
| `delete<R>(q, transactionId?)`      | `Promise<EngineQueryResult<R>>` | Run a `DELETE`. Same `data: []` / `count: affected` shape as `update`.                                                  |
| `upsert<R>(q, transactionId?)`      | `Promise<EngineQueryResult<R>>` | Run an `UPSERT`. `RETURNING` is emitted on every dialect that supports it.                                              |

`R` defaults to `Record<string, unknown>`.

### count

```typescript ignore
public count(
  q: Query<'COUNT'>,
  transactionId?: string,
): Promise<EngineQueryResult<{ Count: number }>>
```

Translate and run a `COUNT`. The single aggregate value is normalised to the
public `{ Count: number }` shape, available at `result.data[0].Count`. The
outer `result.count` is the row count of the result set and is always `1`.

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';
// Needs a separate install: deno add @tundralibs/oql
import type { Query } from '@tundralibs/oql/types';

const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
});
declare const q: Query<'COUNT'>;

const r = await engine.count(q);
console.log(r.data[0].Count); // the count value
```

### DDL

DDL methods translate an OQL `Query` and execute it. Methods marked
"multi-statement" run a list of statements sequentially; on engines with
`transactions: true` they run inside a transaction so a partial failure rolls
back. They resolve to `EngineQueryResult[]`. Single statement methods resolve
to a single `EngineQueryResult`. Each accepts an optional `transactionId` to
share an outer transaction.

> **Edge caveat:** on engines that declare `transactions: false`
> (`NeonHttpEngine` / `TursoEngine` — one-shot HTTP with no session) the
> transaction wrapper is skipped: each statement of a multi-statement DDL call
> runs standalone, so a partial failure does **not** roll back the statements
> that already succeeded.

| Method                                       | Returns                        | Notes                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createTable(q, transactionId?)`             | `Promise<EngineQueryResult[]>` | The translator may return more than one statement (inline indexes/constraints). Statements run sequentially in a transaction so a partial failure rolls back — except on `transactions: false` edge engines (see the edge caveat above). |
| `alterTable(q, transactionId?)`              | `Promise<EngineQueryResult[]>` | Multi-statement on every dialect.                                                                                                                                                                                                        |
| `dropTable(q, transactionId?)`               | `Promise<EngineQueryResult>`   | Run a `DROP_TABLE`.                                                                                                                                                                                                                      |
| `truncate(q, transactionId?)`                | `Promise<EngineQueryResult>`   | Run a `TRUNCATE`. SQLite emulates it as `DELETE FROM`.                                                                                                                                                                                   |
| `createIndex(q, transactionId?)`             | `Promise<EngineQueryResult>`   | Run a `CREATE_INDEX`.                                                                                                                                                                                                                    |
| `dropIndex(q, transactionId?)`               | `Promise<EngineQueryResult>`   | Run a `DROP_INDEX`.                                                                                                                                                                                                                      |
| `createView(q, transactionId?)`              | `Promise<EngineQueryResult>`   | Run a `CREATE_VIEW`. On dialects without materialized views (SQLite, MariaDB), `materialized: true` silently falls back to a regular view.                                                                                               |
| `dropView(q, transactionId?)`                | `Promise<EngineQueryResult>`   | Run a `DROP_VIEW`.                                                                                                                                                                                                                       |
| `alterView(q, transactionId?)`               | `Promise<EngineQueryResult[]>` | Multi-statement on dialects that lack `ALTER VIEW`.                                                                                                                                                                                      |
| `refreshMaterializedView(q, transactionId?)` | `Promise<EngineQueryResult>`   | Run a `REFRESH_MATERIALIZED_VIEW`. On dialects without materialized views, emits the no-op `SELECT 1`.                                                                                                                                   |
| `createSchema(q, transactionId?)`            | `Promise<EngineQueryResult>`   | Run a `CREATE_SCHEMA`. SQLite emulates via per-schema `.db` files + `ATTACH DATABASE`; on dialects where the statement cannot run in a transaction, see Throws.                                                                          |
| `dropSchema(q, transactionId?)`              | `Promise<EngineQueryResult>`   | Run a `DROP_SCHEMA`. Same transaction restriction as `createSchema` — see Throws.                                                                                                                                                        |

**Throws:** `createSchema` / `dropSchema` throw
`EngineError('UNSUPPORTED_OPERATION')` if a `transactionId` is supplied but the
dialect cannot run the statement inside a caller-supplied transaction (e.g.
SQLite `ATTACH DATABASE`).

## Transactions

### Callback form (the API)

Pass a callback to `transaction(fn)`. The connection is reserved on entry and
released on exit — **COMMIT** if `fn` resolves, **ROLLBACK** if it throws — so
it can never leak from the pool. Whatever `fn` returns is the result:

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
});

const rows = await engine.transaction(async (tx) => {
  await tx.execute({
    sql: 'INSERT INTO users (name) VALUES (:n:)',
    params: { n: 'Alice' },
  });
  return await tx.execute({ sql: 'SELECT * FROM users' });
});
```

`tx` is a [`TransactionScope`](../types/TransactionScope.ts) — `{ id, execute, transaction }`. `execute`
runs on the transaction's connection; `transaction(fn)` nests.

### Nested transactions = savepoints

A nested `tx.transaction(fn)` opens a `SAVEPOINT`. On resolve its writes fold
into the surrounding transaction; on failure it rolls back **only to the
savepoint** and rethrows — so the outer transaction survives and you can
`try/catch` to continue it. This holds for a thrown error **and** for a
SQL-level error (constraint violation, etc.): the engine scopes its
auto-rollback to the innermost savepoint rather than aborting the whole
transaction.

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
});

await engine.transaction(async (tx) => {
  await tx.execute({ sql: 'INSERT INTO orders ...' });
  try {
    await tx.transaction(async (sp) => {
      await sp.execute({ sql: 'INSERT INTO line_items ...' });
      await sp.execute({ sql: 'INSERT INTO line_items ...dup' }); // fails
    });
  } catch {
    // only the line_items work rolled back; the order stays
  }
});
```

Savepoints nest arbitrarily deep (LIFO). `SAVEPOINT` syntax is identical across
SQLite, PostgreSQL, and MariaDB.

`transaction(fn)` accepts the same `{ name, timeout }` options as its second
argument. Options apply to the outermost transaction; a nested savepoint
cannot change them.

### One connection, one statement at a time

A transaction is bound to a single reserved connection, which cannot multiplex.
Run its statements sequentially — `await` each in turn. Overlapping statements
on the same scope (e.g. `Promise.all([tx.execute(a), tx.execute(b)])`) are
refused with a `TRANSACTION_OPERATION_ERROR` rather than allowed to interleave
on the wire. The `tx` scope is valid only inside its callback; using it after
the callback returns throws `TRANSACTION_NOT_FOUND` — and it stays pinned to
its own transaction, so even a reused `name` never resolves a stale scope onto
a different live transaction.

If a callback swallows a statement error that has already forced a full
rollback (a top-level failure with no savepoint open), `transaction(fn)`
surfaces a `TRANSACTION_OPERATION_ERROR` at commit rather than reporting a
false success — a resolved `transaction(fn)` always means the work committed.
Use a nested `tx.transaction()` savepoint to recover from a statement failure
and keep the outer transaction alive.

### Internal primitives

`beginTransaction` / `commitTransaction` / `rollbackTransaction` /
`createSavepoint` / `releaseSavepoint` / `rollbackToSavepoint`, and the
`transaction(options?)` handle form (`{ id, commit, rollback, execute }`), are
`@internal`. They still work — the NORM executor uses them — but the callback
form above is the supported API because it guarantees the connection is
released. The driver tracks state per-transaction (`ACTIVE` / `COMMITTED` /
`ROLLBACK` / `TIMEOUT`); once a transaction ends its id is invalidated, so a
late `execute({ transactionId })` throws `TRANSACTION_NOT_FOUND`.

If `autoRollbackOnFailure` is `true` (default), a query failure inside a
transaction triggers an automatic rollback — scoped to the innermost savepoint
when one is open, otherwise the whole transaction — before the error re-throws.

## Named parameters

`SQLEngine` rewrites `:name:` placeholders to the dialect-native format
declared in `Capabilities.parameterReplacement`:

| Engine   | Placeholder rewrite                                            |
| -------- | -------------------------------------------------------------- |
| Postgres | `$1`, `$2`, ... (positional; PG overrides `_standardizeQuery`) |
| MariaDB  | `:name`                                                        |
| SQLite   | `:name`                                                        |

The same name appearing twice maps to the same placeholder index (and the
value is supplied once).

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
});

await engine.execute({
  sql: 'SELECT * FROM users WHERE id = :id: OR parent = :id:',
  params: { id: 1 }, // bound once, used twice
});
```

Missing parameters throw `EngineError('MISSING_PARAMETERS')`.

## Value encoding

Every parameter value is passed through `_encodeValue` in
`_standardizeQuery`. The default returns the value as-is. Drivers
override it for runtime quirks:

| Engine   | Override                                                                         |
| -------- | -------------------------------------------------------------------------------- |
| Postgres | Custom `_standardizeQuery` does positional binary/text encoding (see binary.ts). |
| MariaDB  | Identity — `npm:mariadb` handles JS values natively.                             |
| SQLite   | `Date → ISO`, `boolean → 0/1`, `object → JSON`, `undefined → null`.              |

## Hooks for subclasses

| Hook                   | Required | Purpose                               |
| ---------------------- | -------- | ------------------------------------- |
| `_execute`             | yes      | Run one query on the supplied client. |
| `_beginTransaction`    | yes      | Issue BEGIN on the client.            |
| `_commitTransaction`   | yes      | Issue COMMIT.                         |
| `_rollbackTransaction` | yes      | Issue ROLLBACK.                       |
| `_wrapDriverError`     | no       | Map native errors → standard codes.   |
| `_encodeValue`         | no       | Per-value encoding override.          |

Plus all the [`BaseEngine` hooks](Drivers-BaseEngine.md#hooks-for-subclasses).

## Events

In addition to [`BaseEngine` events](Drivers-BaseEngine.md#events):

| Event                 | Payload                           | When                                     |
| --------------------- | --------------------------------- | ---------------------------------------- |
| `query`               | `(instanceId, EngineQueryResult)` | After every successful `execute`.        |
| `slowQuery`           | `(instanceId, EngineQueryResult)` | When `time > slowQueryThreshold * 1000`. |
| `transactionBegin`    | `(instanceId, transactionId)`     | After `beginTransaction` succeeds.       |
| `transactionCommit`   | `(instanceId, transactionId)`     | After `commitTransaction` succeeds.      |
| `transactionRollback` | `(instanceId, transactionId)`     | After `rollbackTransaction` succeeds.    |
| `transactionTimeout`  | `(instanceId, transactionId)`     | When the per-transaction timeout fires.  |

## Stats

```typescript
import { PostgresEngine } from '@tundralibs/drivers/postgres';

const engine = new PostgresEngine('app', {
  host: 'localhost',
  database: 'app',
});

console.log(engine.queryStats);
// {
//   totalQueries: 187,
//   successfulQueries: 184,
//   failedQueries: 3,
//   slowQueries: 1,
//   averageExecutionTimeMs: 5.61,
// }

console.log(engine.stats);
// { pool: { total, active, idle, waiting }, query: { ... } }
```

`queryStats` includes both user `execute` calls and driver-internal
BEGIN/COMMIT/ROLLBACK statements (each is one wire query).

[← Back to Drivers](../README.md)
