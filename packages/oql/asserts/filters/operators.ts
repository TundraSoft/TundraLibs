/**
 * Operators Validators
 *
 * This module provides validation functions for the Operators type in OQL filters.
 * Operators handle direct value comparisons, arrays, and operator objects like $eq, $ne, etc.
 *
 * @module asserts/Filters/Operators
 */

import type {
  ColumnTypes as _ColumnTypes,
  Operators as _Operators,
} from '../../types/mod.ts';

/**
 * List of valid comparison operators.
 * @internal
 */
const COMPARISON_OPERATORS: Set<string> = new Set([
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
]);

/**
 * List of valid array operators.
 * @internal
 */
const ARRAY_OPERATORS: Set<string> = new Set(['$in', '$nin', '$between']);

/**
 * List of valid string operators.
 * @internal
 */
const STRING_OPERATORS: Set<string> = new Set([
  '$like',
  '$nlike',
  '$ilike',
  '$nilike',
  '$startsWith',
  '$endsWith',
  '$contains',
]);

/**
 * List of valid null operators.
 * @internal
 */
const NULL_OPERATORS: Set<string> = new Set(['$null']);

/**
 * The column-type hint accepted by {@link assertOperators} for
 * type-specific operator gating (e.g. `$like` only on strings,
 * `$gt` only on numeric / date). Extracted here so the same union
 * doesn't have to be inlined at every helper signature.
 *
 * @internal
 */
type ColumnTypeHint = 'string' | 'number' | 'bigint' | 'date' | 'boolean';

/**
 * Asserts that a value is a valid Operators value.
 *
 * The Operators type supports:
 * - Direct values: null, primitive value, or array of values
 * - Operator objects: { $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $null }
 * - String operators: { $like, $ilike, $startsWith, etc. } (for string columns)
 * - Comparison operators: { $gt, $gte, $lt, $lte } (for numeric/date columns)
 *
 * @param x - The value to validate
 * @param columnType - Optional expected column type (used for type-specific operator validation)
 * @throws {TypeError} If the value is not a valid operator value
 *
 * @example
 * ```ts
 * // Direct values
 * assertOperators(null); // Valid
 * assertOperators(42);
 * assertOperators('text');
 * assertOperators([1, 2, 3]);
 *
 * // Equality operators
 * assertOperators({ $eq: 10 });
 * assertOperators({ $ne: 'test' });
 *
 * // Array operators
 * assertOperators({ $in: [1, 2, 3] });
 * assertOperators({ $nin: ['a', 'b'] });
 *
 * // Comparison operators (numeric/date only)
 * assertOperators({ $gt: 100 }, 'number');
 * assertOperators({ $gte: new Date() }, 'date');
 *
 * // String operators
 * assertOperators({ $like: 'test%' }, 'string');
 * assertOperators({ $startsWith: 'prefix' }, 'string');
 *
 * // Null check
 * assertOperators({ $null: true });
 * ```
 */
export const assertOperators: <T extends _ColumnTypes = _ColumnTypes>(
  x: unknown,
  columnType?: ColumnTypeHint,
) => asserts x is _Operators<T> = <T extends _ColumnTypes = _ColumnTypes>(
  x: unknown,
  columnType?: ColumnTypeHint,
): asserts x is _Operators<T> => {
  // null is valid
  if (x === null) {
    return;
  }

  // Direct primitive value
  if (
    typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean' ||
    typeof x === 'bigint' || x instanceof Date
  ) {
    return;
  }

  // Array of values
  if (Array.isArray(x)) {
    if (x.length === 0) {
      throw new TypeError(
        'Invalid Operators: Array cannot be empty for direct value comparison',
      );
    }
    // Validate all array elements are primitive values
    for (let i = 0; i < x.length; i++) {
      const elem = x[i];
      if (
        typeof elem !== 'string' && typeof elem !== 'number' &&
        typeof elem !== 'boolean' && typeof elem !== 'bigint' &&
        !(elem instanceof Date) && elem !== null
      ) {
        throw new TypeError(
          `Invalid Operators: Array element at index ${i} must be a primitive value, got ${typeof elem}`,
        );
      }
    }
    return;
  }

  // Must be an object at this point
  if (typeof x !== 'object') {
    throw new TypeError(
      `Invalid Operators: Expected null, primitive value, array, or operator object, got ${typeof x}`,
    );
  }

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    throw new TypeError('Invalid Operators: Operator object cannot be empty');
  }

  // Validate each operator — dispatch on category.
  for (const key of keys) {
    validateOperatorEntry(key, obj[key], columnType);
  }
};

/**
 * Per-operator dispatch. Splits the assertOperators body into a small
 * function-of-functions so each branch's cognitive complexity stays low.
 *
 * @internal
 */
