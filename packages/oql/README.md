# OQL (Object Query Language)

Type-safe, database-agnostic query definitions for TypeScript/JavaScript.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare%20Workers-F38020?logo=cloudflare&logoColor=white)
![Browsers](https://img.shields.io/badge/Browsers-4285F4?logo=googlechrome&logoColor=white)

## Overview

OQL provides a comprehensive type system for defining database queries that can be validated at compile-time and runtime, then translated to native SQL or NoSQL queries. It enables you to write database queries once and execute them across multiple database engines.

**Key Benefits:**

- Write queries in a type-safe JavaScript/TypeScript object format
- Validate queries at runtime before execution
- Translate to native SQL (PostgreSQL, MariaDB, SQLite) or NoSQL (MongoDB)
- Full TypeScript inference and autocomplete support
- Comprehensive test coverage (98%+ branch coverage)

## Modules

| Module                                     | Description                                         | Documentation                        |
| ------------------------------------------ | --------------------------------------------------- | ------------------------------------ |
| [Types](types/OQL-Types.md)                | Query type definitions and interfaces               | [Docs](types/OQL-Types.md)           |
| [Asserts](asserts/OQL-Asserts.md)          | Runtime query validators                            | [Docs](asserts/OQL-Asserts.md)       |
| [Translator](translator/OQL-Translator.md) | SQL/NoSQL query translators                         | [Docs](translator/OQL-Translator.md) |
| [Errors](errors/OQL-Errors.md)             | Error types (`OqlError`, `DialectUnsupportedError`) | [Docs](errors/OQL-Errors.md)         |

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

### Runtime support

OQL builds and translates query definitions — it never opens a connection
or executes anything itself, so it has no I/O, no filesystem access, and
no runtime-specific globals. It runs unchanged on **Deno**, **Bun**,
**Node.js**, **Cloudflare Workers**, and **browsers**.

Bundling for Workers or the browser needs no special configuration — no
`nodejs_compat` flag, no aliases, no polyfills. Executing the queries OQL
produces is the driver's job, and that is where runtime support varies:
see [@tundralibs/drivers](https://jsr.io/@tundralibs/drivers) for which
engines work where.

## Quick Start

```typescript
import type { Query } from '@tundralibs/oql';
import { assertSelect } from '@tundralibs/oql/asserts';
import { PostgresTranslator } from '@tundralibs/oql/translator';

// Define your table type
type User = {
  id: number;
  email: string;
  username: string;
  age: number;
  createdAt: Date;
};

// Create type-safe query
const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'username', 'age', 'createdAt'],
  projection: {
    '@id': 'userId',
    '@email': 'userEmail',
    '@username': 'userName',
    '@createdAt': 'createdAt',
  },
  where: {
    '@age': { $gte: 18 },
    '@email': { $like: '%@gmail.com' },
  },
  orderBy: { '@createdAt': 'DESC' },
  limit: 10,
};

// Validate query structure at runtime
assertSelect(query); // Throws TypeError if invalid

// Translate to SQL
const translator = new PostgresTranslator();
const { sql, params } = translator.select(query);
// sql: SELECT "id" AS "userId", "email" AS "userEmail",
//      "username" AS "userName", "createdAt" AS "createdAt"
//      FROM "users"
//      WHERE "age" >= :p_0: AND "email" LIKE :p_1:
//      ORDER BY "createdAt" DESC
//      LIMIT 10
// params: { p_0: 18, p_1: '%@gmail.com' }
```

## Query Types

OQL supports all standard database operations:

### DML (Data Manipulation Language)

- **SELECT** - Query data with filtering, joins, aggregates, `DISTINCT`
- **INSERT** - Insert new records
- **UPDATE** - Update existing records
- **DELETE** - Delete records
- **UPSERT** - Insert or update (conflict resolution)
- **COUNT** - Count records with optional filtering and `COUNT(DISTINCT col)`

### DDL (Data Definition Language)

- **CREATE_SCHEMA** - Create database schema
- **DROP_SCHEMA** - Drop database schema
- **CREATE_TABLE** - Create table with columns and constraints
- **DROP_TABLE** - Drop table
- **ALTER_TABLE** - Modify table structure
- **TRUNCATE** - Clear table data
- **CREATE_INDEX** - Create indexes
- **DROP_INDEX** - Drop indexes
- **CREATE_VIEW** - Create views (including materialized)
- **DROP_VIEW** - Drop views
- **ALTER_VIEW** - Modify views
- **REFRESH_MATERIALIZED_VIEW** - Refresh materialized view data

## Features

### Type-Safe Queries

Full TypeScript support with type inference:

```typescript
import type { Query } from '@tundralibs/oql';

type User = { id: number; email: string; age: number };

const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'age'], // Autocomplete available
  projection: {
    '@id': true, // Type-checked against columns
    '@email': true,
  },
  where: {
    '@age': { $gte: 18 }, // Operators type-checked
  },
};
```

### `columns` is the scope, not just a projection list

The `columns` array isn't just "what to project" — it's the **scope of
column identifiers** the query is allowed to reference. Every column
used anywhere in the query (WHERE, joins, aggregates, expressions,
ORDER BY, HAVING, …) must appear in `columns`. The runtime validator
rejects queries that reference an unlisted column.

```typescript
import type { Query } from '@tundralibs/oql';

type User = { id: number; email: string; status: string; createdAt: Date };

const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  // Must list every column used anywhere:
  columns: ['id', 'email', 'status', 'createdAt'],
  projection: { '@id': true, '@email': true },
  where: {
    '@status': 'active', // 'status' must be in columns
    '@createdAt': { $gte: new Date() }, // 'createdAt' must be in columns too
  },
};
```

The rule is deliberate: `columns` doubles as a per-query type-safety
contract, so the typechecker (and runtime assert) can catch typos
without needing the full table schema in scope. Higher-level layers
(like norm) derive this list automatically from the model definition.

### Comprehensive Filter System

```typescript ignore
const filters: QueryFilter<User> = {
  // Direct value equality
  '@status': 'active',

  // Comparison operators
  '@age': { $gte: 18, $lt: 65 },
  '@score': { $between: [0, 100] },

  // String operators
  '@email': { $like: '%@gmail.com' },
  '@username': { $ilike: '%ADMIN%' }, // Case-insensitive
  '@name': { $startsWith: 'John' },
  '@filename': { $endsWith: '.pdf' },

  // Array operators
  '@role': { $in: ['admin', 'moderator'] },
  '@status': { $nin: ['banned', 'deleted'] },

  // Null checks — use $null, not $eq/$ne with null
  '@deletedAt': { $null: true }, // IS NULL
  '@verifiedAt': { $null: false }, // IS NOT NULL

  // Logical operators — $or/$and groups are wrapped in outer parens
  // so precedence with surrounding AND/OR is preserved
  $or: [
    { '@age': { $gte: 18 } },
    { '@verified': true },
  ],
  $and: [
    { '@status': 'active' },
    { '@email': { $startsWith: 'admin' } },
  ],

  // Expression as an operator value
  '@total': {
    $gte: { $$_expression: 'MULTIPLY', args: ['@subtotal', 1.08] },
  },
};
```

**Null inside operator values is rejected.** `$eq: null` / `$ne: null` /
`$in: [null, …]` / `$gt: null` etc. all throw — SQL `= NULL` is always
unknown. Use `$null: true` / `$null: false` instead. The shorthand
`'@col': null` is still accepted and means `IS NULL`.

### Correlated EXISTS Filters

`$exists` / `$nexists` express "at least one / no matching row in
another table" without joining — no row fan-out, usable anywhere a
filter is (SELECT / COUNT / UPDATE / DELETE `where`, nested in
`$and` / `$or`):

```typescript
import type { QueryFilter } from '@tundralibs/oql';

type User = { id: number; status: string };

const filters: QueryFilter<User> = {
  '@status': 'active',
  // Users with at least one paid order…
  $exists: {
    table: 'orders',
    on: { '@userId': '@id' }, // orders.userId = <outer>.id
    where: { '@total': { $gte: 100 } },
  },
  // …and no chargebacks.
  $nexists: {
    table: 'chargebacks',
    on: { '@userId': '@id' },
  },
};
```

Correlation goes through `on` only: keys are **single-segment**
`@column` refs into the subquery table (it runs under a fixed internal
alias), values are outer column refs — or literals when the name does
not resolve in the outer scope. The optional `where` filters the
subquery table locally (literals only); expression objects are
rejected in `on`. Emits native `EXISTS (SELECT 1 …)` on
Postgres/MariaDB/SQLite; **MongoDB throws** `DialectUnsupportedError`
(no correlated-subquery form). See
[Compatibility Matrix](docs/Compatibility.md).

### JOIN Support

Joined-table columns are referenced with the `'@RelAlias.@column'`
form throughout the query — projection, where, having, orderBy, and
join `on` conditions all expect the same shape. Both segments carry
the `@` prefix so the parser can tell a column reference from a
literal string regardless of where the reference appears.

```typescript
import type { Query } from '@tundralibs/oql';

type User = { id: number; username: string };

const query: Query<'SELECT', User, {
  orders: { userId: number; total: number };
  profiles: { userId: number; bio: string };
}> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'username'],
  joins: {
    'orders': {
      type: 'LEFT',
      table: 'orders',
      columns: ['userId', 'total'],
      on: { '@orders.@userId': '@id' },
    },
    'profiles': {
      type: 'INNER',
      table: 'profiles',
      columns: ['userId', 'bio'],
      on: { '@profiles.@userId': '@id' },
    },
  },
  projection: {
    '@id': true,
    '@username': true,
    '@orders.@total': 'orderTotal',
    '@profiles.@bio': 'userBio',
  },
  where: {
    '@orders.@total': { $gte: 100 }, // filters on joined columns also use the same form
  },
};
```

### JSON Column Filtering

JSON / JSONB columns are typed as `Record<string, unknown>` at the
filter level. Whole-value filtering is supported — null checks, exact
matches, and the value-comparison operators (`$eq`, `$ne`, `$in`,
`$nin`, `$null`) — but the string and numeric operator families
(`$like`, `$gt`, etc.) intentionally don't apply.

```typescript ignore
type Doc = { id: number; payload: Record<string, unknown> };

const filters: QueryFilter<Doc> = {
  // null check on the column
  '@payload': null,
  // exact-record match
  '@payload': { kind: 'invoice', total: 99 },
  // operator form
  '@payload': { $null: true },
  '@payload': { $eq: { kind: 'invoice' } },
  '@payload': { $in: [{ kind: 'invoice' }, { kind: 'receipt' }] },
};
```

**Operator vs. literal-record ambiguity.** Because a JSON payload may
itself contain `$`-prefixed keys, `'@payload': { $eq: 1 }` could
_structurally_ mean "match payload column against the record
`{ $eq: 1 }`" or "use the `$eq` operator with value `1`". At runtime
OQL resolves this in favour of the operator interpretation — any
top-level `$`-prefixed key inside a filter value is treated as an
operator. If you genuinely need to exact-match a JSON document that
contains operator-shaped keys, wrap it explicitly in `$eq`:

```typescript ignore
// Means: payload exactly equals { $eq: 1, foo: 'bar' }
'@payload': { $eq: { $eq: 1, foo: 'bar' } }
```

JSON-path operators (matching against `payload.kind`, etc.) are not
currently part of OQL's typed filter surface.

### Deduplication (`DISTINCT`)

`SELECT { distinct: true }` emits `SELECT DISTINCT` over the
projection; `COUNT { distinct: ['col'] }` emits `COUNT(DISTINCT col)`
(exactly one declared column — multi-column DISTINCT counts are not
portable across dialects). `distinct: true` is **rejected** alongside
`aggregates` or a join-alias projection: those trigger an automatic
GROUP BY that already deduplicates. MongoDB throws for both — build an
explicit `$group` pipeline instead.

### Aggregation Functions

```typescript
import { assertQuery, type Query } from '@tundralibs/oql';

type Order = { id: number; userId: number; total: number };

const query: Query<'SELECT', Order> = {
  type: 'SELECT',
  table: 'orders',
  columns: ['id', 'userId', 'total'],
  aggregates: {
    'totalRevenue': { $$_aggregate: 'SUM', column: '@total' },
    'orderCount': { $$_aggregate: 'COUNT', column: '@id' },
    'avgOrder': { $$_aggregate: 'AVG', column: '@total' },
  },
  projection: {
    '@userId': true,
    '@totalRevenue': true,
    '@orderCount': true,
    '@avgOrder': true,
  },
};

// `having` filters on the aggregate alias `@totalRevenue`, which is
// not a column of `Order`. TypeScript can't tie a filter key to a
// sibling `aggregates` entry, so that scoping rule is enforced by
// `assertQuery` at runtime: every `having` key must name a declared
// aggregate, and `having` without `aggregates` is rejected outright.
assertQuery({ ...query, having: { '@totalRevenue': { $gte: 1000 } } });
```

### Expression System

Compute values within queries:

```typescript
import type { Query } from '@tundralibs/oql';

type Product = { name: string; price: number; quantity: number };

const query: Query<'SELECT', Product> = {
  type: 'SELECT',
  table: 'products',
  columns: ['name', 'price', 'quantity'],
  expressions: {
    'totalValue': {
      $$_expression: 'MULTIPLY',
      args: ['@price', '@quantity'],
    },
    'discountedPrice': {
      $$_expression: 'SUBTRACT',
      args: ['@price', { $$_expression: 'MULTIPLY', args: ['@price', 0.1] }],
    },
  },
  projection: {
    '@name': true,
    '@totalValue': 'inventoryValue',
    '@discountedPrice': 'salePrice',
  },
};
```

## Supported Databases

### SQL Databases

- **PostgreSQL** - Full support for all features including JSONB operators
- **MariaDB/MySQL** - Full support with MariaDB-specific optimizations
- **SQLite** - Full support with SQLite-specific syntax

### NoSQL Databases

- **MongoDB** - Translates to MongoDB aggregation pipeline and CRUD operations

**Note:** While OQL aims for cross-database compatibility, some features have dialect-specific behavior. See [Compatibility Matrix](docs/Compatibility.md) for detailed information on feature support, graceful degradation, and dialect-specific differences.

## Security

OQL parameterises every user-supplied value by default, which closes
the SQL-injection path. There are two cases where the contract differs
across dialects and callers need to know up front:

### Column-level crypto is a passthrough on SQLite and MongoDB

`HASH`, `ENCRYPT`, and `DECRYPT` expressions emit the input **unchanged**
on SQLite and MongoDB — neither has a built-in cryptographic primitive
on the database side. The query still runs and the column round-trips
cleanly, but the **stored value is plaintext**.

```typescript
import type { Query } from '@tundralibs/oql';

type User = { id: number; password: string };

// Looks like it hashes on every dialect…
const insert: Query<'INSERT', User> = {
  type: 'INSERT',
  table: 'users',
  columns: ['id', 'password'],
  data: {
    id: 1,
    password: { $$_expression: 'HASH', args: 'plaintext-password' },
  },
};
// Postgres / MariaDB → SHA-256 stored
// SQLite / Mongo    → plaintext stored
```

If you need at-rest hashing or encryption that works on every dialect,
do it **client-side before the call**. Do not rely on `HASH` / `ENCRYPT`
unless you've pinned the dialect to Postgres or MariaDB. See the
"HASH / ENCRYPT / DECRYPT gotcha" section in
[docs/Compatibility.md](docs/Compatibility.md) for the per-dialect
behaviour table.

### View bodies inline literals

`CREATE_VIEW` and `ALTER_VIEW` cannot carry placeholders portably
(SQLite + Postgres reject `:p_1:` inside a stored view body; MariaDB
tolerates them but stores the bound value as a literal anyway). The
translator therefore inlines literals into the view body, escaping
single quotes (`O'Brien` → `'O''Brien'`). Non-finite numbers and
non-serializable values throw rather than being inlined.

Anything user-controlled going into a view definition is therefore not
parameterised. Treat view-body construction like raw SQL: never accept
arbitrary user input as a view filter without your own validation.

## Runtime Validation

All queries can be validated before execution:

```typescript
import type { Query } from '@tundralibs/oql';
import { assertInsert, assertSelect } from '@tundralibs/oql/asserts';

declare const query: Query<'SELECT'>;

try {
  assertSelect(query);
  // Query is valid, safe to execute
} catch (error) {
  // Query validation failed
  console.error((error as Error).message);
}
```

## Examples

### SELECT with Filtering

```typescript
import type { Query } from '@tundralibs/oql';

type User = { id: number; email: string; createdAt: Date };

const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email', 'createdAt'],
  projection: {
    '@id': true,
    '@email': true,
    '@createdAt': 'joined',
  },
  where: {
    $and: [
      { '@email': { $like: '%@company.com' } },
      { '@createdAt': { $gte: new Date('2024-01-01') } },
    ],
  },
  orderBy: { '@createdAt': 'DESC' },
  limit: 100,
};
```

### INSERT with Expressions

```typescript
import type { Query } from '@tundralibs/oql';

type Order = { userId: number; total: number; createdAt: Date };

const query: Query<'INSERT', Order> = {
  type: 'INSERT',
  table: 'orders',
  columns: ['userId', 'total', 'createdAt'],
  data: {
    userId: 123,
    total: 99.99,
    createdAt: { $$_expression: 'NOW' },
  },
};
```

### INSERT / UPDATE: literal payloads vs Expressions

A `data` value is interpreted as an **Expression** when it's a non-Date
object with a top-level `$$_expression` field. Any other object — i.e.
one _without_ that discriminator — is passed through as a **literal
payload** (typical case: JSON / JSONB column values).

```typescript
import type { Query } from '@tundralibs/oql';

type User = {
  id: number;
  profile: Record<string, unknown>;
  createdAt: Date;
};

const query: Query<'INSERT', User> = {
  type: 'INSERT',
  table: 'users',
  columns: ['id', 'profile', 'createdAt'],
  data: {
    id: 1,
    // literal: no $$_expression field, passed through as JSON
    profile: { displayName: 'Alice', bio: 'hi' },
    // Expression: $$_expression discriminator triggers SQL function emission
    createdAt: { $$_expression: 'NOW' },
  },
};
```

The discriminator key is deliberately `$$_expression` (and
`$$_aggregate` for Aggregates) — `$$`-prefixed identifiers are
reserved for OQL's internal markers and won't collide with anything
in a real JSON payload. No escape hatch is needed.

### UPDATE with WHERE Clause

```typescript
import type { Query } from '@tundralibs/oql';

type User = { id: number; email: string; updatedAt: Date };

const query: Query<'UPDATE', User> = {
  type: 'UPDATE',
  table: 'users',
  columns: ['id', 'email', 'updatedAt'],
  data: {
    email: 'newemail@example.com',
    updatedAt: { $$_expression: 'NOW' },
  },
  where: { '@id': 123 },
};
```

### UPSERT with Conflict Resolution

```typescript
import type { Query } from '@tundralibs/oql';

type User = { id: number; email: string; username: string };

const query: Query<'UPSERT', User> = {
  type: 'UPSERT',
  table: 'users',
  columns: ['id', 'email', 'username'],
  data: {
    id: 123,
    email: 'user@example.com',
    username: 'john_doe',
  },
  conflictKeys: ['@id'],
  updateOnConflict: ['@email', '@username'],
};
```

## Documentation

- [Type System](types/OQL-Types.md) - Complete type definitions
- [Validators](asserts/OQL-Asserts.md) - Runtime validation
- [Translators](translator/OQL-Translator.md) - SQL/NoSQL translation
- [Errors](errors/OQL-Errors.md) - Error classes and stable error codes
- [Compatibility](docs/Compatibility.md) - Database compatibility matrix

## Performance

- **Zero runtime overhead** for TypeScript types (compile-time only)
- **Minimal validation cost** - validators are optimized for speed
- **Efficient translation** - translators use parameter binding for security and performance
- **98%+ test coverage** - thoroughly tested for reliability

## License

MIT
