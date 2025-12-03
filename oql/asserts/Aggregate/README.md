# Aggregate Assertions

Runtime validation utilities for aggregate function objects used in OQL queries.

## Overview

These assertions provide runtime type checking and validation for aggregate
functions, ensuring they conform to the expected structure before being used in
query building. All assertions throw `TypeError` if validation fails.

## Usage

### Main Entry Point

```typescript
import { assertAggregate } from '@tundralibs/oql/asserts/Aggregate';

// Validates any aggregate type
assertAggregate({ type: 'COUNT' }); // OK
assertAggregate({ type: 'SUM', column: '@amount' }); // OK
assertAggregate({ type: 'INVALID' }); // Throws TypeError
```

### Specific Validators

For more granular control or performance, you can use specific validators:

#### COUNT

```typescript
import { assertCount } from '@tundralibs/oql/asserts/Aggregate';

// COUNT(*) - count all rows
assertCount({ type: 'COUNT' });

// COUNT(column) - count non-null values
assertCount({ type: 'COUNT', column: '@email' });

// COUNT(DISTINCT column) - count distinct values
assertCount({ type: 'COUNT', column: '@userId', distinct: true });
```

**Rules:**

- `type` must be `'COUNT'`
- `column` is optional; when provided, must be a valid ColumnIdentifier or
  Expression
- `distinct` can only be used when `column` is provided
- No other properties allowed

#### Numeric Aggregates (SUM, MIN, MAX, AVG)

```typescript
import { assertNumericAggregate } from '@tundralibs/oql/asserts/Aggregate';

// SUM
assertNumericAggregate({ type: 'SUM', column: '@amount' });

// AVG with DISTINCT
assertNumericAggregate({ type: 'AVG', column: '@price', distinct: true });

// MIN on date column
assertNumericAggregate({ type: 'MIN', column: '@createdAt' });

// With expression
assertNumericAggregate({
  type: 'SUM',
  column: { type: 'MULTIPLY', args: ['@price', '@quantity'] },
});
```

**Rules:**

- `type` must be one of: `'SUM'`, `'MIN'`, `'MAX'`, `'AVG'`
- `column` is required; must be a valid ColumnIdentifier or Expression
- `distinct` is optional boolean
- No other properties allowed

#### STRING_AGG

```typescript
import { assertStringAgg } from '@tundralibs/oql/asserts/Aggregate';

// Basic string aggregation
assertStringAgg({ type: 'STRING_AGG', column: '@name' });

// With custom separator
assertStringAgg({
  type: 'STRING_AGG',
  column: '@email',
  separator: '; ',
});

// With DISTINCT
assertStringAgg({
  type: 'STRING_AGG',
  column: '@tag',
  separator: ', ',
  distinct: true,
});
```

**Rules:**

- `type` must be `'STRING_AGG'`
- `column` is required; must be a valid ColumnIdentifier or Expression
- `separator` is optional string (defaults to `,` in implementation)
- `distinct` is optional boolean
- No other properties allowed

#### ARRAY_AGG

```typescript
import { assertArrayAgg } from '@tundralibs/oql/asserts/Aggregate';

// Collect values into array
assertArrayAgg({ type: 'ARRAY_AGG', column: '@id' });

// With DISTINCT
assertArrayAgg({
  type: 'ARRAY_AGG',
  column: '@productId',
  distinct: true,
});
```

**Rules:**

- `type` must be `'ARRAY_AGG'`
- `column` is required; must be a valid ColumnIdentifier or Expression
- `distinct` is optional boolean
- No other properties allowed

#### JSON_ROW

```typescript
import { assertJsonRow } from '@tundralibs/oql/asserts/Aggregate';

// Aggregate columns into JSON object
assertJsonRow({
  type: 'JSON_ROW',
  columns: {
    userId: '@id',
    userName: '@name',
    userEmail: '@email',
  },
});

// With qualified column references
assertJsonRow({
  type: 'JSON_ROW',
  columns: {
    id: '@user.@id',
    profile: '@user.@profile.@bio',
  },
});
```

**Rules:**

- `type` must be `'JSON_ROW'`
- `columns` is required; must be a non-empty object (Record<string,
  ColumnIdentifier | Expression>)
- Each value in `columns` must be a valid ColumnIdentifier or Expression
- At least one column mapping is required
- No other properties allowed

## Error Messages

All assertions provide clear error messages indicating what went wrong:

```typescript
assertCount({ type: 'COUNT', separator: ',' });
// TypeError: Invalid COUNT aggregate: Unknown properties: separator.
// Valid properties are: type, column, distinct

assertNumericAggregate({ type: 'SUM' });
// TypeError: Invalid SUM aggregate: Missing required property 'column'

assertJsonRow({ type: 'JSON_ROW', columns: {} });
// TypeError: Invalid JSON_ROW aggregate: columns cannot be empty.
// At least one column mapping is required
```

## Custom Error Messages

All assertions support custom error messages:

```typescript
assertCount(
  { type: 'COUNT', column: 'invalid' },
  'Custom error: Invalid count configuration',
);
// TypeError: Custom error: Invalid count configuration
```

## Use in Query Builders

These assertions are designed for use in query builders where runtime validation
is needed:

```typescript
class QueryBuilder {
  aggregate(agg: unknown) {
    // Validate at runtime
    assertAggregate(agg);

    // Now TypeScript knows agg has the correct structure
    this.aggregates.push(agg);
    return this;
  }

  count(column?: string, distinct?: boolean) {
    const agg = column
      ? { type: 'COUNT' as const, column, distinct }
      : { type: 'COUNT' as const };

    assertCount(agg); // Validate before adding
    this.aggregates.push(agg);
    return this;
  }
}
```

## Type Narrowing

All assertions use TypeScript's `asserts` keyword to narrow types:

```typescript
function processAggregate(value: unknown) {
  assertAggregate(value);

  // TypeScript now knows value is { type: AggregateFunction }
  console.log(value.type); // No error

  if (value.type === 'COUNT') {
    assertCount(value);
    // TypeScript now knows the full COUNT structure
    if (value.column) {
      console.log(`Counting column: ${value.column}`);
    }
  }
}
```

## Testing

Run the test suite:

```bash
deno test asserts/Aggregate/Aggregate.test.ts
```

All assertions are thoroughly tested with both valid and invalid inputs.

## Notes

- **Expression Validation**: These assertions validate that columns are either
  strings (ColumnIdentifiers) or objects (Expressions), but they do NOT validate
  the internal structure of Expression objects. Use a separate
  `assertExpression` function for that.

- **Performance**: If you know the aggregate type at compile time, use the
  specific validators (`assertCount`, `assertNumericAggregate`, etc.) instead of
  `assertAggregate` for better performance.

- **Column References**: All string column values are validated using
  `assertColumnIdentifier` to ensure they follow the `@column` or
  `@table.@column` pattern.
