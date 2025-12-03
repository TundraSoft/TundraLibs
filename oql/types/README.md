# OQL Types - Type-Safe Query Language

A comprehensive TypeScript type system for building type-safe database queries
across multiple database engines (PostgreSQL, MariaDB, SQLite, MongoDB).

## Overview

OQL (Object Query Language) provides a database-agnostic query interface with
full TypeScript type safety. The type system ensures:

- **Compile-time validation** of column names, types, and operations
- **Type-safe filtering** with automatic type inference
- **Cross-database compatibility** with platform-specific feature flags
- **Expression support** for computed values and transformations
- **Join safety** with enforced type matching between linked columns

## Architecture

### Core Design Principles

1. **Discriminated Unions**: All query types use `type` property for type
   discrimination
2. **ColumnIdentifier Pattern**: All column references use `@${string}` pattern
   for consistency
3. **Helper Types**: Utility types like `GetColumnByType` and
   `GetExpressionByType` for filtering
4. **Flat Discriminated Unions**: Simple, maintainable type definitions without
   complex conditionals
5. **Expression System**: Composable expressions for computed values and
   transformations

## Type Categories

### 1. Common Types (`Common.ts`)

Foundation types used throughout the system.

#### `ColumnTypes`

Union of all supported column value types, including nullable variants:

```typescript
type ColumnTypes =
  | string
  | number
  | bigint
  | boolean
  | Date
  | Record<string, unknown>
  | null;
```

All base types can be nullable to support database NULL values:

```typescript
type User = {
  id: number;
  name: string;
  email: string | null; // Nullable email
  deletedAt: Date | null; // Nullable timestamp
};
```

#### `TableType`

Generic table schema definition:

```typescript
type TableType = Record<string, ColumnTypes>;

// Example
type User = {
  id: number;
  name: string;
  email: string;
  createdAt: Date;
};
```

#### `ColumnIdentifier`

Template literal type for column references:

```typescript
type ColumnIdentifier = `@${string}`;

// Examples
const id: ColumnIdentifier = '@id';
const nested: ColumnIdentifier = '@user.@profile.@email';
```

#### `GetColumnByType<T, V>`

Helper type to filter columns by their value type:

```typescript
type NumericColumns = GetColumnByType<User, number>;
// Result: '@id' | '@age'

type StringColumns = GetColumnByType<User, string>;
// Result: '@name' | '@email'
```

### 2. Filter Types (`Filter.ts`)

Type-safe filtering and join operations with expression support.

#### `Operators<T>`

Filter operators for a given column type:

```typescript
// For strings
where: {
  '@name': { $like: '%John%' },
  '@email': { $startsWith: 'admin@' }
}

// For numbers
where: {
  '@age': { $gte: 18, $lt: 65 },
  '@score': { $in: [90, 95, 100] }
}

// With expressions
where: {
  '@total': { 
    $gt: { 
      type: 'ADD', 
      args: ['@price', '@tax'] 
    } 
  }
}
```

#### `QueryFilter<PT, FPT>`

Recursive filter with `$and`/`$or` support:

```typescript
where: {
  $or: [
    { '@status': 'active' },
    { '@lastLogin': { $gte: new Date('2024-01-01') } }
  ],
  '@email': { $null: false }
}
```

#### `JoinFilter<PT, LT>`

Type-safe join conditions between tables:

```typescript
joins: {
  Profile: {
    table: 'profiles',
    type: 'LEFT',
    on: {
      '@Profile.@userId': '@id',  // Type-safe: both are numbers
      '@Profile.@email': { 
        type: 'CONCAT', 
        args: ['@name', '@domain'] 
      }
    }
  }
}
```

### 3. Expression Types (`Expressions.ts`)

Composable expressions for computed values and transformations.

#### Expression Categories

**Numeric Expressions** (15 functions):

- Arithmetic: `ADD`, `SUBTRACT`, `MULTIPLY`, `DIVIDE`, `MODULO`
- Math functions: `ABS`, `CEIL`, `FLOOR`, `ROUND`, `POWER`, `SQRT`, `SIGN`
- Utilities: `LENGTH`, `DATE_DIFF`

**String Expressions** (11 functions):

- Transformation: `CONCAT`, `LOWER`, `UPPER`, `TRIM`, `LTRIM`, `RTRIM`
- Manipulation: `SUBSTR`, `REPLACE`, `LPAD`, `RPAD`
- Generation: `UUID`

**Date Expressions** (6 functions):

- Current time: `NOW`, `CURRENT_DATE`, `CURRENT_TIME`, `CURRENT_TIMESTAMP`,
  `CURRENT_TIMESTAMPTZ`
- Arithmetic: `DATE_ADD`

