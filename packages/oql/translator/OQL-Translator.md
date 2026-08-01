# OQL Translator

SQL and NoSQL query translators for OQL.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Supported Databases](#supported-databases)
- [Translator API](#translator-api)
- [SQL Translators](#sql-translators)
- [NoSQL Translators](#nosql-translators)
- [Parameters](#parameters)
- [Usage Examples](#usage-examples)

## Overview

The translator module converts OQL query objects into native database queries. Each translator implements database-specific syntax, operators, and features while maintaining a consistent API.

**Features:**

- Parameter binding for SQL injection prevention
- Dialect-specific optimizations
- Comprehensive operator support
- Expression and aggregate translation
- DDL operation support

## Installation

**Deno:**

```bash
deno add @tundralibs/oql
```

**Bun:**

```bash
bunx jsr add @tundralibs/oql
```

**Node.js:**

```bash
npx jsr add @tundralibs/oql
```

## Supported Databases

| Database   | Translator           | Parameter Style | Features                                 |
| ---------- | -------------------- | --------------- | ---------------------------------------- |
| PostgreSQL | `PostgresTranslator` | `:p_0:, :p_1:`  | Full support, JSONB operators, arrays    |
| MariaDB    | `MariaTranslator`    | `:p_0:, :p_1:`  | Full support, MariaDB-specific functions |
| SQLite     | `SQLiteTranslator`   | `:p_0:, :p_1:`  | Full support, SQLite-specific syntax     |
| MongoDB    | `MongoTranslator`    | N/A             | Aggregation pipeline, CRUD operations    |

> **Note on parameters.** Every SQL translator (including
> `PostgresTranslator`) emits the engine-compat **named** placeholder form
> `:p_0:, :p_1:, …` with param keys `p_0`, `p_1`, … . The numbered `$1, $2,
> …` form Postgres ultimately uses is produced _later_ by the
> `@tundralibs/drivers` Postgres engine, **outside** OQL — the translator
> itself never emits `$N`.

## Translator API

The SQL translators (`PostgresTranslator`, `MariaTranslator`,
`SQLiteTranslator`) extend `AbstractTranslator` and return `TranslatedQuery`
(or `TranslatedQuery[]` for multi-statement DDL). The `MongoTranslator` does
**not** extend `AbstractTranslator` — it is a standalone class that mirrors
the same public-method surface but returns `MongoAction` union variants
instead of `TranslatedQuery` (see [NoSQL Translators](#nosql-translators)).

`AbstractTranslator` provides these methods:

### DML Operations

```typescript
abstract class AbstractTranslator {
  // DML methods — one per query-type discriminator
  select(query: Query<'SELECT'>): TranslatedQuery;
  insert(query: Query<'INSERT'>): TranslatedQuery;
  insertQuery(query: Query<'INSERT_FROM_QUERY'>): TranslatedQuery; // INSERT ... SELECT ...
  update(query: Query<'UPDATE'>): TranslatedQuery;
  delete(query: Query<'DELETE'>): TranslatedQuery;
  upsert(query: Query<'UPSERT'>): TranslatedQuery;
  count(query: Query<'COUNT'>): TranslatedQuery;

  // DDL methods
  createSchema(query: Query<'CREATE_SCHEMA'>): TranslatedQuery;
  dropSchema(query: Query<'DROP_SCHEMA'>): TranslatedQuery;
  createTable(query: Query<'CREATE_TABLE'>): TranslatedQuery[];
  dropTable(query: Query<'DROP_TABLE'>): TranslatedQuery;
  alterTable(query: Query<'ALTER_TABLE'>): TranslatedQuery[];
  truncate(query: Query<'TRUNCATE'>): TranslatedQuery;

  createIndex(query: Query<'CREATE_INDEX'>): TranslatedQuery;
  dropIndex(query: Query<'DROP_INDEX'>): TranslatedQuery;

  createView(query: Query<'CREATE_VIEW'>): TranslatedQuery;
  dropView(query: Query<'DROP_VIEW'>): TranslatedQuery;
  alterView(query: Query<'ALTER_VIEW'>): TranslatedQuery[];
  refreshMaterializedView(
    query: Query<'REFRESH_MATERIALIZED_VIEW'>,
  ): TranslatedQuery;
}
```

**Method naming.** Each public method maps 1:1 to a `Query<'…'>`
discriminator: `Query<'INSERT'>` → `insert()`, `Query<'INSERT_FROM_QUERY'>`
→ `insertQuery()` (produces `INSERT INTO … SELECT … FROM …`), and so
on. Some DDL operations return `TranslatedQuery[]` because a dialect
may emit the table plus separate index/constraint statements that
can't go inline.

### TranslatedQuery

The SQL translators return this structure (the `MongoTranslator` returns
`MongoAction` instead — see [NoSQL Translators](#nosql-translators)):

```typescript
type TranslatedQuery = {
  sql: string;
  params: Record<string, unknown>;
};
```

## SQL Translators

### PostgresTranslator

PostgreSQL-specific translator with full feature support.

```typescript
import { PostgresTranslator } from '@tundralibs/oql/translator';

const translator = new PostgresTranslator();

const query = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'age'],
  projection: { '@id': true, '@email': true },
  where: { '@age': { $gte: 18 } },
};

const { sql, params } = translator.select(query);
// sql: SELECT "id" AS "id", "email" AS "email" FROM "users" WHERE "age" >= :p_0:
// params: { p_0: 18 }
```

**Features:**

- Double-quote identifiers
- Named parameters (:p_0:, :p_1:, ...) — the Postgres engine rewrites these to $1, $2, ... downstream
- JSONB operators (@>, <@, ?, etc.)
- Array operators
- Full-text search
- Window functions
- RETURNING clause support

### MariaTranslator

MariaDB/MySQL-specific translator.

```typescript
import { MariaTranslator } from '@tundralibs/oql/translator';

const translator = new MariaTranslator();
const { sql, params } = translator.select(query);
// sql: SELECT `id` AS `id`, `email` AS `email` FROM `users` WHERE `age` >= :p_0:
// params: { p_0: 18 }
```

**Features:**

- Backtick identifiers
- Named parameters (:p_0:, :p_1:, ...)
- MariaDB-specific functions
- JSON functions
- LIMIT/OFFSET support
- ON DUPLICATE KEY UPDATE for UPSERT

### SQLiteTranslator

SQLite-specific translator.

```typescript
import { SQLiteTranslator } from '@tundralibs/oql/translator';

const translator = new SQLiteTranslator();
const { sql, params } = translator.select(query);
// sql: SELECT "id" AS "id", "email" AS "email" FROM "users" WHERE "age" >= :p_0:
// params: { p_0: 18 }
```

**Features:**

- Double-quote identifiers
- Named parameters (:p_0:, :p_1:, ...)
- SQLite-specific functions
- JSON support (SQLite 3.38+)
- Limited DDL operations
- No schema support

## NoSQL Translators

### MongoTranslator

Translates OQL to MongoDB operations.

```typescript
import { MongoTranslator } from '@tundralibs/oql/translator';
import type { MongoAction } from '@tundralibs/oql/translator';

const translator = new MongoTranslator();

const query = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'age'],
  projection: { '@id': true, '@email': true },
  where: { '@age': { $gte: 18 } },
};

const action = translator.select(query);
// {
//   sql: 'find',
//   params: {
//     collection: 'users',
//     filter: { age: { $gte: 18 } },
//     options: { projection: { id: 1, email: 1 } }
//   }
// }
```

`MongoTranslator` methods return a `MongoAction` — a discriminated union
keyed by the `sql` literal (`'find'`, `'aggregate'`, `'insert'`, …), each
carrying its own `params` shape. Drivers `switch (action.sql)` and use
`action.params` directly. Unlike the SQL translators, it does **not** extend
`AbstractTranslator` and does **not** return `TranslatedQuery`.

**Features:**

- Converts to MongoDB aggregation pipeline
- Maps OQL operators to MongoDB operators
- Handles joins via $lookup
- Supports aggregates via $group
- Converts expressions to $project stages

**Pipeline-ordering guarantees:**

- A `where` `$match` is emitted only **after** the stages that materialise
  every field it references — after `$lookup` when it references a joined
  field in **either** key or value position (e.g. `{ '@createdAt': { $gt:
  '@Author.@joinedAt' } }`), and after the expressions `$addFields` when it
  references a declared expression alias. A pure primary-table filter still
  gets the efficient early `$match`. (Matching a not-yet-materialised field
  silently compares against `missing` and returns wrong rows.)
- `insertQuery` (INSERT … SELECT) emits an aggregation over the source
  collection ending in **`$merge`** (append) — never `$out`, which would
  replace the whole target collection. The source SELECT's WHERE /
  projection / limit / sort are preserved in the pipeline.

**Mongo Action Types:**

```typescript
type MongoAction =
  | MongoFindAction
  | MongoAggregateAction
  | MongoInsertAction
  | MongoUpdateAction
  | MongoBulkWriteAction
  | MongoDeleteAction
  | MongoCountAction
  | MongoCreateCollectionAction
  | MongoCreateIndexAction
  | MongoDropIndexAction
  | MongoDropAction
  | MongoRenameCollectionAction
  | MongoCreateViewAction
  | MongoDropDatabaseAction
  | MongoNoopAction;
```

`MongoBulkUpsertOp` is also exported, but it is **not** a `MongoAction`
member — it is the per-row sub-shape (`{ filter, update }`) carried inside a
`MongoBulkWriteAction`'s `params.ops` array.

## Parameters

The `Parameters` class handles parameter binding:

```typescript
import { Parameters } from '@tundralibs/oql/translator';

const params = new Parameters();

// Add parameters — returns the generated param NAME (not a placeholder).
// Same value added twice returns the same name (dedup).
const name1 = params.add(18); // 'p_0'
const name2 = params.add('active'); // 'p_1'

// Number of registered params
params.size; // 2

// Snapshot of all params as a Record<name, value>
const record = params.asRecord();
// { p_0: 18, p_1: 'active' }
```

> `Parameters` exposes only `add()`, `asRecord()`, and `size`. The
> dialect-specific placeholder text (`:p_0:`, etc.) is produced by the
> translator's `_parameterize` helper, not by `Parameters`.

## Usage Examples

### Basic SELECT Translation

```typescript
import { PostgresTranslator } from '@tundralibs/oql/translator';

const translator = new PostgresTranslator();

const query = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'username', 'age'],
  projection: {
    '@id': 'userId',
    '@email': 'userEmail',
    '@username': 'userName',
  },
  where: {
    '@email': { $like: '%@company.com' },
    '@age': { $between: [18, 65] },
  },
  orderBy: { '@username': 'ASC' },
  limit: 50,
};

const { sql, params } = translator.select(query);
console.log(sql);
// SELECT "id" AS "userId", "email" AS "userEmail", "username" AS "userName"
// FROM "users"
// WHERE "email" LIKE :p_0: AND "age" BETWEEN :p_1: AND :p_2:
// ORDER BY "username" ASC
// LIMIT 50

console.log(params);
// { p_0: '%@company.com', p_1: 18, p_2: 65 }
```

### INSERT with Expressions

```typescript
import { PostgresTranslator } from '@tundralibs/oql/translator';

const translator = new PostgresTranslator();

const query = {
  type: 'INSERT',
  table: 'orders',
  columns: ['userId', 'total', 'createdAt'],
  data: {
    userId: 123,
    total: 99.99,
    createdAt: { $$_expression: 'NOW' },
  },
};

const { sql, params } = translator.insert(query);
// sql: INSERT INTO "orders" ("userId", "total", "createdAt")
//      VALUES (:p_0:, :p_1:, CURRENT_TIMESTAMP) RETURNING "userId", "total", "createdAt"
// params: { p_0: 123, p_1: 99.99 }
// (Postgres NOW emits CURRENT_TIMESTAMP; MariaDB emits NOW())
```

### SELECT with JOINs and Aggregates

```typescript
import { PostgresTranslator } from '@tundralibs/oql/translator';

const translator = new PostgresTranslator();

const query = {
  type: 'SELECT',
  table: 'orders',
  columns: ['id', 'userId', 'total'],
  joins: {
    // A JOIN spec needs its own `table` and `columns` (the columns the
    // joined table exposes) in addition to `on`.
    'users': {
      table: 'users',
      columns: ['id', 'email'],
      type: 'INNER',
      on: { '@users.@id': '@userId' },
    },
  },
  aggregates: {
    'totalRevenue': { $$_aggregate: 'SUM', column: '@total' },
    'orderCount': { $$_aggregate: 'COUNT', column: '@id' },
  },
  projection: {
    '@userId': 'customerId',
    '@users.@email': 'customerEmail',
    '@totalRevenue': true,
    '@orderCount': true,
  },
  having: {
    '@totalRevenue': { $gte: 1000 },
  },
  orderBy: { '@totalRevenue': 'DESC' },
};

const { sql, params } = translator.select(query);
// Generated SQL with JOINs, GROUP BY, and HAVING
```

### UPSERT Translation

```typescript
import { PostgresTranslator } from '@tundralibs/oql/translator';

const translator = new PostgresTranslator();

const query = {
  type: 'UPSERT',
  table: 'users',
  columns: ['id', 'email', 'updatedAt'],
  data: {
    id: 123,
    email: 'user@example.com',
    updatedAt: { $$_expression: 'NOW' },
  },
  conflictKeys: ['@id'],
  updateOnConflict: ['@email', '@updatedAt'],
};

const { sql, params } = translator.upsert(query);
// PostgreSQL: INSERT ... ON CONFLICT (id) DO UPDATE SET ...
// MariaDB: INSERT ... ON DUPLICATE KEY UPDATE ...
// SQLite: INSERT ... ON CONFLICT (id) DO UPDATE SET ...
```

### MongoDB Translation

```typescript
import { MongoTranslator } from '@tundralibs/oql/translator';

const translator = new MongoTranslator();

const query = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'age'],
  projection: { '@id': true, '@email': true, '@age': true },
  where: {
    $and: [
      { '@age': { $gte: 18 } },
      { '@email': { $endsWith: '@company.com' } },
    ],
  },
  orderBy: { '@age': 'DESC' },
  limit: 100,
};

const action = translator.select(query);
// {
//   sql: 'find',
//   params: {
//     collection: 'users',
//     filter: {
//       $and: [
//         { age: { $gte: 18 } },
//         { email: { $regex: '@company\\.com$' } }
//       ]
//     },
//     options: {
//       projection: { id: 1, email: 1, age: 1 },
//       sort: { age: -1 },
//       limit: 100
//     }
//   }
// }
```

### CREATE TABLE Translation

```typescript
import { PostgresTranslator } from '@tundralibs/oql/translator';

const translator = new PostgresTranslator();

const query = {
  type: 'CREATE_TABLE',
  table: 'users',
  schema: 'public',
  // `columns` is a KEYED object (column name → ColumnDefinition); there is
  // no `name` field on a column, and ColumnDefinition has no `default`.
  columns: {
    id: { type: 'INTEGER', nullable: false },
    email: { type: 'VARCHAR', length: 255, nullable: false },
    createdAt: { type: 'TIMESTAMP' },
  },
  primaryKey: ['id'],
  // `uniqueKeys` is keyed: constraint name → column names.
  uniqueKeys: { uq_email: ['email'] },
  ifNotExists: true,
};

// createTable returns TranslatedQuery[] (an array — a dialect may emit
// extra index/constraint statements that can't go inline).
const [{ sql }] = translator.createTable(query);
// CREATE TABLE IF NOT EXISTS "public"."users" ("id" INTEGER NOT NULL, "email" VARCHAR(255) NOT NULL, "createdAt" TIMESTAMP, PRIMARY KEY ("id"), CONSTRAINT "uq_email" UNIQUE ("email"))
```

## Dialect Differences

### Identifier Quoting

- **PostgreSQL**: Double quotes `"table"."column"`
- **MariaDB**: Backticks `` `table`.`column` ``
- **SQLite**: Double quotes `"table"."column"`

### Parameter Style

All SQL translators emit the same engine-compat named form on the way out of
OQL; the Postgres engine rewrites it to `$N` downstream.

- **PostgreSQL**: Named `:p_0:, :p_1:, :p_2:` (engine rewrites to `$1, $2, $3`)
- **MariaDB**: Named `:p_0:, :p_1:, :p_2:`
- **SQLite**: Named `:p_0:, :p_1:, :p_2:`

### UPSERT Syntax

- **PostgreSQL**: `ON CONFLICT ... DO UPDATE`
- **MariaDB**: `ON DUPLICATE KEY UPDATE`
- **SQLite**: `ON CONFLICT ... DO UPDATE`

### Date Functions

What the OQL `NOW` / `CURRENT_DATE` expressions emit per dialect:

- **PostgreSQL**: `NOW` → `CURRENT_TIMESTAMP`, `CURRENT_DATE` → `CURRENT_DATE`
- **MariaDB**: `NOW` → `NOW()`, `CURRENT_DATE` → `CURRENT_DATE()`
- **SQLite**: `NOW` → `datetime('now')`, `CURRENT_DATE` → `date('now')`

## Error Handling

Translators throw `DialectUnsupportedError` for operations a dialect can't
emit and can't emulate. The message format is
`Dialect '<dialect>' does not support <feature>` (the dialect name is
lowercase: `'postgres'`, `'maria'`, `'sqlite'`, `'mongo'`).

For example, MariaDB has no `FULL JOIN`:

```typescript
import {
  DialectUnsupportedError,
  MariaTranslator,
} from '@tundralibs/oql/translator';

const translator = new MariaTranslator();

try {
  translator.select({
    type: 'SELECT',
    table: 'orders',
    columns: ['id'],
    joins: {
      Users: {
        table: 'users',
        columns: ['id'],
        type: 'FULL',
        on: { '@Users.@id': '@userId' },
      },
    },
    projection: { '@id': true },
  });
} catch (error) {
  if (error instanceof DialectUnsupportedError) {
    console.log(error.message);
    // "Dialect 'maria' does not support FULL JOIN"
  }
}
```

Note that many operations are **emulated** rather than rejected — e.g.
`CREATE_SCHEMA` on SQLite does not throw; it emits an `ATTACH DATABASE`
statement (`ATTACH DATABASE 'test.db' AS "test"`), and `TRUNCATE` on SQLite
emits `DELETE FROM`. See the Compatibility Matrix for which features throw
versus degrade gracefully.

## Performance

- **Parameter binding** - All values are parameterized for security
- **Efficient generation** - Minimal string allocations
- **No runtime overhead** - Direct translation without intermediate steps

## Database Compatibility

OQL translators aim for cross-database compatibility, but some features have dialect-specific behavior:

- **Graceful Degradation**: Features without native support fall back to alternatives (e.g., materialized views → regular views on MariaDB/SQLite)
- **Explicit Errors**: Unsupported features that can't be emulated throw `DialectUnsupportedError`
- **Silent Passthroughs**: Some operations (HASH, ENCRYPT on SQLite/MongoDB) passthrough unchanged for portability

For comprehensive dialect differences, feature support matrices, and edge cases, see:

📖 **[Database Compatibility Matrix](../docs/Compatibility.md)**

This reference covers:

- DDL differences (schemas, materialized views, indexes)
- DML nuances (RETURNING, UPSERT semantics)
- Expression support (UUID, HASH, ENCRYPT/DECRYPT)
- Aggregate function availability
- JOIN type support
- When translators throw vs. gracefully degrade

## Related Documentation

- [Type System](../types/OQL-Types.md) - Query type definitions
- [Validators](../asserts/OQL-Asserts.md) - Runtime validation
- [Compatibility](../docs/Compatibility.md) - Feature compatibility matrix

---

[← Back to OQL](../README.md)
