/**
 * Aggregate Function Validators
 *
 * This module provides validation functions for aggregate expressions in OQL.
 * It includes assertion and type guard functions for various aggregate operations:
 * - COUNT: Count rows or distinct values
 * - SUM: Sum numeric values
 * - AVG: Average numeric values
 * - MIN: Minimum value
 * - MAX: Maximum value
 * - STRING_AGG: Concatenate string values with delimiter
 * - ARRAY_AGG: Collect values into an array
 * - JSON_ROW: Aggregate columns into JSON object
 *
 * @module asserts/Aggregates
 */

import type { AggregateFunction, Aggregates } from '../types/mod.ts';
import { assertColumnIdentifier } from './ColumnIdentifier.ts';
import {
  assertExpression,
  assertNumericExpression,
} from './Expressions/mod.ts';

/**
 * List of valid aggregate function types.
 * @internal
 */
const AGGREGATE_TYPES: AggregateFunction[] = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'STRING_AGG',
  'ARRAY_AGG',
  'JSON_ROW',
];

/**
 * Base validation for aggregate structure.
 * Validates that the value is an object with a valid aggregate type.
 * @internal
 */
const baseAggregateValidation = (
  x: unknown,
  expectedType?: AggregateFunction,
): void => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid Aggregate definition: Expected object, got ${typeof x}`,
    );
  }
  if (!('type' in x)) {
    throw new TypeError(
      `Invalid Aggregate definition: Missing 'type' property`,
    );
  }
  if (typeof x.type !== 'string') {
    throw new TypeError(
      `Invalid Aggregate definition: 'type' must be a string, got ${typeof x
        .type}`,
    );
  }
  if (!AGGREGATE_TYPES.includes(x.type as AggregateFunction)) {
    throw new TypeError(
      `Invalid Aggregate type: Expected one of ${
        AGGREGATE_TYPES.join(', ')
      }, got '${x.type}'`,
    );
  }
  if (expectedType && x.type !== expectedType) {
    throw new TypeError(
      `Invalid Aggregate definition: Expected type '${expectedType}', got '${x.type}'`,
    );
  }
};

/**
 * Validates the distinct flag if present.
 * @internal
 */
const validateDistinct = (x: unknown, aggregateType: string): void => {
  if (
    'distinct' in (x as object) &&
    (x as { distinct: unknown }).distinct !== undefined
  ) {
    const distinct = (x as { distinct: unknown }).distinct;
    if (typeof distinct !== 'boolean') {
      throw new TypeError(
        `Invalid ${aggregateType} aggregate: 'distinct' must be a boolean, got ${typeof distinct}`,
      );
    }
  }
};

/**
 * Validates a column reference or expression for aggregates.
 * @internal
 */
const validateColumnOrExpression = (
  column: unknown,
  aggregateType: string,
  columnList?: string[],
  requireNumeric?: boolean,
): void => {
  if (typeof column === 'string') {
    if (column.startsWith('@')) {
      try {
        assertColumnIdentifier(column, columnList);
      } catch {
        throw new TypeError(
          `Invalid ${aggregateType} aggregate: Invalid column identifier ${column}`,
        );
      }
    } else {
      throw new TypeError(
        `Invalid ${aggregateType} aggregate: Column must be a column identifier (starting with '@') or an expression, got string literal`,
      );
    }
  } else if (typeof column === 'object' && column !== null) {
    // Validate as expression
    try {
      if (requireNumeric) {
        assertNumericExpression(column, columnList);
      } else {
        assertExpression(column, columnList);
      }
    } catch (error) {
      throw new TypeError(
        `Invalid ${aggregateType} aggregate: Invalid expression - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  } else {
    throw new TypeError(
      `Invalid ${aggregateType} aggregate: Column must be a column identifier or expression, got ${typeof column}`,
    );
  }
};

/**
 * Asserts that a value is a valid COUNT aggregate.
 *
 * COUNT can either count all rows (COUNT(*)) or count specific column values/expressions.
 * Supports optional DISTINCT to count unique values only.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * // COUNT(*) - count all rows
 * const countAll = { type: 'COUNT' };
 * assertCountAggregate(countAll); // ✓ Valid
 *
 * // COUNT(column) - count non-null column values
 * const countCol = { type: 'COUNT', column: '@userId' };
 * assertCountAggregate(countCol, ['userId']); // ✓ Valid
 *
 * // COUNT(DISTINCT column) - count unique values
 * const countDistinct = { type: 'COUNT', column: '@email', distinct: true };
 * assertCountAggregate(countDistinct, ['email']); // ✓ Valid
 *
 * // COUNT with expression
 * const countExpr = {
 *   type: 'COUNT',
 *   column: { type: 'ADD', args: ['@price', '@tax'] }
 * };
 * assertCountAggregate(countExpr, ['price', 'tax']); // ✓ Valid
 * ```
 */
