# Filter Validators Implementation Plan

## ✅ Completed Implementation

### Module Structure

```
oql/asserts/Filters/
├── Operators.ts              ✅ (269 lines)
├── ExpressionOperators.ts    ✅ (171 lines)
├── FilterOperator.ts         ✅ (242 lines)
├── Joins.ts                  ✅ (397 lines)
└── mod.ts                    ✅ (exports)
```

## Test Files To Create

### 1. Operators.test.ts

**Coverage Goal:** 100% - Test all operator types and validation rules

**Test Sections:**

- **Direct Values (10 tests)**
  - null value
  - string, number, boolean, bigint, Date primitives
  - Array of primitives (valid)
  - Empty array (invalid)
  - Array with non-primitive (invalid)

- **Equality Operators (8 tests)**
  - $eq with primitive
  - $ne with primitive
  - Multiple operators in same object
  - Invalid operator names

- **Array Operators (6 tests)**
  - $in with array
  - $nin with array
  - Empty array (invalid)
  - Non-array value (invalid)

- **Comparison Operators (8 tests)**
  - $gt, $gte, $lt, $lte with numeric
  - Type validation (only numeric/date)
  - String column with $gt (invalid)

- **String Operators (8 tests)**
  - $like, $ilike, $startsWith, etc.
  - Type validation (only string)
  - Numeric column with $like (invalid)

- **Null Operator (3 tests)**
  - $null: true/false
  - Non-boolean value (invalid)

- **Error Cases (6 tests)**
  - Not an object
  - Empty object
  - Unknown operator
  - Mixed invalid cases

**Total:** ~49 test steps

### 2. ExpressionOperators.test.ts

**Coverage Goal:** 100% - Test expression wrapping in operators

**Test Sections:**

- **Equality with Expressions (6 tests)**
  - $eq with numeric expression
  - $ne with string expression
  - $eq with date expression
  - Valid column list validation
  - Invalid expression (error)

- **Comparison with Expressions (8 tests)**
  - $gt with ADD expression
  - $gte with MULTIPLY expression
  - $lt with SUBTRACT expression
  - $lte with expression
  - String column with $gt (invalid)
  - Boolean column with comparison (invalid)

- **String Operators with Expressions (8 tests)**
  - $like with CONCAT expression
  - $ilike with LOWER expression
  - $startsWith with expression
  - $endsWith with expression
  - $contains with expression
  - Numeric column with $like (invalid)

- **Error Cases (8 tests)**
  - Not an object
  - Empty object
  - Unknown operator
  - Operator with non-expression value
  - Operator with array
  - Operator with null
  - Invalid expression object

**Total:** ~30 test steps

### 3. FilterOperator.test.ts

**Coverage Goal:** 100% - Test complete filter objects and query filters

**Test Sections (FilterOperator):**

- **Valid Filter Objects (10 tests)**
  - Single column with direct value
  - Multiple columns with operators
  - Column with ExpressionOperators
  - Mixed operators and expression operators
  - With column list validation

- **Column Identifier Validation (5 tests)**
  - Invalid column identifier
  - Column not in list
  - Nested column identifier

- **Value Validation (5 tests)**
  - Invalid value type
  - Neither operators nor expression operators

**Test Sections (QueryFilter):**

- **Logical Operators (12 tests)**
  - $and with multiple filters
  - $or with multiple filters
  - Nested $and/$or
  - $and/$or with empty array (invalid)
  - $and/$or with non-array (invalid)
  - Invalid filter in $and
  - Invalid filter in $or

- **Mixed Filters (6 tests)**
  - Filter properties + $and
  - Filter properties + $or
  - Filter + $and + $or combined

- **Error Cases (5 tests)**
  - Not an object
  - Empty object
  - Array instead of object

**Total:** ~43 test steps

### 4. Joins.test.ts

**Coverage Goal:** 100% - Test join specifications

**Test Sections (JoinFilter):**

- **Valid Values (12 tests)**
  - Column to column (@user.@id: '@profile.@userId')
  - Constant values (string, number, boolean, bigint, Date)
  - Null value
  - Expression value
  - Multiple conditions

- **Column Validation (6 tests)**
  - Invalid key (not column identifier)
  - Column not in list
  - Invalid column reference in value

- **Error Cases (4 tests)**
  - Not an object
  - Empty object
  - Invalid value type

**Test Sections (JoinDetails):**

- **Required Properties (8 tests)**
  - Valid minimal join (table + on)
  - Missing 'table' property
  - Missing 'on' property
  - Invalid 'table' type
  - Invalid 'on' value

- **Optional Properties (8 tests)**
  - With schema
  - With type (INNER, LEFT, RIGHT, FULL)
  - Invalid type
  - Invalid schema type

- **Complete Joins (6 tests)**
  - All properties valid
  - Complex ON clause with expressions

**Test Sections (Joins):**

- **Collection Validation (6 tests)**
  - Single join
  - Multiple joins
  - Empty object (invalid)
  - Not an object (invalid)
  - Invalid JoinDetails in collection

**Total:** ~50 test steps

## Implementation Strategy

1. ✅ **Core Implementation Complete** - All 4 validator modules created
2. **Next:** Create test files following established patterns from
   Aggregates.test.ts
3. Run tests and fix any issues
4. Achieve 100% coverage for each module

## Testing Patterns from Aggregates.test.ts

```typescript
await t.step('assertXXX - valid: description', () => {
  assertXXX(validValue);
});

await t.step('assertXXX - invalid: description', () => {
  asserts.assertThrows(
    () => assertXXX(invalidValue as any),
    TypeError,
    'Expected error message substring',
  );
});

await t.step('isXXX - valid', () => {
  asserts.assertEquals(isXXX(validValue), true);
});

await t.step('isXXX - invalid', () => {
  asserts.assertEquals(isXXX(invalidValue), false);
});
```

## Estimated Test Coverage

- **Operators.test.ts:** 49 steps → ~350 lines
- **ExpressionOperators.test.ts:** 30 steps → ~250 lines
- **FilterOperator.test.ts:** 43 steps → ~400 lines
- **Joins.test.ts:** 50 steps → ~600 lines

**Total:** ~172 test steps, ~1600 lines of test code

## Review Complete - Ready for Test Implementation

All validator modules are implemented with:

- ✅ Comprehensive JSDoc documentation
- ✅ Type-safe assertions and type guards
- ✅ Clear error messages
- ✅ Proper validation logic
- ✅ Modular structure

Ready to create test files!
