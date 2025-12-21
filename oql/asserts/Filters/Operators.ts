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
const _COMPARISON_OPERATORS = ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'];

/**
 * List of valid array operators.
 * @internal
 */
const _ARRAY_OPERATORS = ['$in', '$nin'];

/**
 * List of valid string operators.
 * @internal
 */
const _STRING_OPERATORS = [
  '$like',
  '$nlike',
  '$ilike',
  '$nilike',
  '$startsWith',
  '$endsWith',
  '$contains',
];

/**
 * List of valid null operators.
 * @internal
 */
const _NULL_OPERATORS = ['$null'];

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
 * assertOperators(42); // ✓
 * assertOperators('text'); // ✓
 * assertOperators([1, 2, 3]); // ✓
 *
 * // Equality operators
 * assertOperators({ $eq: 10 }); // ✓
 * assertOperators({ $ne: 'test' }); // ✓
 *
 * // Array operators
 * assertOperators({ $in: [1, 2, 3] }); // ✓
 * assertOperators({ $nin: ['a', 'b'] }); // ✓
 *
 * // Comparison operators (numeric/date only)
 * assertOperators({ $gt: 100 }, 'number'); // ✓
 * assertOperators({ $gte: new Date() }, 'date'); // ✓
 *
 * // String operators
 * assertOperators({ $like: 'test%' }, 'string'); // ✓
 * assertOperators({ $startsWith: 'prefix' }, 'string'); // ✓
 *
 * // Null check
 * assertOperators({ $null: true }); // ✓
 * ```
 */
export const assertOperators: <T extends _ColumnTypes = _ColumnTypes>(
  x: unknown,
  columnType?: 'string' | 'number' | 'bigint' | 'date' | 'boolean',
) => asserts x is _Operators<T> = <T extends _ColumnTypes = _ColumnTypes>(
  x: unknown,
  columnType?: 'string' | 'number' | 'bigint' | 'date' | 'boolean',
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

  // Validate each operator
  for (const key of keys) {
    const value = obj[key];

    // Check if it's a valid operator key
    const isComparison = _COMPARISON_OPERATORS.includes(key);
    const isArray = _ARRAY_OPERATORS.includes(key);
    const isString = _STRING_OPERATORS.includes(key);
    const isNull = _NULL_OPERATORS.includes(key);

    if (!isComparison && !isArray && !isString && !isNull) {
      throw new TypeError(
        `Invalid Operators: Unknown operator '${key}'. Valid operators are: $eq, $ne, $gt, $gte, $lt, $lte, $in, $nin, $null, $like, $nlike, $ilike, $nilike, $startsWith, $endsWith, $contains`,
      );
    }

    // Validate $null operator
    if (isNull) {
      if (typeof value !== 'boolean') {
        throw new TypeError(
          `Invalid Operators: '$null' operator must be a boolean, got ${typeof value}`,
        );
      }
      continue;
    }

    // Validate array operators
    if (isArray) {
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
      // Validate array elements
      for (let i = 0; i < value.length; i++) {
        const elem = value[i];
        if (
          typeof elem !== 'string' && typeof elem !== 'number' &&
          typeof elem !== 'boolean' && typeof elem !== 'bigint' &&
          !(elem instanceof Date) && elem !== null
        ) {
          throw new TypeError(
            `Invalid Operators: '${key}' array element at index ${i} must be a primitive value, got ${typeof elem}`,
          );
        }
      }
      continue;
    }

    // Validate string operators (only for string columns)
    if (isString) {
      if (columnType && columnType !== 'string') {
        throw new TypeError(
          `Invalid Operators: '${key}' operator is only valid for string columns, not '${columnType}'`,
        );
      }
      if (typeof value !== 'string') {
        throw new TypeError(
          `Invalid Operators: '${key}' operator must have a string value, got ${typeof value}`,
        );
      }
      continue;
    }

    // Validate comparison operators
    if (isComparison) {
      // $gt, $gte, $lt, $lte are only for numeric/date types
      if (['$gt', '$gte', '$lt', '$lte'].includes(key)) {
        if (
          columnType && columnType !== 'number' && columnType !== 'bigint' &&
          columnType !== 'date'
        ) {
          throw new TypeError(
            `Invalid Operators: '${key}' operator is only valid for numeric or date columns, not '${columnType}'`,
          );
        }
      }
      // Value must be a primitive
      if (
        typeof value !== 'string' && typeof value !== 'number' &&
        typeof value !== 'boolean' && typeof value !== 'bigint' &&
        !(value instanceof Date) && value !== null
      ) {
        throw new TypeError(
          `Invalid Operators: '${key}' operator must have a primitive value, got ${typeof value}`,
        );
      }
      continue;
    }
  }
};

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
  columnType?: 'string' | 'number' | 'bigint' | 'date' | 'boolean',
) => x is _Operators<T> = <T extends _ColumnTypes = _ColumnTypes>(
  x: unknown,
  columnType?: 'string' | 'number' | 'bigint' | 'date' | 'boolean',
): x is _Operators<T> => {
  try {
    assertOperators<T>(x, columnType);
    return true;
  } catch {
    return false;
  }
};
