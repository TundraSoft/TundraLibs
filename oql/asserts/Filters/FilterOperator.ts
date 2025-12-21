/**
 * FilterOperator and QueryFilter Validators
 *
 * This module provides validation functions for FilterOperator and QueryFilter types.
 * These handle the complete filter syntax including operators, expressions, and logical operators.
 *
 * @module asserts/Filters/FilterOperator
 */

import type {
  FilterOperator,
  QueryFilter,
  TableType,
} from '../../types/mod.ts';
import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import { isOperators } from './Operators.ts';
import { isExpressionOperators } from './ExpressionOperators.ts';

/**
 * Asserts that a value is a valid FilterOperator.
 *
 * FilterOperator maps column identifiers to their filter values, which can be:
 * - Operators (direct values or operator objects)
 * - ExpressionOperators (operators wrapping expressions)
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @throws {TypeError} If the value is not a valid FilterOperator
 *
 * @example
 * ```ts
 * // Direct value
 * assertFilterOperator({ '@age': 25 }, ['age']);
 *
 * // Operator object
 * assertFilterOperator({ '@price': { $gt: 100 } }, ['price']);
 *
 * // Expression operator
 * assertFilterOperator({
 *   '@total': { $eq: { type: 'ADD', args: ['@price', '@tax'] } }
 * }, ['price', 'tax', 'total']);
 * ```
 */
export const assertFilterOperator: <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
) => asserts x is FilterOperator<T> = <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
): asserts x is FilterOperator<T> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid FilterOperator: Expected an object, got ${typeof x}`,
    );
  }

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    throw new TypeError('Invalid FilterOperator: Object cannot be empty');
  }

  for (const [key, value] of Object.entries(obj)) {
    // Validate column identifier
    try {
      assertColumnIdentifier(key, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid FilterOperator: Key '${key}' is not a valid column identifier - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Value can be:
    // 1. Direct Operators (null, value, array, or operator object)
    // 2. ExpressionOperators (operators wrapping expressions)

    // Try as ExpressionOperators first (operators with expression values)
    if (isExpressionOperators(value, columnList)) {
      continue;
    }

    // Try as regular Operators
    if (isOperators(value)) {
      continue;
    }

    throw new TypeError(
      `Invalid FilterOperator: Value for '${key}' must be either Operators or ExpressionOperators`,
    );
  }
};

/**
 * Type guard for FilterOperator.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names
 * @returns True if the value is a valid FilterOperator, false otherwise
 */
export const isFilterOperator: <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
) => x is FilterOperator<T> = <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
): x is FilterOperator<T> => {
  try {
    assertFilterOperator<T>(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Maximum allowed nesting depth for QueryFilter to prevent stack overflow.
 * @internal
 */
const MAX_QUERY_FILTER_DEPTH = 10;

/**
 * Asserts that a value is a valid QueryFilter.
 *
 * QueryFilter extends FilterOperator with logical operators:
 * - $and: Array of QueryFilter (all conditions must match)
 * - $or: Array of QueryFilter (at least one condition must match)
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @param depth - Current recursion depth (internal use, default: 0)
 * @param maxDepth - Maximum allowed recursion depth (default: 10)
 * @throws {TypeError} If the value is not a valid QueryFilter
 * @throws {TypeError} If maximum nesting depth is exceeded
 *
 * @example
 * ```ts
 * // Simple filter
 * assertQueryFilter({ '@age': { $gt: 18 } }, ['age']);
 *
 * // Logical AND
 * assertQueryFilter({
 *   $and: [
 *     { '@age': { $gte: 18 } },
 *     { '@status': 'active' }
 *   ]
 * }, ['age', 'status']);
 *
 * // Logical OR
 * assertQueryFilter({
 *   $or: [
 *     { '@role': 'admin' },
 *     { '@role': 'moderator' }
 *   ]
 * }, ['role']);
 *
 * // Mixed: filter + logical operators
 * assertQueryFilter({
 *   '@status': 'active',
 *   $or: [
 *     { '@age': { $lt: 18 } },
 *     { '@age': { $gt: 65 } }
 *   ]
 * }, ['status', 'age']);
 * ```
 */
export const assertQueryFilter: <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is QueryFilter<T> = <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = MAX_QUERY_FILTER_DEPTH,
): asserts x is QueryFilter<T> => {
  // Check recursion depth limit
  if (depth > maxDepth) {
    throw new TypeError(
      `QueryFilter exceeds maximum nesting depth of ${maxDepth}. ` +
        `This may indicate overly complex query or circular reference.`,
    );
  }
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid QueryFilter: Expected an object, got ${typeof x}`,
    );
  }

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    throw new TypeError('Invalid QueryFilter: Object cannot be empty');
  }

  // Separate logical operators from filter properties
  const logicalKeys: string[] = [];
  const filterKeys: string[] = [];

  for (const key of keys) {
    if (key === '$and' || key === '$or') {
      logicalKeys.push(key);
    } else {
      filterKeys.push(key);
    }
  }

  // Validate logical operators
  for (const logicalKey of logicalKeys) {
    const value = obj[logicalKey];

    if (!Array.isArray(value)) {
      throw new TypeError(
        `Invalid QueryFilter: '${logicalKey}' must be an array, got ${typeof value}`,
      );
    }

    if (value.length === 0) {
      throw new TypeError(
        `Invalid QueryFilter: '${logicalKey}' array cannot be empty`,
      );
    }

    // Recursively validate each QueryFilter in the array
    for (let i = 0; i < value.length; i++) {
      try {
        assertQueryFilter<T>(value[i], columnList, depth + 1, maxDepth);
      } catch (error) {
        throw new TypeError(
          `Invalid QueryFilter: '${logicalKey}' element at index ${i} is invalid - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  // Validate filter properties (if any)
  if (filterKeys.length > 0) {
    const filterObj: Record<string, unknown> = {};
    for (const key of filterKeys) {
      filterObj[key] = obj[key];
    }

    try {
      assertFilterOperator<T>(filterObj, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid QueryFilter: Filter properties are invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
};

/**
 * Type guard for QueryFilter.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names
 * @param depth - Current recursion depth (internal use, default: 0)
 * @param maxDepth - Maximum allowed recursion depth (default: 10)
 * @returns True if the value is a valid QueryFilter, false otherwise
 *
 * @example
 * ```ts
 * if (isQueryFilter(value, ['age', 'status'])) {
 *   // value is QueryFilter<T>
 *   // Can safely use with database queries
 * }
 * ```
 */
export const isQueryFilter: <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => x is QueryFilter<T> = <T extends TableType = TableType>(
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = MAX_QUERY_FILTER_DEPTH,
): x is QueryFilter<T> => {
  try {
    assertQueryFilter<T>(x, columnList, depth, maxDepth);
    return true;
  } catch {
    return false;
  }
};