const validateOperatorEntry = (
  key: string,
  value: unknown,
  columnType?: ColumnTypeHint,
): void => {
  if (NULL_OPERATORS.has(key)) {
    validateNullOperator(key, value);
    return;
  }
  if (ARRAY_OPERATORS.has(key)) {
    validateArrayOperator(key, value);
    return;
  }
  if (STRING_OPERATORS.has(key)) {
    validateStringOperator(key, value, columnType);
    return;
  }
  if (COMPARISON_OPERATORS.has(key)) {
    validateComparisonOperator(key, value, columnType);
    return;
  }
  throw new TypeError(
    `Invalid Operators: Unknown operator '${key}'. Valid operators are: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $null, $like, $nlike, $ilike, $nilike, $startsWith, $endsWith, $contains`,
  );
};

/** @internal */
const validateNullOperator = (key: string, value: unknown): void => {
  if (typeof value !== 'boolean') {
    throw new TypeError(
      `Invalid Operators: '${key}' operator must be a boolean, got ${typeof value}`,
    );
  }
};

/** @internal */
const validateArrayOperator = (key: string, value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `Invalid Operators: '${key}' operator must have an array value, got ${typeof value}`,
    );
  }
  if (value.length === 0) {
    throw new TypeError(
      `Invalid Operators: '${key}' operator array cannot be empty`,
    );
  }
  if (key === '$between' && value.length !== 2) {
    throw new TypeError(
      `Invalid Operators: '${key}' operator array must have exactly 2 elements, got ${value.length}`,
    );
  }
  for (let i = 0; i < value.length; i++) {
    validateArrayElement(key, i, value[i]);
  }
};

/** @internal */
const validateArrayElement = (
  key: string,
  index: number,
  elem: unknown,
): void => {
  if (elem === null) {
    throw new TypeError(
      `Invalid Operators: '${key}' array element at index ${index} cannot be null — use '$null: true' / '$null: false' for null comparisons`,
    );
  }
  if (
    typeof elem !== 'string' && typeof elem !== 'number' &&
    typeof elem !== 'boolean' && typeof elem !== 'bigint' &&
    !(elem instanceof Date)
  ) {
    throw new TypeError(
      `Invalid Operators: '${key}' array element at index ${index} must be a primitive value, got ${typeof elem}`,
    );
  }
};

/** @internal */
const validateStringOperator = (
  key: string,
  value: unknown,
  columnType?: ColumnTypeHint,
): void => {
  if (columnType && columnType !== 'string') {
    throw new TypeError(
      `Invalid Operators: '${key}' operator is only valid for string columns, not '${columnType}'`,
    );
  }
  if (typeof value === 'string') return;
  if (isExpressionObject(value)) return;
  throw new TypeError(
    `Invalid Operators: '${key}' operator must have a string value or Expression, got ${typeof value}`,
  );
};

/** @internal */
const validateComparisonOperator = (
  key: string,
  value: unknown,
  columnType?: ColumnTypeHint,
): void => {
  if (
    (key === '$gt' || key === '$gte' || key === '$lt' || key === '$lte') &&
    columnType && columnType !== 'number' && columnType !== 'bigint' &&
    columnType !== 'date'
  ) {
    throw new TypeError(
      `Invalid Operators: '${key}' operator is only valid for numeric or date columns, not '${columnType}'`,
    );
  }
  if (value === null) {
    throw new TypeError(
      `Invalid Operators: '${key}' operator value cannot be null — use '$null: true' / '$null: false' for null comparisons`,
    );
  }
  if (
    typeof value === 'string' || typeof value === 'number' ||
    typeof value === 'boolean' || typeof value === 'bigint' ||
    value instanceof Date
  ) return;
  if (isExpressionObject(value)) return;
  throw new TypeError(
    `Invalid Operators: '${key}' operator must have a primitive value, Date, or Expression, got ${typeof value}`,
  );
};

/**
 * Heuristic guard: does `value` look like an OQL Expression?
 * Expressions are non-null objects with a top-level `$$_expression`
 * discriminator. Used here to permit Expression values inside
 * `$eq` / `$ne` / `$gt` / `$lt` / `$like` etc., per the `Operators<T>`
 * type definition.
 *
 * @internal
 */
const isExpressionObject = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && !Array.isArray(value) &&
  !(value instanceof Date) && '$$_expression' in value;

/**
 * Type guard to check if a value is a valid Operators value.
 *
 * @param x - The value to check
 * @param columnType - Optional expected column type
 * @returns True if the value is valid Operators, false otherwise
 *
 * @example
 * ```ts
 * if (isOperators(value)) {
 *   // value is Operators<T>
 * }
 * ```
 */
export const isOperators: <T extends _ColumnTypes = _ColumnTypes>(
  x: unknown,
  columnType?: ColumnTypeHint,
) => x is _Operators<T> = <T extends _ColumnTypes = _ColumnTypes>(
  x: unknown,
  columnType?: ColumnTypeHint,
): x is _Operators<T> => {
  try {
    assertOperators<T>(x, columnType);
    return true;
  } catch {
    return false;
  }
};