**Utility Expressions** (5 functions):

- Logic: `COALESCE`, `NULLIF`
- Type conversion: `CAST`
- Security: `ENCRYPT`, `DECRYPT`, `HASH`

#### `GetExpressionByType<V>`

Filter expressions by return type:

```typescript
type NumericExpressions = GetExpressionByType<number>;
// Result: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | ...

type StringExpressions = GetExpressionByType<string>;
// Result: 'CONCAT' | 'LOWER' | 'UPPER' | ...
```

#### Expression Usage

```typescript
// Computed column in SELECT
projection: {
  fullName: {
    type: 'CONCAT',
    args: ['@firstName', ' ', '@lastName']
  },
  discountPrice: {
    type: 'MULTIPLY',
    args: ['@price', 0.9]
  }
}

// Computed value in INSERT
data: {
  id: 1,
  createdAt: { type: 'NOW', args: [] },
  fullName: { type: 'CONCAT', args: ['@firstName', '@lastName'] }
}

// Computed value in UPDATE
data: {
  lastModified: { type: 'NOW', args: [] },
  total: { type: 'ADD', args: ['@price', '@tax'] }
}
```

### 4. Aggregate Types (`Aggregates.ts`)

Aggregate functions with expression support.

#### Supported Aggregates

- `COUNT`: Count rows or non-null values
- `SUM`: Sum numeric values
- `MIN`: Minimum value
- `MAX`: Maximum value
- `AVG`: Average value
- `STRING_AGG`: Concatenate strings with separator
- `ARRAY_AGG`: Aggregate values into array
- `JSON_ROW`: Aggregate row as JSON object

#### Expression Integration

```typescript
projection: {
  totalRevenue: {
    type: 'SUM',
    column: {
      type: 'MULTIPLY',
      args: ['@price', '@quantity']
    }
  },
  avgDiscount: {
    type: 'AVG',
    column: {
      type: 'MULTIPLY',
      args: ['@price', 0.1]
    }
  }
}
```

### 5. Query Types (`Query.ts`)

Main query definitions for DML and DDL operations.

#### DML Operations

**SELECT**: Retrieve data

```typescript
const query: Query<'SELECT', User, { Profile: ProfileSchema }> = {
  type: 'SELECT',
  table: 'users',
  schema: 'public',
  columns: ['id', 'name', 'email', 'createdAt'],
  projection: {
    id: '@id',
    name: '@name',
    fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
    profileEmail: '@Profile.@email',
  },
  joins: {
    Profile: {
      table: 'profiles',
      type: 'LEFT',
      on: { '@Profile.@userId': '@id' },
    },
  },
  where: { '@status': 'active' },
  orderBy: { '@createdAt': 'DESC' },
  limit: 10,
};
```

**INSERT**: Add new rows

```typescript
const query: Query<'INSERT', User> = {
  type: 'INSERT',
  table: 'users',
  schema: 'public',
  columns: ['id', 'name', 'email', 'createdAt'],
  data: {
    id: 1,
    name: 'John',
    email: 'john@example.com',
    createdAt: { type: 'NOW', args: [] },
  },
};
```

**UPDATE**: Modify existing rows

```typescript
const query: Query<'UPDATE', User> = {
  type: 'UPDATE',
  table: 'users',
  schema: 'public',
  columns: ['id', 'name', 'email', 'updatedAt'],
  data: {
    name: 'Jane',
    updatedAt: { type: 'NOW', args: [] },
  },
  where: { '@id': 1 },
};
```

**UPSERT**: Insert or update on conflict

```typescript
const query: Query<'UPSERT', User> = {
  type: 'UPSERT',
  table: 'users',
  schema: 'public',
  columns: ['id', 'name', 'email', 'createdAt'],
  data: {
    id: 1,
    name: 'John',
    email: 'john@example.com',
    createdAt: { type: 'NOW', args: [] },
  },
  conflictKeys: ['id'],
};
```

**DELETE**: Remove rows

```typescript
const query: Query<'DELETE', User> = {
  type: 'DELETE',
  table: 'users',
  schema: 'public',
  columns: ['id', 'status'],
  where: { '@status': 'inactive' },
};
```

**COUNT**: Get row count

```typescript
const query: Query<'COUNT', User> = {
  type: 'COUNT',
  table: 'users',
  schema: 'public',
  columns: ['id', 'status'],
  where: { '@status': 'active' },
};
```

#### DDL Operations

**CREATE_TABLE**: Define new table

```typescript
const query: Query<'CREATE_TABLE', User> = {
  type: 'CREATE_TABLE',
  table: 'users',
  columns: {
    id: { type: 'SERIAL', nullable: false },
    name: { type: 'VARCHAR(255)', nullable: false },
    email: { type: 'VARCHAR(255)', nullable: true },
  },
  primaryKey: ['id'],
  ifNotExists: true,
};
```

