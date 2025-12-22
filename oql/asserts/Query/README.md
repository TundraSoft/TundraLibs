# Query Validators

Comprehensive runtime validators for OQL (Object Query Language) query
structures.

## Overview

This module provides type-safe runtime validation for all DML (Data Manipulation
Language) queries in OQL. Each validator ensures that query structures are
correct before they're passed to query builders or executed against databases.

## Structure

```
asserts/Query/
├── mod.ts                    # Main exports
└── DML/                      # Data Manipulation Language validators
    ├── mod.ts                # DML exports
    ├── Select.ts             # SELECT query validator
    ├── Insert.ts             # INSERT query validator
    ├── Update.ts             # UPDATE query validator
    ├── Upsert.ts             # UPSERT query validator
    ├── Delete.ts             # DELETE query validator
    ├── Count.ts              # COUNT query validator
    └── DML.test.ts           # Comprehensive test suite
```

## Validators

### DML Validators

#### `assertSelectQuery<PT, LT>(x: unknown)`

Validates SELECT queries with full support for:

- ✅ Required: `type`, `table`, `columns`, `projection`
- ✅ Optional: `schema`, `aggregates`, `expressions`, `joins`, `where`,
  `orderBy`, `having`, `limit`, `offset`
- ✅ **New Design**: Pre-declared aggregates and expressions with `@` key
  projection
- ✅ Projection keys use `@` prefix, values are `boolean | string` (alias)
- ✅ Automatic GROUP BY when aggregates are present
- ✅ Join validation with required `columns` array
- ✅ Expression references in WHERE clause
- ✅ Aggregate references in HAVING clause

#### `assertInsertQuery<PT>(x: unknown)`

Validates INSERT queries with:

- ✅ Required: `type`, `table`, `columns`, `data`
- ✅ Optional: `schema`
- ✅ Single object or array of objects
- ✅ Expression support in data values
- ✅ Column name validation

#### `assertUpdateQuery<PT>(x: unknown)`

Validates UPDATE queries with:

- ✅ Required: `type`, `table`, `columns`, `data`
- ✅ Optional: `schema`, `expressions`, `where`
- ✅ **New**: Expression definitions for complex WHERE filtering
- ✅ Partial data updates
- ✅ Expression support in data values
- ✅ Expression references in WHERE clause

#### `assertUpsertQuery<PT>(x: unknown)`

Validates UPSERT queries with:

- ✅ Required: `type`, `table`, `columns`, `data`, `conflictKeys`
- ✅ Optional: `schema`, `updateOnConflict`
- ✅ Single or bulk upsert
- ✅ Partial update on conflict
- ✅ Conflict key validation
- ✅ Expression support

#### `assertDeleteQuery<PT>(x: unknown)`

Validates DELETE queries with:

- ✅ Required: `type`, `table`, `columns`
- ✅ Optional: `schema`, `expressions`, `where`
- ✅ **New**: Expression definitions for complex WHERE filtering
- ✅ Expression references in WHERE clause
- ✅ Safety checks (allows DELETE without WHERE but validates structure)

#### `assertCountQuery<PT>(x: unknown)`

Validates COUNT queries with:

- ✅ Required: `type`, `table`, `columns`
- ✅ Optional: `schema`, `expressions`, `joins`, `where`, `having`
- ✅ **New**: Expression definitions for complex filtering
- ✅ Join support with required `columns` array
- ✅ Expression references in WHERE clause
- ✅ HAVING clause support

## Validation Features

### Column Reference Validation

All validators enforce the `@` prefix pattern:

```typescript
// ✅ Correct - Plain keys in schema definition
columns: ['id', 'name', 'email']

// ✅ Correct - @ prefix in references
where: { '@status': 'active' }
projection: { userId: '@id' }
orderBy: { '@createdAt': 'DESC' }

// ❌ Wrong - @ prefix in schema
columns: ['@id', '@name']  // Throws error
```

### Type Safety

All validators use TypeScript assertion signatures:

```typescript
const query: unknown = getQueryFromUser();

// After validation, query is properly typed
assertSelectQuery(query);
// query is now Query<'SELECT', PT, LT>

// Can safely access typed properties
console.log(query.projection);
```

### Comprehensive Error Messages

Validators provide clear, actionable error messages:

```typescript
assertSelectQuery({
  type: 'SELECT',
  table: 'users',
  columns: ['@id'], // Wrong: @ prefix in columns
  projection: { id: '@id' },
});
// TypeError: Invalid SELECT query: Columns should be plain strings without '@' prefix. Got '@id'
```

## Usage

### Basic Usage

