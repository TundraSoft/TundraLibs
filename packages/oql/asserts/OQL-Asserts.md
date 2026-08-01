# OQL Asserts

Runtime validators for OQL queries.

![Deno](https://img.shields.io/badge/Deno-000000?logo=deno)
![Bun](https://img.shields.io/badge/Bun-f9f1e1?logo=bun)
![Node.js](https://img.shields.io/badge/Node.js-339933?logo=node.js&logoColor=white)

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Validator Pattern](#validator-pattern)
- [Top-Level Query Validator](#top-level-query-validator)
- [DML Validators](#dml-validators)
- [DDL Validators](#ddl-validators)
- [Filter Validators](#filter-validators)
- [Aggregate Validators](#aggregate-validators)
- [Expression Validators](#expression-validators)
- [Column Identifier Validators](#column-identifier-validators)
- [Query Common Validators](#query-common-validators)
- [Usage Examples](#usage-examples)

## Overview

The asserts module provides runtime validation for OQL queries. All validators follow the Guardian pattern with two variants:

- **Assert functions** - Throw `TypeError` on validation failure
- **Type guard functions** - Return `boolean` without throwing

This ensures queries are structurally valid before translation and execution.

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

## Validator Pattern

Each query type has both assert and type guard variants:

```typescript
import { assertSelect, isSelect } from '@tundralibs/oql/asserts';

const query = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'email'],
  projection: { '@id': true, '@email': true },
};

// Assert variant - throws on failure
try {
  assertSelect(query);
  console.log('Query is valid');
} catch (error) {
  console.error('Validation failed:', error.message);
}

// Type guard variant - returns boolean
if (isSelect(query)) {
  console.log('Query is valid');
  // TypeScript now knows query is SelectQuery
} else {
  console.log('Query is invalid');
}
```

## Top-Level Query Validator

### Any Query

```typescript
import { assertQuery, isQuery } from '@tundralibs/oql/asserts';

assertQuery(query); // Throws TypeError if invalid
const valid = isQuery(query); // Returns boolean
```

`assertQuery` / `isQuery` are the top-level type-dispatching validators. They validate the top-level shape (a non-null object with a string `type`) and then delegate to the matching specific validator based on the `type` discriminator.

**Validates:**

- Value is an object (else `Invalid Query: Expected object, got ...`)
- `type` is a string (else `Invalid Query: Expected 'type' property to be a string`)
- Dispatches by `type` to the appropriate validator:
  - DML: `SELECT`, `INSERT`, `INSERT_FROM_QUERY`, `UPDATE`, `DELETE`, `UPSERT`, `COUNT`
  - DDL — Table: `CREATE_TABLE`, `ALTER_TABLE`, `DROP_TABLE`, `TRUNCATE`
  - DDL — Schema: `CREATE_SCHEMA`, `DROP_SCHEMA`
  - DDL — Index: `CREATE_INDEX`, `DROP_INDEX`
  - DDL — View: `CREATE_VIEW`, `ALTER_VIEW`, `DROP_VIEW`, `REFRESH_MATERIALIZED_VIEW`
- An unrecognized `type` throws `Invalid Query: Unknown query type '<type>'`

## DML Validators

### SELECT Query

```typescript
import { assertSelect, isSelect } from '@tundralibs/oql/asserts';

assertSelect(query); // Throws TypeError if invalid
const valid = isSelect(query); // Returns boolean
```

**Validates:**

- Query type is `'SELECT'`.
- Table name is a non-empty string.
- `columns` is a non-empty array; **every column referenced anywhere in the query** (WHERE, joins, aggregates, expressions, orderBy, …) must be listed here.
- `projection` maps `@`-prefixed column identifiers (or `@expressionKey` / `@aggregateKey` / `@JoinAlias.@col`) to alias strings or `true` for passthrough. **Alias values must not start with `@`** — the alias is the output column name, not a column reference.
- WHERE uses valid filter operators; aggregates are rejected (use HAVING).
- WHERE may reference pre-declared `expressions` by their `@key`; the translator substitutes the expression body.
- JOIN conditions reference declared join columns.
- Aggregates have valid `$$_aggregate` discriminators and column refs.
- ORDER BY keys must exist in projection or be joined columns.
- `limit`, if provided, must be a **positive integer** (`>= 1`; `0` is rejected).
- `offset`, if provided, must be a **non-negative integer** (`>= 0`).
- `distinct`, if provided, must be a boolean. `distinct: true` is rejected when combined with `aggregates` or a join-alias projection (`JSON_ROW` auto-expand) — the automatic GROUP BY those trigger already deduplicates rows.

### INSERT Query

```typescript
import { assertInsert, isInsert } from '@tundralibs/oql/asserts';

assertInsert(query);
const valid = isInsert(query);
```

**Validates:**

- Query type is 'INSERT'
- Table and columns are specified
- Data keys are in the column list
- Data values are: `null`/`undefined`, a primitive (string/number/boolean/bigint), a `Date`, a valid `Expression` (object with a `$$_expression` discriminator), or a literal object payload (object without a `$$_expression` field — typical for JSON / JSONB columns)
- Expressions (values with a `$$_expression` field) reject `@col` references on INSERT

### UPDATE Query

```typescript
import { assertUpdate, isUpdate } from '@tundralibs/oql/asserts';

assertUpdate(query);
const valid = isUpdate(query);
```

**Validates:**

- Query type is 'UPDATE'
- Table and columns are specified
- Data keys are in the column list
- Data values follow the INSERT rules above (same literal-vs-Expression disambiguation); column references inside Expressions are permitted (UPDATE can reference the row being modified)
- WHERE clause is valid

### DELETE Query

```typescript
import { assertDelete, isDelete } from '@tundralibs/oql/asserts';

assertDelete(query);
const valid = isDelete(query);
```

**Validates:**

- Query type is 'DELETE'
- Table is specified
- `columns` is a non-empty array — this is the table's column list used to resolve `@col` references inside the optional `where` filter (and any pre-declared `expressions`), **not** a projection (DELETE returns no rows). A missing or empty array throws `Invalid DELETE query: 'columns' must be a non-empty array`.
- Optional `expressions` are well-formed
- WHERE clause is valid (syntactically optional — DELETE without WHERE removes every row)

### UPSERT Query

```typescript
import { assertUpsert, isUpsert } from '@tundralibs/oql/asserts';

assertUpsert(query);
const valid = isUpsert(query);
```

**Validates:**

- Query type is 'UPSERT'
- Table and columns are specified
- Data matches column list
- Conflict keys are valid column identifiers
- updateOnConflict columns are valid

### COUNT Query

```typescript
import { assertCount, isCount } from '@tundralibs/oql/asserts';

assertCount(query);
const valid = isCount(query);
```

**Validates:**

- Query type is 'COUNT'
- Table is specified
- `columns` is a non-empty array — this is the table's column list used to resolve `@col` references inside the optional `where` filter and `joins`, **not** a projection (COUNT returns just a number). A missing or empty array throws `Invalid COUNT query: 'columns' must be a non-empty array`.
- Optional `distinct` is an array of **exactly one** plain column name (no `@` prefix) that must appear in `columns` — emitted as `COUNT(DISTINCT col)`; multi-column DISTINCT counts are rejected as dialect-fragile.
- Optional `expressions` are well-formed; optional `joins` extend the filter scope with `@<Alias>.@<col>` references
- WHERE clause is valid
- A `having` clause is **rejected** — a COUNT has no GROUP BY and no aggregate alias to filter on. Throws `Invalid COUNT query: 'having' is not supported`. Use a `SELECT` with `aggregates` + `having` instead.

## DDL Validators

### CREATE TABLE

```typescript
import { assertCreateTable, isCreateTable } from '@tundralibs/oql/asserts';

assertCreateTable(query);
const valid = isCreateTable(query);
```

**Validates:**

- Table name and columns
- Column definitions with types
- Primary key constraints
- Foreign key constraints
- Unique constraints

### ALTER TABLE

```typescript
import { assertAlterTable, isAlterTable } from '@tundralibs/oql/asserts';

assertAlterTable(query);
const valid = isAlterTable(query);
```

**Validates:**

- `type` is `'ALTER_TABLE'`; `table` (and optional `schema`) are valid identifiers
- At least one modification operation (`addColumns`, `alterColumns`, `dropColumns`, `renameColumns`, `addForeignKeys`, `dropForeignKeys`, `renameTo`) is present — an empty ALTER throws
- `addColumns` / `alterColumns`, if present, are **non-empty** column-definition maps (each key a valid column identifier, each value a valid `ColumnDefinition`)
- **`alterColumns` entries MUST set `nullable` explicitly (a boolean).** The definition _replaces_ the column, and the dialects disagree on the default for an omitted `nullable`: MariaDB's `MODIFY COLUMN` resets omitted attributes (silently clearing `NOT NULL`) while Postgres preserves them — so a missing `nullable` would mean opposite outcomes per dialect. A missing or non-boolean `nullable` throws `Invalid ALTER_TABLE query: alterColumns.<col> must set nullable explicitly (boolean) — dialects disagree on the default.`
- `dropColumns` / `dropForeignKeys`, if present, are **non-empty** arrays of plain (non-`@`-prefixed) identifier strings
- `renameColumns`, if present, is a **non-empty** map of `oldName → newName`, both valid column identifiers
- `addForeignKeys`, if present, is a **non-empty** object of valid FK constraints — an empty object throws `Invalid ALTER_TABLE query: addForeignKeys cannot be empty`. The FK columns are **not** checked against a column list (they may be added in the same statement, so existence is enforced at execution)
- Optional `renameTo` is a valid table-name identifier
- No unexpected properties

### CREATE INDEX

```typescript
import { assertCreateIndex, isCreateIndex } from '@tundralibs/oql/asserts';

assertCreateIndex(query);
const valid = isCreateIndex(query);
```

**Validates:**

- Index name and table
- Column list with @ prefixes
- Index method (BTREE, HASH, etc.)
- Unique/partial index options

### CREATE VIEW

```typescript
import { assertCreateView, isCreateView } from '@tundralibs/oql/asserts';

assertCreateView(query);
const valid = isCreateView(query);
```

**Validates:**

- View name
- Source SELECT query
- Materialized view options

### ALTER VIEW

```typescript
import { assertAlterView, isAlterView } from '@tundralibs/oql/asserts';

assertAlterView(query);
const valid = isAlterView(query);
```

**Validates:**

- `type` is `'ALTER_VIEW'`
- `view` is a valid identifier; optional `schema` is a valid identifier
- Optional `renameTo` is a valid view-name identifier
- Optional `query` is a valid SELECT query
- At least one of `renameTo` or `query` must be present (an empty ALTER is meaningless)
- No unexpected properties

### DROP VIEW

```typescript
import { assertDropView, isDropView } from '@tundralibs/oql/asserts';

assertDropView(query);
const valid = isDropView(query);
```

**Validates:**

- `type` is `'DROP_VIEW'`
- `view` is a valid identifier; optional `schema` is a valid identifier
- Optional `materialized` / `ifExists` / `cascade` are booleans
  (`materialized: true` marks the target as a materialized view —
  Postgres needs `DROP MATERIALIZED VIEW`; emulating dialects ignore it)
- No unexpected properties

### REFRESH MATERIALIZED VIEW

```typescript
import {
  assertRefreshMaterializedView,
  isRefreshMaterializedView,
} from '@tundralibs/oql/asserts';

assertRefreshMaterializedView(query);
const valid = isRefreshMaterializedView(query);
```

**Validates:**

- `type` is `'REFRESH_MATERIALIZED_VIEW'`
- `view` is a valid identifier; optional `schema` is a valid identifier
- Optional `concurrently` is a boolean

### DROP TABLE

```typescript
import { assertDropTable, isDropTable } from '@tundralibs/oql/asserts';

assertDropTable(query);
const valid = isDropTable(query);
```

**Validates:**

- `type` is `'DROP_TABLE'`
- `table` is a valid identifier; optional `schema` is a valid identifier
- Optional `ifExists` / `cascade` are booleans
- No unexpected properties

### TRUNCATE

```typescript
import { assertTruncate, isTruncate } from '@tundralibs/oql/asserts';

assertTruncate(query);
const valid = isTruncate(query);
```

**Validates:**

- `type` is `'TRUNCATE'`
- `table` is a valid identifier; optional `schema` is a valid identifier
- Optional `cascade` is a boolean
- No unexpected properties

### CREATE SCHEMA

```typescript
import { assertCreateSchema, isCreateSchema } from '@tundralibs/oql/asserts';

assertCreateSchema(query);
const valid = isCreateSchema(query);
```

**Validates:**

- `type` is `'CREATE_SCHEMA'`
- `schema` is required and a valid identifier
- No other properties are allowed

### DROP SCHEMA

```typescript
import { assertDropSchema, isDropSchema } from '@tundralibs/oql/asserts';

assertDropSchema(query);
const valid = isDropSchema(query);
```

**Validates:**

- `type` is `'DROP_SCHEMA'`
- `schema` is required and a valid identifier
- Optional `cascade` is a boolean

### DROP INDEX

```typescript
import { assertDropIndex, isDropIndex } from '@tundralibs/oql/asserts';

assertDropIndex(query);
const valid = isDropIndex(query);
```

**Validates:**

- `type` is `'DROP_INDEX'`
- `index` is required and a valid identifier; optional `schema` is a valid identifier
- Optional `ifExists` / `cascade` are booleans

## Filter Validators

### Query Filter

```typescript
import { assertQueryFilter, isQueryFilter } from '@tundralibs/oql/asserts';

const filter = {
  '@age': { $gte: 18 },
  '@email': { $like: '%@company.com' },
};

assertQueryFilter(filter, ['age', 'email']);
const valid = isQueryFilter(filter, ['age', 'email']);
```

Signature: `assertQueryFilter(x, columnList?, depth?, maxDepth?)` / `isQueryFilter(x, columnList?, depth?, maxDepth?)`. `depth` defaults to `0` and `maxDepth` to `10`; both are internal recursion controls.

**Validates:**

- Column identifiers start with @
- Operator types are valid
- Logical operators (`$and`, `$or`) — each must be a non-empty array of nested QueryFilters
- `$exists` / `$nexists` values are valid ExistsFilter specs (validated via `assertExistsFilter`, counting against the same depth budget)
- Column references exist in provided list
- Nesting beyond `maxDepth` (default 10) throws to guard against runaway recursion

### Exists Filter

```typescript
import { assertExistsFilter, isExistsFilter } from '@tundralibs/oql/asserts';

assertExistsFilter({
  table: 'orders',
  on: { '@userId': '@id' },
  where: { '@status': 'paid' },
});
```

Signature: `assertExistsFilter(x, depth?, maxDepth?)` / `isExistsFilter(x, depth?, maxDepth?)`. Validates the `$exists` / `$nexists` payload of a QueryFilter.

**Validates:**

- `table` is a non-empty string; optional `schema` is a non-empty string
- `on` is a non-empty object; keys are **single-segment** `@column` identifiers into the subquery table (no alias prefix — the internal `__exists__` alias is implicit)
- `on` values are `null`, primitives, `Date`s, or `@`-ref strings — **expression objects are rejected** (their embedded column refs cannot be qualified reliably inside the subquery)
- Optional `where` is a structurally valid QueryFilter (validated without a column list — the subquery table's columns are not declared); its nesting counts against the shared `maxDepth` budget

### Filter Operator

```typescript
import {
  assertFilterOperator,
  isFilterOperator,
} from '@tundralibs/oql/asserts';

assertFilterOperator({ '@price': { $gt: 100 } }, ['price']);
const valid = isFilterOperator({ '@age': 25 }, ['age']);
```

Signature: `assertFilterOperator(x, columnList?)` / `isFilterOperator(x, columnList?)`. This is the column-to-operators map without the logical-operator (`$and` / `$or`) layer that `QueryFilter` adds.

**Validates:**

- Value is a non-empty object (not an array)
- Each key is a valid column identifier (and, if `columnList` is provided, exists in it)
- Each value is valid Operators (a direct value, an array, or an operator object). An invalid value throws `Invalid FilterOperator: Value for '<key>' must be valid Operators (direct value, array, or operator object)`

### Operators

```typescript
import { assertOperators, isOperators } from '@tundralibs/oql/asserts';

const operators = { $gte: 18, $lt: 65 };

assertOperators(operators, 'number');
const valid = isOperators(operators);
```

**Validates:**

- Operator keys are valid (`$eq`, `$ne`, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$nin`, `$between`, `$null`, `$like`, `$nlike`, `$ilike`, `$nilike`, `$startsWith`, `$endsWith`, `$contains`).
- Operator values match expected types per slot.
- Array operators (`$in`, `$nin`, `$between`) require non-empty arrays.
- `$between` requires exactly two elements.
- **`null` is rejected** in operator-form values: `$eq: null`, `$ne: null`, `$in: [null, …]`, `$nin: [null, …]`, and comparison-op values like `$gt: null` all throw. Use `$null: true` / `$null: false` for null comparisons.
- **Expressions accepted** in comparison/string operator values: any non-Date object with a `$$_expression` discriminator passes (`$eq: { $$_expression: 'MULTIPLY', args: [...] }`).
- `$like`/`$nlike`/etc. only valid on string-typed columns.
- `$gt`/`$gte`/`$lt`/`$lte`/`$between` only valid on numeric/bigint/date columns.

### Join Details

```typescript
import { assertJoinDetails, isJoinDetails } from '@tundralibs/oql/asserts';

// `table` and `columns` are REQUIRED. The missing-`table` check fires
// first, so an object with only `type`/`on` throws
// "Invalid JoinDetails: Missing required 'table' property".
const join = {
  table: 'Profile',
  columns: ['userId'],
  type: 'LEFT',
  on: { '@Profile.@userId': '@User.@id' },
};

assertJoinDetails(join, ['User.id', 'Profile.userId']);
const valid = isJoinDetails(join, ['User.id', 'Profile.userId']);
```

Signature: `assertJoinDetails(x, columnList?)` / `isJoinDetails(x, columnList?)`.

**Validates:**

- `table` is required and must be a string or symbol
- `columns` is required and must be a non-empty array of plain (non-`@`-prefixed) names — the columns the joined table exposes
- Optional `schema` is a string if present
- `on` (the JoinFilter / ON clause) is required and references valid columns
- Optional `type` is one of `INNER`, `LEFT`, `RIGHT`, `FULL`

### Join Filter

```typescript
import { assertJoinFilter, isJoinFilter } from '@tundralibs/oql/asserts';

// Column-to-column join (ON clause)
assertJoinFilter(
  { '@Profile.@userId': '@User.@id' },
  ['User.id', 'Profile.userId'],
);
const valid = isJoinFilter(
  { '@Profile.@isActive': true },
  ['Profile.isActive'],
);
```

Signature: `assertJoinFilter(x, columnList?)` / `isJoinFilter(x, columnList?)`. JoinFilter is the ON clause of a join.

**Validates:**

- Value is a non-empty object (not an array)
- Each key is a valid column identifier (and, if `columnList` is provided, exists in it)
- Each value is `null` (NULL check), a primitive (string / number / boolean / bigint), a `Date`, a column reference, or an expression

### Joins

```typescript
import { assertJoins, isJoins } from '@tundralibs/oql/asserts';

assertJoins(
  {
    Profile: {
      table: 'Profile',
      columns: ['userId'],
      on: { '@Profile.@userId': '@User.@id' },
    },
  },
  ['User.id', 'Profile.userId'],
);
const valid = isJoins(value, ['User.id', 'Profile.userId']);
```

Signature: `assertJoins(x, columnList?)` / `isJoins(x, columnList?)`. Joins is a record mapping each join alias to its JoinDetails.

**Validates:**

- Value is a non-empty object (not an array)
- Each entry's value is a valid JoinDetails (see [Join Details](#join-details))

## Aggregate Validators

### Any Aggregate

```typescript
import { assertAggregates, isAggregates } from '@tundralibs/oql/asserts';

assertAggregates({ $$_aggregate: 'SUM', column: '@amount' }, ['amount']);
const valid = isAggregates({ $$_aggregate: 'COUNT' });
```

`assertAggregates` / `isAggregates` are the public aliases of `assertAggregate` / `isAggregate`. They dispatch by the `$$_aggregate` discriminator (`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `STRING_AGG`, `ARRAY_AGG`, `JSON_ROW`) to the matching per-type validator. All aggregate validators share the signature `(x, columnList?)`.

**Validates:**

- Value is a non-null object with a string `$$_aggregate` discriminator that is one of the recognized aggregate names
- Delegates the rest of the shape to the per-type validator

### Per-Type Aggregate Validators

```typescript
import {
  assertArrayAggAggregate,
  assertAvgAggregate,
  assertCountAggregate,
  assertJsonRowAggregate,
  assertMaxAggregate,
  assertMinAggregate,
  assertStringAggAggregate,
  assertSumAggregate,
  isArrayAggAggregate,
  isAvgAggregate,
  isCountAggregate,
  isJsonRowAggregate,
  isMaxAggregate,
  isMinAggregate,
  isStringAggAggregate,
  isSumAggregate,
} from '@tundralibs/oql/asserts';
```

Each pair has the signature `(x, columnList?)`.

- **`assertCountAggregate` / `isCountAggregate`** — `column` is optional. Without it the aggregate is `COUNT(*)` and `distinct` must be absent; with it, optional `distinct: true` makes `COUNT(DISTINCT column)`.
- **`assertSumAggregate` / `isSumAggregate`**, **`assertAvgAggregate` / `isAvgAggregate`**, **`assertMinAggregate` / `isMinAggregate`**, **`assertMaxAggregate` / `isMaxAggregate`** — require a `column` (column identifier or a nested **numeric** expression); optional boolean `distinct`.
- **`assertStringAggAggregate` / `isStringAggAggregate`** — requires a `column`; optional `separator` must be a string; optional boolean `distinct`.
- **`assertArrayAggAggregate` / `isArrayAggAggregate`** — requires a `column`; optional boolean `distinct`.
- **`assertJsonRowAggregate` / `isJsonRowAggregate`** — requires a `columns: Record<string, ColumnOrExpression>` map (each key becomes a JSON property); `distinct` is not supported.

## Expression Validators

### Any Expression

```typescript
import { assertExpressions, isExpressions } from '@tundralibs/oql/asserts';

assertExpressions(
  { $$_expression: 'MULTIPLY', args: ['@price', '@quantity'] },
  ['price', 'quantity'],
);
const valid = isExpressions({ $$_expression: 'NOW' });
```

`assertExpressions` / `isExpressions` are the public aliases of `assertExpression` / `isExpression`. They dispatch to the matching category validator (numeric, string, or date) based on the `$$_expression` discriminator.

Signature: `assertExpressions(x, columnList?, depth?, maxDepth?)` / `isExpressions(x, columnList?, depth?, maxDepth?)`. `depth` defaults to `0` and `maxDepth` to `10` (internal recursion controls).

**Validates:**

- Value is a valid base expression with a recognized `$$_expression` type
- Delegates the category-specific shape (numeric / string / date) to the matching validator
- An unrecognized type throws `Invalid Expression type: Unknown expression type '<type>'`
- Nesting beyond `maxDepth` throws to guard against runaway recursion

## Column Identifier Validators

### Column Identifier

```typescript
import {
  assertColumnIdentifier,
  isColumnIdentifier,
} from '@tundralibs/oql/asserts';

assertColumnIdentifier('@id', ['id', 'name', 'email']);
assertColumnIdentifier('@user.@id', ['user.id']); // nested / joined column
const valid = isColumnIdentifier('@userName');
```

Signature: `assertColumnIdentifier(x, columnList?)` / `isColumnIdentifier(x, columnList?)`.

**Validates:**

- Value is a string
- Each `.`-separated segment starts with `@` and, after the `@`, is a valid identifier (alphanumeric/underscore, starting with a letter or underscore)
- If `columnList` is provided, the column (with `@` prefixes stripped) must exist in it. Note: an **empty** `columnList` (`[]`) rejects every reference

## Query Common Validators

These shared property validators are used internally by both DML and DDL asserts and are also exported. They take a `context` label (and, for `assertQueryType`, an `expectedType`) that is interpolated into the error messages. They have **no `is*` variants**.

```typescript
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '@tundralibs/oql/asserts';
```

- **`assertTableName(query, context): void`** — asserts `query.table` exists and is a non-empty string.
- **`assertSchemaName(query, context): void`** — asserts `query.schema`, if present, is a non-empty string (absent is allowed).
- **`assertColumns(query, context): string[]`** — asserts `query.columns` is a non-empty array of plain (non-`@`-prefixed) strings and **returns** the validated array.
- **`assertQueryType(query, expectedType, context): void`** — asserts `query.type` strictly equals `expectedType`.

## Usage Examples

### Validating Before Translation

```typescript
import type { Query } from '@tundralibs/oql';
import { assertSelect } from '@tundralibs/oql/asserts';
import { PostgresTranslator } from '@tundralibs/oql/translator';

function executeQuery(query: Query<'SELECT', any>) {
  // Validate structure
  assertSelect(query);

  // Safe to translate
  const translator = new PostgresTranslator();
  const { sql, params } = translator.select(query);

  // Execute with driver
  return database.query(sql, params);
}
```

### Type Guard for Runtime Type Checking

```typescript
import { isInsert, isSelect } from '@tundralibs/oql/asserts';

function handleQuery(query: unknown) {
  if (isSelect(query)) {
    // TypeScript knows query is SelectQuery
    console.log('Processing SELECT from', query.table);
  } else if (isInsert(query)) {
    // TypeScript knows query is InsertQuery
    console.log('Processing INSERT into', query.table);
  } else {
    console.error('Unknown query type');
  }
}
```

### Validation with Error Handling

```typescript
import { assertSelect } from '@tundralibs/oql/asserts';

function validateAndExecute(query: unknown) {
  try {
    assertSelect(query);
    // Query is valid, proceed
    return executeQuery(query);
  } catch (error) {
    if (error instanceof TypeError) {
      // Validation error
      console.error('Query validation failed:', error.message);
      return { error: error.message };
    }
    throw error;
  }
}
```

### Validating Complex Queries

```typescript
import { assertSelect } from '@tundralibs/oql/asserts';

const complexQuery = {
  type: 'SELECT',
  table: 'orders',
  columns: ['userId', 'total', 'createdAt'],
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
  },
  projection: {
    '@userId': 'customerId',
    '@users.@email': 'customerEmail',
    '@totalRevenue': true,
  },
  having: {
    '@totalRevenue': { $gte: 1000 },
  },
};

// Validates entire query structure including:
// - Table and columns
// - Join conditions
// - Aggregate definitions
// - Projection mapping
// - HAVING clause filters
assertSelect(complexQuery);
```

## Error Messages

Validators provide detailed error messages:

```typescript
// Missing required field
assertSelect({ type: 'SELECT' });
// TypeError: Invalid SELECT query: 'table' is required

// Invalid column reference
assertSelect({
  type: 'SELECT',
  table: 'users',
  columns: ['id'],
  projection: { '@email': true }, // email not in columns
});
// TypeError: Invalid SELECT query: projection key '@email' does not exist in
// columns, expressions, aggregates, or joined columns. Available: @id

// Invalid operator
assertQueryFilter({ '@age': { $invalid: 18 } }, ['age']);
// TypeError: Invalid QueryFilter: Filter properties are invalid - Invalid
// FilterOperator: Value for '@age' must be valid Operators (direct value,
// array, or operator object)
```

## Performance

- **Optimized for speed** - Validators use early returns and minimal allocations
- **Type narrowing** - Type guard functions provide TypeScript type narrowing
- **No dependencies** - Pure TypeScript with no external dependencies
- **98%+ test coverage** - Thoroughly tested for reliability

## Related Documentation

- [Type System](../types/OQL-Types.md) - Query type definitions
- [Translators](../translator/OQL-Translator.md) - SQL/NoSQL translation

---

[← Back to OQL](../README.md)
