# OQL Types

Type definitions for Object Query Language queries.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Core Types](#core-types)
- [Query Types](#query-types)
- [Filter Types](#filter-types)
- [Expression Types](#expression-types)
- [Aggregate Types](#aggregate-types)
- [Usage Examples](#usage-examples)

## Overview

The OQL type system provides comprehensive TypeScript types for defining database queries. All types are fully generic and support custom table schemas with complete type inference.

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

## Core Types

### Query<QT, PT, LT>

`Query` is the single exported query type. There are **no** separate
`SelectQuery` / `InsertQuery` / `UpdateQuery` / `UpsertQuery` symbols —
each operation is a conditional branch of `Query`, discriminated on the
`QT` (query-type) parameter.

```typescript
export type Query<
  QT extends QueryTypes = QueryTypes,
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>;
```

- `QT` — the query type (`'SELECT'`, `'INSERT'`, …; see `QueryTypes`).
- `PT` — the primary table schema (column name → type).
- `LT` — the linked/joined tables schema (table name → its schema).
  Defaults to a permissive `Record<string, TableType>`; pass it
  explicitly to get precise joined-column typing, e.g.
  `Query<'SELECT', Order, { users: { id: number; email: string } }>`.

```typescript
import type { Query } from '@tundralibs/oql';

type User = {
  id: number;
  email: string;
  username: string;
};

const selectQuery: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email'],
  projection: { '@id': true, '@email': true },
};
```

### QueryTypes

Union type of all supported query types:

```typescript
type QueryTypes =
  | 'SELECT'
  | 'INSERT'
  | 'UPDATE'
  | 'DELETE'
  | 'UPSERT'
  | 'COUNT'
  | 'INSERT_FROM_QUERY'
  | 'CREATE_SCHEMA'
  | 'DROP_SCHEMA'
  | 'CREATE_TABLE'
  | 'DROP_TABLE'
  | 'ALTER_TABLE'
  | 'TRUNCATE'
  | 'CREATE_INDEX'
  | 'DROP_INDEX'
  | 'CREATE_VIEW'
  | 'DROP_VIEW'
  | 'ALTER_VIEW'
  | 'REFRESH_MATERIALIZED_VIEW';
```

### ColumnIdentifier

Type for referencing columns using `@` prefix:

```typescript
type ColumnIdentifier = `@${string}`;
```

The type itself is just `` `@${string}` `` — TypeScript template
literals can't fully model the qualified form, so the structure of the
qualified reference is enforced by the runtime validator. Two formats
are supported:

- `@columnName` — direct column reference.
- `@tableName.@columnName` — qualified reference. **Each segment is
  individually `@`-prefixed** — there is a second `@` on the column
  part.

```typescript
// Examples:
const col1: ColumnIdentifier = '@id'; // OK
const col2: ColumnIdentifier = '@users.@email'; // OK (note the second @)
const col3: ColumnIdentifier = '@orders.@total'; // OK
// const bad: ColumnIdentifier = '@users.email';  // ❌ missing '@' on column
```

## Query Types

There is no standalone `SelectQuery` / `InsertQuery` / `UpdateQuery` /
`UpsertQuery` type. The shapes below are **branches of `Query<QT, PT,
LT>`**, selected by the `type` discriminant. They share a common DML
preamble (`table`, optional `schema`, and `columns: Array<keyof PT>`).

### SELECT branch — `Query<'SELECT', PT, LT>`

```typescript
{
  type: 'SELECT';
  table: string;
  schema?: string;
  columns: Array<keyof PT>;
  // Optional SELECT DISTINCT. Rejected (validator throws) when combined
  // with `aggregates` or a join-alias projection (JSON_ROW auto-expand)
  // — the automatic GROUP BY those trigger already deduplicates.
  distinct?: boolean;
  // REQUIRED. Keys are @-prefixed identifiers (columns / expressions /
  // aggregates / joined columns). Values: true or a string alias.
  projection: Record<string, boolean | string>;
  where?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
  joins?: Joins<PT, LT>;
  aggregates?: Record<string, Aggregates<PT & LT>>;
  expressions?: Record<string, Expressions<PT & LT>>;
  having?: QueryFilter<PT & FlattenEntity<LT, '', '@'>>;
  orderBy?: Record<ColumnIdentifier, 'ASC' | 'DESC'>;
  limit?: number;
  offset?: number;
}
```

The `COUNT` branch shares the same preamble plus optional
`expressions` / `joins` / `where`, and adds
`distinct?: [keyof PT]` — a single-element tuple naming ONE declared
column, emitted as `COUNT(DISTINCT col)` (multi-column DISTINCT
counts are not portable across dialects, so exactly one column is
enforced). It has **no `having`**: a COUNT yields a single scalar with
no GROUP BY, so there is no aggregate alias to filter on — the validator
rejects a stray `having`. Use a `SELECT` with `aggregates` + `having`
for post-aggregation filtering.

### INSERT branch — `Query<'INSERT', PT>`

`data` is **required** (not `Partial`). Each value may be a literal OR
an expression returning that column's type. An optional `projection`
(`RETURNING`) lists plain column names.

```typescript
{
  type: 'INSERT';
  table: string;
  schema?: string;
  columns: Array<keyof PT>;
  // Required. Single object or array. Values may be literals or
  // expressions (DataWithExpressions<PT>).
  data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
  // Optional RETURNING — plain column names, no @ prefix.
  projection?: ReadonlyArray<keyof PT & string>;
}
```

### UPDATE branch — `Query<'UPDATE', PT>`

`data` is `PartialDataWithExpressions<PT>` — only the columns to update,
and each value may be a literal OR an expression. There is no
`columns`-keyed `RETURNING`/`projection` on `UPDATE`.

```typescript
{
  type: 'UPDATE';
  table: string;
  schema?: string;
  columns: Array<keyof PT>;
  // Only the columns to update; values may be literals or expressions.
  data: PartialDataWithExpressions<PT>;
  where?: QueryFilter<PT>;
  // Optional expression aliases referenceable as @key in filters.
  expressions?: Record<string, Expressions<PT>>;
}
```

### UPSERT branch — `Query<'UPSERT', PT>`

Like `INSERT`, `data` values may be expressions, and an optional
`projection` (`RETURNING`) is available. `conflictKeys` and
`updateOnConflict` use `@`-prefixed identifiers.

```typescript
{
  type: 'UPSERT';
  table: string;
  schema?: string;
  columns: Array<keyof PT>;
  data: DataWithExpressions<PT> | Array<DataWithExpressions<PT>>;
  conflictKeys: ColumnIdentifier[];
  updateOnConflict?: ColumnIdentifier[];
  // Optional RETURNING — same semantics as INSERT.
  projection?: ReadonlyArray<keyof PT & string>;
}
```

## Filter Types

### QueryFilter<PT, FPT>

Main filter type for WHERE and HAVING clauses. It combines boolean
composition (`$and` / `$or`), correlated subquery predicates
(`$exists` / `$nexists`), and per-column operators
(`FilterOperator`). The per-column operators are keyed by the
**flattened** entity keys (the `@`-prefixed column identifiers). There
is **no `$not`** member.

```typescript
type QueryFilter<
  PT extends TableType = TableType,
  FPT extends FlattenEntity<PT, '', '@'> = FlattenEntity<PT, '', '@'>,
> = {
  $and?: Array<QueryFilter<PT, FPT>>;
  $or?: Array<QueryFilter<PT, FPT>>;
  $exists?: ExistsFilter<PT, FPT>;
  $nexists?: ExistsFilter<PT, FPT>;
} & FilterOperator<PT, FPT>;
```

### ExistsFilter

The `$exists` / `$nexists` payload — a correlated
`EXISTS (SELECT 1 FROM <table> AS __exists__ WHERE …)` /
`NOT EXISTS (…)` subquery predicate (SQL dialects only; the Mongo
translator throws).

```typescript
type ExistsFilter<PT, FPT> = {
  table: string; // subquery table
  schema?: string; // optional subquery table schema
  // Correlation map: subquery column → outer column ref or literal.
  // Keys are single-segment '@column' refs into the subquery table
  // (the internal __exists__ alias is implicit). Values follow the
  // join-value rule: an '@x' string is an outer column reference iff
  // `x` names a column in the outer scope; anything else is a
  // parameterised literal. Expressions are NOT allowed here.
  on: Record<`@${string}`, null | ColumnTypes | (keyof FPT & string)>;
  // Optional filter over the subquery table's own columns. Keys are
  // qualified with the __exists__ alias at translate time; values are
  // always literals/expressions — correlation happens only via `on`.
  where?: QueryFilter;
};
```

```typescript
// Users that have at least one paid order:
where: {
  $exists: {
    table: 'orders',
    on: { '@userId': '@id' },      // orders.userId = users.id
    where: { '@status': 'paid' },  // orders.status = 'paid'
  },
}
```

### Operators

Comparison and value operators. The operator surface is **gated by
the column's TS type** — string-only operators don't apply to numeric
columns, and vice versa:

| Operator                                                                        | Available on               |
| ------------------------------------------------------------------------------- | -------------------------- |
| `$eq`, `$ne`, `$in`, `$nin`, `$null`                                            | every column type          |
| `$gt`, `$gte`, `$lt`, `$lte`, `$between`                                        | `number`, `bigint`, `Date` |
| `$like`, `$nlike`, `$ilike`, `$nilike`, `$startsWith`, `$endsWith`, `$contains` | `string`                   |

Plus three non-object filter forms accepted on every column:

- A direct literal value (`'@status': 'active'`) — implicit `$eq`.
- An array of values (`'@status': ['active', 'pending']`) — implicit `$in`.
- `null` — implicit `$null: true`.

**Null inside operator values is disallowed.** `$eq: null`, `$ne: null`,
`$in: [null, …]`, `$nin: [null, …]` are rejected at both the type and
runtime levels — SQL `= NULL` / `<> NULL` are always unknown. Use
`$null: true` / `$null: false` for null comparisons. The shorthand
`'@col': null` is still accepted (and means `IS NULL`).

**Expression values are accepted inside operator slots.** Any operator
whose type union includes `Expressions<...>` (the comparison ops
`$eq`/`$ne`/`$gt`/`$gte`/`$lt`/`$lte`/`$between`, and the string ops
`$like`/`$nlike`/`$ilike`/`$nilike`) accepts an Expression object
(`{ $$_expression: 'X', args: ... }`) in place of a literal value:

```typescript
where: {
  '@tax': { $eq: { $$_expression: 'MULTIPLY', args: ['@subtotal', 0.085] } },
}
```

**Pre-declared expression aliases work in WHERE.** Expressions
declared in the SELECT/UPDATE/DELETE/COUNT `expressions:` block are
referenceable by their `@key` alias in WHERE filters — the translator
substitutes the alias with the expression's SQL body at emit time.
Same machinery as aggregates in HAVING.

**JSON / open-record columns** (`T extends Record<string, unknown>`)
resolve neither the string nor the numeric branch. Only the
value-comparison operators (`$eq`, `$ne`, `$in`, `$nin`, `$null`) plus
the direct/array literal forms are valid for those columns. Because a
JSON payload may itself contain `$`-prefixed keys, runtime treats any
top-level `$`-prefixed key inside a filter value as an operator; wrap
literal JSON documents containing such keys in `$eq` to exact-match
them.

**Joined-table column refs** (`'@RelAlias.@col'`) participate in the
filter shape on `SELECT` and `COUNT` queries (which carry a linked-
tables type parameter `LT`). `UPDATE`, `DELETE`, `INSERT`,
`INSERT_FROM_QUERY`, and `UPSERT` filters operate strictly on the primary
table's columns — joins are not part of their filter shape.

### JoinDetails

Configuration for a single joined table. `table` and `columns` are
**required**; `type` is **optional** and there is **no `'FULL OUTER'`**
value (the full-join value is `'FULL'`):

```typescript
type JoinDetails<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
  JT extends TableType = TableType,
> = {
  table: keyof LT;
  schema?: string;
  // Required. Must list every column from this joined table that is
  // referenced elsewhere in the query.
  columns: Array<keyof JT>;
  on: JoinFilter<PT, LT>;
  type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
};

type Joins<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
> = {
  [K in keyof LT]?: JoinDetails<PT, LT, LT[K]>;
};
```

## Expression Types

### Expressions<T, FT>

`Expressions` is a **generic discriminated union** of expression
branches, each shaped `{ $$_expression: <op>; args: ... }` (operand-less
branches like `NOW` omit `args`). It is **not** the union
`NumericExpressions | StringExpressions | DateExpressions` — those are
separate string-literal name unions (see below).

```typescript
type Expressions<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> =
  // numeric
  | {
    $$_expression: 'ADD';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'SUBTRACT';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'MULTIPLY';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'DIVIDE';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'MODULO';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'ABS';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'CEIL';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'FLOOR';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'ROUND';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | {
    $$_expression: 'POWER';
    args: {
      base: GetColumnByType<FT, number | bigint> | number | bigint;
      exponent: GetColumnByType<FT, number | bigint> | number | bigint;
    };
  }
  | {
    $$_expression: 'SQRT';
    args: Array<GetColumnByType<FT, number | bigint> | number | bigint>;
  }
  | { $$_expression: 'LENGTH'; args: GetColumnByType<FT, string> | string }
  | {
    $$_expression: 'DATE_DIFF';
    args: {
      from: GetColumnByType<FT, Date> | Date;
      to: GetColumnByType<FT, Date> | Date;
      unit: TimeUnit;
    };
  }
  // date / time
  | {
    $$_expression: 'DATE_ADD';
    args: {
      date: GetColumnByType<FT, Date> | Date;
      amount: GetColumnByType<FT, number> | number;
      unit: TimeUnit;
    };
  }
  | { $$_expression: 'NOW' }
  | { $$_expression: 'CURRENT_DATE' }
  | { $$_expression: 'CURRENT_TIME' }
  | { $$_expression: 'CURRENT_TIMESTAMP' }
  | { $$_expression: 'CURRENT_TIMESTAMPTZ' }
  // utility
  | { $$_expression: 'UUID' }
  // string
  | {
    $$_expression: 'CONCAT';
    args: Array<GetColumnByType<FT, string> | string>;
  }
  | { $$_expression: 'LOWER'; args: GetColumnByType<FT, string> | string }
  | { $$_expression: 'UPPER'; args: GetColumnByType<FT, string> | string }
  | { $$_expression: 'TRIM'; args: GetColumnByType<FT, string> | string }
  | { $$_expression: 'LTRIM'; args: GetColumnByType<FT, string> | string }
  | { $$_expression: 'RTRIM'; args: GetColumnByType<FT, string> | string }
  | {
    $$_expression: 'SUBSTR';
    args: {
      string: GetColumnByType<FT, string> | string;
      start: GetColumnByType<FT, number> | number;
      length?: GetColumnByType<FT, number> | number;
    };
  }
  | {
    $$_expression: 'REPLACE';
    args: {
      string: GetColumnByType<FT, string> | string;
      search: GetColumnByType<FT, string> | string;
      replace: GetColumnByType<FT, string> | string;
    };
  }
  | {
    $$_expression: 'LPAD';
    args: {
      string: GetColumnByType<FT, string> | string;
      length: GetColumnByType<FT, number> | number;
      fill?: GetColumnByType<FT, string> | string;
    };
  }
  | {
    $$_expression: 'RPAD';
    args: {
      string: GetColumnByType<FT, string> | string;
      length: GetColumnByType<FT, number> | number;
      fill?: GetColumnByType<FT, string> | string;
    };
  }
  // cryptographic (platform-dependent)
  | {
    $$_expression: 'ENCRYPT';
    args: {
      secret: keyof FT | string;
      data: keyof FT | string | number | bigint | Date | boolean;
    };
  }
  | {
    $$_expression: 'DECRYPT';
    args: {
      secret: keyof FT | string;
      data: keyof FT | string | number | bigint | Date | boolean;
    };
  }
  | {
    $$_expression: 'HASH';
    args: keyof FT | string | number | bigint | Date | boolean;
  };
```

- `T` — the table schema; `FT` — the flattened table type with `'@'`
  column-reference prefixes. Both default so `Expressions` is usable
  without parameters.
- `COALESCE`, `NULLIF`, and `CAST` are TODOs and currently commented
  out in the source.

### Expression name unions

`NumericExpressions`, `StringExpressions`, and `DateExpressions` are
exported as **string-literal name unions** (the operation names), not
object shapes. They are used to classify the branches of `Expressions`
(e.g. selecting numeric expressions for numeric aggregates).

```typescript
// Expression names that produce a numeric value.
type NumericExpressions =
  | 'ADD'
  | 'SUBTRACT'
  | 'MULTIPLY'
  | 'DIVIDE'
  | 'MODULO'
  | 'ABS'
  | 'CEIL'
  | 'FLOOR'
  | 'ROUND'
  | 'POWER'
  | 'SQRT'
  | 'LENGTH'
  | 'DATE_DIFF';

// Expression names that produce a string value.
type StringExpressions =
  | 'CONCAT'
  | 'LOWER'
  | 'UPPER'
  | 'TRIM'
  | 'LTRIM'
  | 'RTRIM'
  | 'SUBSTR'
  | 'REPLACE'
  | 'LPAD'
  | 'RPAD'
  | 'UUID'
  | 'ENCRYPT'
  | 'DECRYPT'
  | 'HASH';

// Expression names that produce a date/time value.
type DateExpressions =
  | 'NOW'
  | 'CURRENT_DATE'
  | 'CURRENT_TIME'
  | 'CURRENT_TIMESTAMP'
  | 'CURRENT_TIMESTAMPTZ'
  | 'DATE_ADD';
```

> Note: `LENGTH` and `DATE_DIFF` are classified as **numeric** (they
> return numbers). `UUID` is classified under the string-name union.

### Numeric expressions

Mathematical operations returning a number/bigint: `ADD`, `SUBTRACT`,
`MULTIPLY`, `DIVIDE`, `MODULO`, `ABS`, `CEIL`, `FLOOR`, `ROUND`,
`POWER`, `SQRT`, plus `LENGTH` (character count of a string) and
`DATE_DIFF` (whole time units between two dates). `ADD`/`SUBTRACT`/
`MULTIPLY`/`DIVIDE`/`MODULO`/`ABS`/`CEIL`/`FLOOR`/`ROUND`/`SQRT` take an
array of numeric operands; `POWER` takes `{ base, exponent }`.

### String expressions

String operations returning a string: `CONCAT`, `LOWER`, `UPPER`,
`TRIM`, `LTRIM`, `RTRIM`, `SUBSTR`, `REPLACE`, `LPAD`, `RPAD`.

- `SUBSTR` — `args: { string; start; length? }`. `start` is **1-based**
  (SQL-native); both `start` and `length` accept a number **or** a column
  reference. Omit `length` to extract to the end of the string.
- `REPLACE` — `args: { string; search; replace }`; replaces every
  occurrence of `search`.
- `LPAD` / `RPAD` — `args: { string; length; fill? }`; pad on the left /
  right to reach `length`. `fill` defaults to a space.

> `LENGTH` returns a number, so it lives in the **numeric** category
> (above), not under string.

### Cryptographic expressions

Platform-dependent symmetric crypto and hashing. On PostgreSQL/MariaDB
these map to native functions (pgcrypto/AES, `SHA2`); on SQLite/MongoDB
there is no built-in support and values are stored as-is (encrypt/hash
at the application layer if you need it).

- `ENCRYPT` — `args: { secret; data }`; symmetric encryption.
- `DECRYPT` — `args: { secret; data }`; symmetric decryption (only on
  data encrypted by the same database).
- `HASH` — `args: <value>`; cryptographic hashing.

### Date expressions

Date and time operations returning a Date: `NOW`, `CURRENT_DATE`,
`CURRENT_TIME`, `CURRENT_TIMESTAMP`, `CURRENT_TIMESTAMPTZ`, `DATE_ADD`.
(`DATE_DIFF` returns a number and is classified numeric.)

- `DATE_ADD` — `args: { date; amount; unit }`; add `amount` units to
  `date` (negative `amount` subtracts).
- `DATE_DIFF` — `args: { from; to; unit }`; whole time units between
  `from` and `to`.

```typescript
type TimeUnit = 'DAYS' | 'MONTHS' | 'YEARS' | 'HOURS' | 'MINUTES' | 'SECONDS';
```

`TimeUnit` has exactly six values. There is **no `'WEEKS'` or
`'MILLISECONDS'`**.

## Aggregate Types

### AggregateFunction

`AggregateFunction` is a **string-literal union of the aggregate
names** — not an object union:

```typescript
type AggregateFunction =
  | 'COUNT'
  | 'SUM'
  | 'MIN'
  | 'MAX'
  | 'AVG'
  | 'STRING_AGG'
  | 'ARRAY_AGG'
  | 'JSON_ROW';
```

### Aggregates<T, FT>

`Aggregates` is the **generic discriminated union** of aggregate
objects, keyed by `$$_aggregate`. (In a query, aggregates are supplied
as a `Record<string, Aggregates<...>>` — an alias name → aggregate.)

```typescript
type Aggregates<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> =
  // COUNT(*) — count all rows. `column`/`distinct` must be absent.
  | { $$_aggregate: 'COUNT'; column?: never; distinct?: never }
  // COUNT(column) / COUNT(DISTINCT column)
  | {
    $$_aggregate: 'COUNT';
    column: keyof FT | Expressions<T, FT>;
    distinct?: boolean;
  }
  // SUM / MIN / MAX / AVG — numeric/date columns or numeric expressions
  | {
    $$_aggregate: 'SUM' | 'MIN' | 'MAX' | 'AVG';
    column:
      | GetColumnByType<FT, number | bigint | Date>
      | Extract<Expressions<T, FT>, { $$_expression: NumericExpressions }>;
    distinct?: boolean;
  }
  // STRING_AGG — concatenate with a delimiter
  | {
    $$_aggregate: 'STRING_AGG';
    column: keyof FT | Expressions<T, FT>;
    separator?: string;
    distinct?: boolean;
  }
  // ARRAY_AGG — collect into an array
  | {
    $$_aggregate: 'ARRAY_AGG';
    column: keyof FT | Expressions<T, FT>;
    distinct?: boolean;
  }
  // JSON_ROW — aggregate columns into a JSON object with custom keys
  | {
    $$_aggregate: 'JSON_ROW';
    columns: Record<string, keyof FT | Expressions<T, FT>>;
    distinct?: never;
  };
```

- `COUNT(*)` is its own branch where `column` is `never` (must be
  omitted). `COUNT` with a `column` accepts an optional `distinct`.
- `SUM`/`MIN`/`MAX`/`AVG` accept a numeric/Date column or a numeric
  expression.
- `STRING_AGG` carries an optional `separator` (default `','`).
- `JSON_ROW` takes a `columns` **record** (`key → column/expression`),
  not a flat list.

## Usage Examples

### Complex SELECT with Joins and Aggregates

```typescript
import type { Query } from '@tundralibs/oql';

type Order = {
  id: number;
  userId: number;
  total: number;
  createdAt: Date;
};

const query: Query<
  'SELECT',
  Order,
  { users: { id: number; email: string } }
> = {
  type: 'SELECT',
  table: 'orders',
  columns: ['userId', 'total', 'id'],
  joins: {
    users: {
      table: 'users',
      columns: ['id', 'email'],
      type: 'INNER',
      on: { '@users.@id': '@userId' },
    },
  },
  aggregates: {
    'totalRevenue': { $$_aggregate: 'SUM', column: '@total' },
    'orderCount': { $$_aggregate: 'COUNT', column: '@id' },
    'avgOrder': { $$_aggregate: 'AVG', column: '@total' },
  },
  projection: {
    '@userId': 'customerId',
    '@users.@email': 'customerEmail',
    '@totalRevenue': true,
    '@orderCount': true,
    '@avgOrder': true,
  },
  having: {
    '@totalRevenue': { $gte: 1000 },
  },
  orderBy: {
    '@totalRevenue': 'DESC',
  },
  limit: 100,
};
```

### INSERT with Expressions

```typescript
type Product = {
  id: number;
  name: string;
  price: number;
  createdAt: Date;
};

const query: Query<'INSERT', Product> = {
  type: 'INSERT',
  table: 'products',
  columns: ['name', 'price', 'createdAt'],
  data: {
    name: 'Widget',
    price: 19.99,
    createdAt: { $$_expression: 'NOW' },
  },
};
```

### Complex Filters

```typescript
const complexFilter: QueryFilter<User> = {
  $or: [
    {
      $and: [
        { '@age': { $gte: 18, $lt: 65 } },
        { '@status': 'active' },
      ],
    },
    {
      '@role': { $in: ['admin', 'moderator'] },
    },
  ],
  '@email': { $like: '%@company.com' },
  '@deletedAt': { $null: true },
};
```

## Related Documentation

- [Validators](../asserts/OQL-Asserts.md) - Runtime validation functions
- [Translators](../translator/OQL-Translator.md) - SQL/NoSQL translation

---

[← Back to OQL](../README.md)