```typescript
import {
  assertCountQuery,
  assertDeleteQuery,
  assertInsertQuery,
  assertSelectQuery,
  assertUpdateQuery,
  assertUpsertQuery,
} from '@tundralibs/oql/asserts/Query/DML/mod.ts';

// Validate a SELECT query with new structure
const selectQuery = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'firstName', 'lastName', 'amount'],
  expressions: {
    fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
  },
  aggregates: {
    totalSales: { type: 'SUM', column: '@amount' },
  },
  projection: {
    '@id': 'userId', // Column with alias
    '@fullName': true, // Expression same name
    '@totalSales': 'total', // Aggregate with alias
  },
  where: { '@fullName': { $like: 'John%' } }, // Reference expression
  having: { '@totalSales': { $gte: 100 } }, // Reference aggregate
};

assertSelectQuery(selectQuery); // ✓ Valid, throws on invalid

// Validate an UPDATE query with expressions
const updateQuery = {
  type: 'UPDATE',
  table: 'users',
  columns: ['id', 'name', 'age', 'updatedAt'],
  expressions: {
    fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
  },
  data: { age: 31, updatedAt: { type: 'NOW' } },
  where: { '@fullName': 'John Doe' }, // Reference expression
};

assertUpdateQuery(updateQuery); // ✓ Valid

// Validate an INSERT query
const insertQuery = {
  type: 'INSERT',
  table: 'users',
  columns: ['id', 'name', 'email'],
  data: { id: 1, name: 'John', email: 'john@example.com' },
};

assertInsertQuery(insertQuery); // ✓ Valid
```

### With Query Builders

```typescript
import { assertSelectQuery } from '@tundralibs/oql/asserts/Query/DML/mod.ts';
import { PostgresBuilder } from '@tundralibs/oql/builders/PostgresBuilder.ts';

function executeQuery(query: unknown) {
  // Validate first
  assertSelectQuery(query);

  // Now safe to build SQL
  const sql = PostgresBuilder.build(query);

  // Execute...
}
```

### Type-Safe Query Construction

```typescript
import type { Query } from '@tundralibs/oql/types/Query.ts';
import { assertSelectQuery } from '@tundralibs/oql/asserts/Query/DML/mod.ts';

type User = {
  id: number;
  firstName: string;
  lastName: string;
  amount: number;
  status: string;
};

// Type-safe query definition with new structure
const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'firstName', 'lastName', 'amount', 'status'],
  expressions: {
    fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
  },
  aggregates: {
    totalAmount: { type: 'SUM', column: '@amount' },
  },
  projection: {
    '@id': 'userId',
    '@fullName': 'name',
    '@totalAmount': true,
  },
  where: { '@status': 'active' },
  having: { '@totalAmount': { $gte: 100 } },
};

// Runtime validation
assertSelectQuery(query);
```

## Test Coverage

The DML validator test suite includes:

- ✅ 13 test suites
- ✅ 100+ test cases
- ✅ Valid query scenarios for all DML types
- ✅ Invalid query detection
- ✅ Edge cases and boundary conditions
- ✅ Type validation
- ✅ Error message validation

Run tests:

```bash
deno test asserts/Query/DML/DML.test.ts
```

## Design Principles

### 1. **Fail Fast**

Validators throw immediately on first error, providing clear error messages.

### 2. **Type Safety**

Uses TypeScript assertion signatures for compile-time and runtime safety.

### 3. **Composable**

Validators reuse existing validators (Filters, Expressions, Aggregates,
ColumnIdentifier).

### 4. **Comprehensive**

Validates all query properties, not just required ones.

### 5. **Clear Errors**

Error messages indicate exactly what's wrong and how to fix it.

## Roadmap

### ✅ Completed

- All DML query validators
- Comprehensive test suite
- Documentation
- Integration with existing validators

### 🔄 In Progress

- DDL query validators (CREATE_TABLE, ALTER_TABLE, etc.)

### 📋 Planned

- Performance optimizations
- Validator composition utilities
- Custom error types
- Validation result objects (non-throwing mode)

## Contributing

When adding new validators:

1. Follow the existing pattern (explicit return type annotations)
2. Reuse existing validators (ColumnIdentifier, FilterOperator, Expressions,
   Aggregates)
3. Provide comprehensive error messages
4. Add test coverage (both valid and invalid cases)
5. Document all validation rules in JSDoc

## Related

- [Type System](../../types/README.md) - OQL type definitions
- [Filter Validators](../Filters/README.md) - WHERE/HAVING clause validators
- [Expression Validators](../Expressions/README.md) - Expression validators
- [Aggregate Validators](../Aggregates.ts) - Aggregate function validators
