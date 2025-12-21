/**
 * Expression Operators Validators
 *
 * This module provides validation functions for the ExpressionOperators type.
 * ExpressionOperators wrap expressions in operator syntax like { $eq: expression }.
 *
 * @module asserts/Filters/ExpressionOperators
 */

import { assertExpression } from '../Expressions/mod.ts';

/**
 * List of operators that support expressions.
 * @internal
 */
const EXPRESSION_OPERATORS = [
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$like',
  '$nlike',
  '$ilike',
  '$nilike',
  '$startsWith',
  '$endsWith',
  '$contains',
];

/**
 * Asserts that a value is a valid ExpressionOperators object.
 *
 * ExpressionOperators wrap expressions in operator keys:
 * - Equality: { $eq: expr }, { $ne: expr }
 * - Comparison (numeric/date): { $gt: expr }, { $gte: expr }, { $lt: expr }, { $lte: expr }
 * - String: { $like: expr }, { $ilike: expr }, { $startsWith: expr }, etc.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @param columnType - Optional expected column type for type-specific validation
 * @throws {TypeError} If the value is not a valid ExpressionOperators object
 *
 * @example
 * ```ts
 * // Equality with expression
 * assertExpressionOperators({
 *   $eq: { type: 'ADD', args: [1, 2] }
 * });
 *
 * // Comparison with expression (numeric columns)
 * assertExpressionOperators({
 *   $gt: { type: 'MULTIPLY', args: ['@price', '@quantity'] }
 * }, ['price', 'quantity'], 'number');
 *
 * // String operator with expression
 * assertExpressionOperators({
 *   $like: { type: 'CONCAT', args: ['%', '@name', '%'] }
 * }, ['name'], 'string');
 * ```
 */
export const assertExpressionOperators = (
  x: unknown,
  columnList?: string[],
  columnType?: 'string' | 'number' | 'bigint' | 'date' | 'boolean',
): void => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid ExpressionOperators: Expected an object, got ${typeof x}`,
    );
  }

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    throw new TypeError(
      'Invalid ExpressionOperators: Object cannot be empty',
    );
  }

  for (const key of keys) {
    // Validate operator key
    if (!EXPRESSION_OPERATORS.includes(key)) {
      throw new TypeError(
        `Invalid ExpressionOperators: Unknown operator '${key}'. Valid operators are: ${
          EXPRESSION_OPERATORS.join(', ')
        }`,
      );
    }

    // Type-specific operator validation
    const isComparisonOp = ['$gt', '$gte', '$lt', '$lte'].includes(key);
    const isStringOp = [
      '$like',
      '$nlike',
      '$ilike',
      '$nilike',
      '$startsWith',
      '$endsWith',
      '$contains',
    ].includes(key);

    if (isComparisonOp && columnType) {
      if (
        columnType !== 'number' && columnType !== 'bigint' &&
        columnType !== 'date'
      ) {
        throw new TypeError(
          `Invalid ExpressionOperators: '${key}' operator is only valid for numeric or date columns, not '${columnType}'`,
        );
      }
    }

    if (isStringOp && columnType) {
      if (columnType !== 'string') {
        throw new TypeError(
          `Invalid ExpressionOperators: '${key}' operator is only valid for string columns, not '${columnType}'`,
        );
      }
    }

    // Validate the expression value
    const value = obj[key];
    if (
      typeof value !== 'object' || value === null || Array.isArray(value)
    ) {
      throw new TypeError(
        `Invalid ExpressionOperators: '${key}' value must be an expression object, got ${typeof value}`,
      );
    }

    try {
      assertExpression(value, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid ExpressionOperators: '${key}' contains invalid expression - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
};

/**
 * Type guard to check if a value is a valid ExpressionOperators object.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names
 * @param columnType - Optional expected column type
 * @returns True if the value is valid ExpressionOperators, false otherwise
 *
 * @example
 * ```ts
 * if (isExpressionOperators(value, ['price', 'quantity'])) {
 *   // value is ExpressionOperators
 * }
 * ```
 */
export const isExpressionOperators = (
  x: unknown,
  columnList?: string[],
  columnType?: 'string' | 'number' | 'bigint' | 'date' | 'boolean',
): boolean => {
  try {
    assertExpressionOperators(x, columnList, columnType);
    return true;
  } catch {
    return false;
  }
};