export const assertCountAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'COUNT' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'COUNT' }> => {
  baseAggregateValidation(x, 'COUNT');

  // For COUNT, column is optional
  if ('column' in (x as object)) {
    const column = (x as { column: unknown }).column;
    validateColumnOrExpression(column, 'COUNT', columnList);
    // If column is present, distinct is allowed
    validateDistinct(x, 'COUNT');
  } else {
    // COUNT(*) - distinct should not be present
    if (
      'distinct' in (x as object) &&
      (x as { distinct: unknown }).distinct !== undefined
    ) {
      throw new TypeError(
        `Invalid COUNT aggregate: 'distinct' cannot be used without a column`,
      );
    }
  }
};

/**
 * Type guard to check if a value is a valid COUNT aggregate.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid COUNT aggregate, `false` otherwise
 *
 * @example
 * ```ts
 * const agg = { type: 'COUNT', column: '@id' };
 * if (isCountAggregate(agg, ['id'])) {
 *   // agg is narrowed to Extract<Aggregates, { type: 'COUNT' }>
 *   console.log('Valid COUNT aggregate');
 * }
 * ```
 */
export const isCountAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'COUNT' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'COUNT' }> => {
  try {
    assertCountAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid SUM aggregate.
 *
 * SUM calculates the sum of numeric values or numeric expressions.
 * Supports optional DISTINCT to sum unique values only.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * // SUM(column)
 * const sum1 = { type: 'SUM', column: '@amount' };
 * assertSumAggregate(sum1, ['amount']); // ✓ Valid
 *
 * // SUM(DISTINCT column)
 * const sum2 = { type: 'SUM', column: '@price', distinct: true };
 * assertSumAggregate(sum2, ['price']); // ✓ Valid
 *
 * // SUM with numeric expression
 * const sum3 = {
 *   type: 'SUM',
 *   column: { type: 'MULTIPLY', args: ['@quantity', '@price'] }
 * };
 * assertSumAggregate(sum3, ['quantity', 'price']); // ✓ Valid
 * ```
 */
export const assertSumAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'SUM' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'SUM' }> => {
  baseAggregateValidation(x, 'SUM');

  if (!('column' in (x as object))) {
    throw new TypeError(
      `Invalid SUM aggregate: Missing 'column' property`,
    );
  }

  const column = (x as { column: unknown }).column;
  validateColumnOrExpression(column, 'SUM', columnList, true);
  validateDistinct(x, 'SUM');
};

/**
 * Type guard to check if a value is a valid SUM aggregate.
 */
export const isSumAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'SUM' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'SUM' }> => {
  try {
    assertSumAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid AVG aggregate.
 *
 * AVG calculates the average of numeric values or numeric expressions.
 * Supports optional DISTINCT to average unique values only.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * const avg = { type: 'AVG', column: '@score' };
 * assertAvgAggregate(avg, ['score']); // ✓ Valid
 * ```
 */
export const assertAvgAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'AVG' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'AVG' }> => {
  baseAggregateValidation(x, 'AVG');

  if (!('column' in (x as object))) {
    throw new TypeError(
      `Invalid AVG aggregate: Missing 'column' property`,
    );
  }

  const column = (x as { column: unknown }).column;
  validateColumnOrExpression(column, 'AVG', columnList, true);
  validateDistinct(x, 'AVG');
};

/**
 * Type guard to check if a value is a valid AVG aggregate.
 */
export const isAvgAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'AVG' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'AVG' }> => {
  try {
    assertAvgAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid MIN aggregate.
 *
 * MIN finds the minimum value from numeric columns or numeric expressions.
 * Supports optional DISTINCT (though typically redundant for MIN).
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * const min = { type: 'MIN', column: '@price' };
 * assertMinAggregate(min, ['price']); // ✓ Valid
 * ```
 */
export const assertMinAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'MIN' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'MIN' }> => {
  baseAggregateValidation(x, 'MIN');

  if (!('column' in (x as object))) {
    throw new TypeError(
      `Invalid MIN aggregate: Missing 'column' property`,
    );
  }

  const column = (x as { column: unknown }).column;
  validateColumnOrExpression(column, 'MIN', columnList, true);
  validateDistinct(x, 'MIN');
};

/**
 * Type guard to check if a value is a valid MIN aggregate.
 */
export const isMinAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'MIN' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'MIN' }> => {
  try {
    assertMinAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid MAX aggregate.
 *
 * MAX finds the maximum value from numeric columns or numeric expressions.
 * Supports optional DISTINCT (though typically redundant for MAX).
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * const max = { type: 'MAX', column: '@quantity' };
 * assertMaxAggregate(max, ['quantity']); // ✓ Valid
 * ```
 */
export const assertMaxAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'MAX' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'MAX' }> => {
  baseAggregateValidation(x, 'MAX');

  if (!('column' in (x as object))) {
    throw new TypeError(
      `Invalid MAX aggregate: Missing 'column' property`,
    );
  }

  const column = (x as { column: unknown }).column;
  validateColumnOrExpression(column, 'MAX', columnList, true);
  validateDistinct(x, 'MAX');
};

/**
 * Type guard to check if a value is a valid MAX aggregate.
 */
export const isMaxAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'MAX' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'MAX' }> => {
  try {
    assertMaxAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid STRING_AGG aggregate.
 *
 * STRING_AGG concatenates string values with a delimiter.
 * Supports optional DISTINCT to concatenate unique values only.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * // String aggregation with custom separator
 * const strAgg = { type: 'STRING_AGG', column: '@name', separator: ', ' };
 * assertStringAggAggregate(strAgg, ['name']); // ✓ Valid
 *
 * // With DISTINCT
 * const strAggDistinct = {
 *   type: 'STRING_AGG',
 *   column: '@tag',
 *   separator: ';',
 *   distinct: true
 * };
 * assertStringAggAggregate(strAggDistinct, ['tag']); // ✓ Valid
 * ```
 */
export const assertStringAggAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'STRING_AGG' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'STRING_AGG' }> => {
  baseAggregateValidation(x, 'STRING_AGG');

  if (!('column' in (x as object))) {
    throw new TypeError(
      `Invalid STRING_AGG aggregate: Missing 'column' property`,
    );
  }

  const column = (x as { column: unknown }).column;
  validateColumnOrExpression(column, 'STRING_AGG', columnList);

  // Validate separator if present
  if ('separator' in (x as object)) {
    const separator = (x as { separator: unknown }).separator;
    if (separator !== undefined && typeof separator !== 'string') {
      throw new TypeError(
        `Invalid STRING_AGG aggregate: 'separator' must be a string, got ${typeof separator}`,
      );
    }
  }

  validateDistinct(x, 'STRING_AGG');
};

/**
 * Type guard to check if a value is a valid STRING_AGG aggregate.
 */
export const isStringAggAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'STRING_AGG' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'STRING_AGG' }> => {
  try {
    assertStringAggAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid ARRAY_AGG aggregate.
 *
 * ARRAY_AGG collects values into an array.
 * Supports optional DISTINCT to collect unique values only.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * const arrayAgg = { type: 'ARRAY_AGG', column: '@id' };
 * assertArrayAggAggregate(arrayAgg, ['id']); // ✓ Valid
 *
 * // With DISTINCT
 * const arrayAggDistinct = {
 *   type: 'ARRAY_AGG',
 *   column: '@category',
 *   distinct: true
 * };
 * assertArrayAggAggregate(arrayAggDistinct, ['category']); // ✓ Valid
 * ```
 */
export const assertArrayAggAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'ARRAY_AGG' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'ARRAY_AGG' }> => {
  baseAggregateValidation(x, 'ARRAY_AGG');

  if (!('column' in (x as object))) {
    throw new TypeError(
      `Invalid ARRAY_AGG aggregate: Missing 'column' property`,
    );
  }

  const column = (x as { column: unknown }).column;
  validateColumnOrExpression(column, 'ARRAY_AGG', columnList);
  validateDistinct(x, 'ARRAY_AGG');
};

/**
 * Type guard to check if a value is a valid ARRAY_AGG aggregate.
 */
export const isArrayAggAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'ARRAY_AGG' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'ARRAY_AGG' }> => {
  try {
    assertArrayAggAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid JSON_ROW aggregate.
 *
 * JSON_ROW aggregates multiple columns into a JSON object with custom keys.
 * Each key maps to either a column reference or an expression.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * const jsonRow = {
 *   type: 'JSON_ROW',
 *   columns: {
 *     userId: '@id',
 *     userName: '@name',
 *     userEmail: '@email'
 *   }
 * };
 * assertJsonRowAggregate(jsonRow, ['id', 'name', 'email']); // ✓ Valid
 *
 * // With expressions
 * const jsonRowExpr = {
 *   type: 'JSON_ROW',
 *   columns: {
 *     fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
 *     age: '@age'
 *   }
 * };
 * assertJsonRowAggregate(jsonRowExpr, ['firstName', 'lastName', 'age']); // ✓ Valid
 * ```
 */
export const assertJsonRowAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'JSON_ROW' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'JSON_ROW' }> => {
  baseAggregateValidation(x, 'JSON_ROW');

  if (!('columns' in (x as object))) {
    throw new TypeError(
      `Invalid JSON_ROW aggregate: Missing 'columns' property`,
    );
  }

  const columns = (x as { columns: unknown }).columns;

  if (
    typeof columns !== 'object' || columns === null || Array.isArray(columns)
  ) {
    throw new TypeError(
      `Invalid JSON_ROW aggregate: 'columns' must be an object (key-value mapping)`,
    );
  }

  // Validate each column mapping
  for (const [key, value] of Object.entries(columns)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError(
        `Invalid JSON_ROW aggregate: Column keys must be non-empty strings`,
      );
    }
    validateColumnOrExpression(value, 'JSON_ROW', columnList);
  }

  // JSON_ROW should not have distinct
  if (
    'distinct' in (x as object) &&
    (x as { distinct: unknown }).distinct !== undefined
  ) {
    throw new TypeError(
      `Invalid JSON_ROW aggregate: 'distinct' is not supported for JSON_ROW`,
    );
  }
};

/**
 * Type guard to check if a value is a valid JSON_ROW aggregate.
 */
export const isJsonRowAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'JSON_ROW' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'JSON_ROW' }> => {
  try {
    assertJsonRowAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid aggregate of any type.
 *
 * This is the top-level validator that delegates to the appropriate
 * specific aggregate validator based on the aggregate type.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid aggregate
 *
 * @example
 * ```ts
 * // Validate any aggregate type
 * const agg1 = { type: 'COUNT' };
 * assertAggregate(agg1); // ✓ Delegates to assertCountAggregate
 *
 * const agg2 = { type: 'SUM', column: '@amount' };
 * assertAggregate(agg2, ['amount']); // ✓ Delegates to assertSumAggregate
 *
 * const agg3 = { type: 'JSON_ROW', columns: { id: '@id', name: '@name' } };
 * assertAggregate(agg3, ['id', 'name']); // ✓ Delegates to assertJsonRowAggregate
 * ```
 */
export const assertAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Aggregates = (
  x: unknown,
  columnList?: string[],
): asserts x is Aggregates => {
  baseAggregateValidation(x);

  const aggregateType = (x as { type: string }).type;

  switch (aggregateType) {
    case 'COUNT':
      assertCountAggregate(x, columnList);
      break;
    case 'SUM':
      assertSumAggregate(x, columnList);
      break;
    case 'AVG':
      assertAvgAggregate(x, columnList);
      break;
    case 'MIN':
      assertMinAggregate(x, columnList);
      break;
    case 'MAX':
      assertMaxAggregate(x, columnList);
      break;
    case 'STRING_AGG':
      assertStringAggAggregate(x, columnList);
      break;
    case 'ARRAY_AGG':
      assertArrayAggAggregate(x, columnList);
      break;
    case 'JSON_ROW':
      assertJsonRowAggregate(x, columnList);
      break;
    default:
      throw new TypeError(
        `Invalid Aggregate type: Unknown aggregate type '${aggregateType}'`,
      );
  }
};

/**
 * Type guard to check if a value is a valid aggregate of any type.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid aggregate, `false` otherwise
 *
 * @example
 * ```ts
 * const value: unknown = getUserInput();
 *
 * if (isAggregate(value)) {
 *   // value is narrowed to Aggregates
 *   console.log(`Aggregate type: ${value.type}`);
 * }
 *
 * // Filter valid aggregates
 * const mixed: unknown[] = getAggregates();
 * const validAggregates = mixed.filter(isAggregate);
 * ```
 */
export const isAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Aggregates = (
  x: unknown,
  columnList?: string[],
): x is Aggregates => {
  try {
    assertAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};
