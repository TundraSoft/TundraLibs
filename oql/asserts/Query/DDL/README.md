# DDL (Data Definition Language) Query Validators

This directory contains validators for DDL operations that define and modify database structure.

## Available Validators

### Schema Operations

#### CREATE_SCHEMA
Creates a new database schema/namespace.

```typescript
import { assertCreateSchema } from './DDL/mod.ts';

const query = {
  type: 'CREATE_SCHEMA',
  schema: 'analytics'
};

assertCreateSchema(query); // ✓ Valid
```

**Properties:**
- `type` (required): Must be `'CREATE_SCHEMA'`
- `schema` (required): Schema name (alphanumeric + underscores, max 63 chars)

**Validation Rules:**
- Schema name must start with letter or underscore
- Cannot contain special characters (except underscores)
- Maximum length of 63 characters
- Cannot be empty or whitespace-only

#### DROP_SCHEMA
Removes an existing database schema.

```typescript
import { assertDropSchema } from './DDL/mod.ts';

const query = {
  type: 'DROP_SCHEMA',
  schema: 'analytics',
  cascade: true  // Optional: drop all contained objects
};

assertDropSchema(query); // ✓ Valid
```

**Properties:**
- `type` (required): Must be `'DROP_SCHEMA'`
- `schema` (required): Schema name to drop
- `cascade` (optional): Boolean - if true, drops all objects within schema

**Validation Rules:**
- Schema name follows same rules as CREATE_SCHEMA
- `cascade` must be boolean if provided

## Test Coverage

- **CREATE_SCHEMA**: 17 tests
- **DROP_SCHEMA**: 21 tests
- **Total**: 38 tests (100% passing)

Tests cover:
- ✅ Valid queries with various schema names
- ✅ Invalid type validation
- ✅ Schema name format validation
- ✅ Empty/whitespace handling
- ✅ Special character rejection
- ✅ Length limits
- ✅ CASCADE option validation
- ✅ Extra property detection

## Usage Pattern

All DDL validators follow the same pattern:

```typescript
export const assertDDLOperation = <T extends Query<'OPERATION_TYPE'>>(
  x: T,
): void => {
  // 1. Validate type
  // 2. Validate required properties
  // 3. Validate optional properties
  // 4. Check for unexpected properties
  // Throws TypeError on any validation failure
};
```

## Future DDL Operations

Planned validators (not yet implemented):
- `CREATE_TABLE` - Define table structure
- `DROP_TABLE` - Remove table
- `ALTER_TABLE` - Modify table structure
- `CREATE_VIEW` - Create virtual table
- `DROP_VIEW` - Remove view
- `ALTER_VIEW` - Modify view definition