**CREATE_VIEW**: Define virtual table

```typescript
const query: Query<'CREATE_VIEW', ActiveUser> = {
  type: 'CREATE_VIEW',
  view: 'active_users',
  schema: 'public',
  query: {
    type: 'SELECT',
    table: 'users',
    columns: ['id', 'name', 'email'],
    projection: {
      id: '@id',
      name: '@name',
      email: '@email',
    },
    where: { '@status': 'active' },
  },
};
```

## Database Compatibility

### Platform Support

| Feature     | PostgreSQL | MariaDB     | SQLite     | MongoDB    |
| ----------- | ---------- | ----------- | ---------- | ---------- |
| Core DML    | ✅         | ✅          | ✅         | ✅         |
| Core DDL    | ✅         | ✅          | ✅         | ⚠️ Limited |
| Joins       | ✅         | ✅          | ✅         | ⚠️ $lookup |
| Aggregates  | ✅         | ✅          | ✅         | ✅         |
| Expressions | ✅         | ✅          | ⚠️ Limited | ⚠️ Limited |
| Views       | ✅         | ✅          | ✅         | ⚠️ Limited |
| Schemas     | ✅         | ⚠️ Database | ❌         | ❌         |

### Platform-Specific Notes

**PostgreSQL**: Full feature support including schemas, materialized views, and
all expressions.

**MariaDB**: Full DML/DDL support. Schemas are treated as separate databases.

**SQLite**: Limited expression support (no ENCRYPT/DECRYPT/HASH). No schema
support.

**MongoDB**:

- DDL operations map to collection operations
- Joins use `$lookup` aggregation
- Limited expression support
- No traditional schema support

## Usage Examples

### Basic Query

```typescript
import type { Query, TableType } from '@tundralibs/oql/types';

type User = {
  id: number;
  name: string;
  email: string;
};

const query: Query<'SELECT', User> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'name', 'email'],
  projection: {
    id: '@id',
    name: '@name',
  },
  where: { '@email': { $like: '%@example.com' } },
};
```

### Complex Query with Joins

```typescript
type Order = {
  id: number;
  userId: number;
  total: number;
};

const query: Query<'SELECT', User, { Order: Order }> = {
  type: 'SELECT',
  table: 'users',
  columns: ['id', 'name'],
  projection: {
    id: '@id',
    name: '@name',
    orderCount: { type: 'COUNT', column: '@Order.@id' },
    totalSpent: { type: 'SUM', column: '@Order.@total' },
  },
  joins: {
    Order: {
      table: 'orders',
      type: 'LEFT',
      on: { '@Order.@userId': '@id' },
    },
  },
  having: {
    orderCount: { $gt: 5 },
  },
};
```

### Expression-Based Queries

```typescript
const query: Query<'INSERT', User> = {
  type: 'INSERT',
  table: 'users',
  columns: ['id', 'name', 'email', 'createdAt'],
  data: {
    id: 1,
    name: { type: 'CONCAT', args: ['John', ' ', 'Doe'] },
    email: { type: 'LOWER', args: ['JOHN.DOE@EXAMPLE.COM'] },
    createdAt: { type: 'NOW', args: [] },
  },
};
```

## Best Practices

1. **Use ColumnIdentifier Pattern**: Always prefix column references with `@`
2. **Leverage Helper Types**: Use `GetColumnByType` and `GetExpressionByType`
   for type filtering
3. **Type Your Schemas**: Define explicit types for all table schemas
4. **Check Platform Compatibility**: Verify expressions are supported on target
   database
5. **Use Expressions for Computed Values**: Prefer expressions over raw SQL
   strings
6. **Explicit Exports**: Import specific types rather than using `*`

## Type Safety Features

- **Compile-time validation** of all column references using ColumnIdentifier
  pattern
- **Type checking** for filter operators based on column types
- **Join type safety** ensures matching types between linked columns
- **Expression type matching** validates expressions return the correct type for
  each property
- **Aggregate constraints** ensure numeric aggregates only on numeric columns
- **Nullable support** allows proper representation of database NULL values
- **Mandatory field preservation** in INSERT/UPSERT ensures all required fields
  are provided

## Contributing

When adding new types or modifying existing ones:

1. Maintain discriminated union pattern with `type` property
2. Use ColumnIdentifier pattern for all column references
3. Add comprehensive JSDoc with examples
4. Update this README with new features
5. Test across all supported database platforms
6. Ensure backward compatibility

## License

MIT License - See LICENSE file for details
