/**
 * Common DML Validation Utilities
 *
 * This module provides shared validation functions used across DML query validators.
 * These are specific to DML operations (INSERT, UPDATE, DELETE, SELECT, COUNT, UPSERT).
 *
 * @module asserts/Query/DML/Common
 */

import { assertExpression } from '../../Expressions/mod.ts';

/**
 * Validates expressions object for DML queries.
 * Ensures it's a non-empty object with plain string keys (no @ prefix) and valid Expression values.
 * Used by UPDATE, DELETE, SELECT, COUNT queries that support pre-declared expressions.
 *
 * @param query - The query object containing the expressions property
 * @param columnList - List of valid column names for expression validation
 * @param context - Context string for error messages (e.g., 'UPDATE', 'SELECT')
 * @returns Array of expression keys (plain strings without @ prefix)
 * @throws {TypeError} If expressions is invalid
 *
 * @example
 * ```ts
 * const query = {
 *   expressions: {
 *     fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] },
 *     totalPrice: { type: 'ADD', args: ['@price', '@tax'] }
 *   }
 * };
 * const exprKeys = assertExpressions(query, ['firstName', 'lastName', 'price', 'tax'], 'SELECT');
 * // Returns ['fullName', 'totalPrice']
 *
 * const invalid = {
 *   expressions: {
 *     '@invalid': { type: 'NOW' }  // @ prefix not allowed
 *   }
 * };
 * assertExpressions(invalid, [], 'SELECT'); // ✗ Throws
 *
 * const empty = { expressions: {} };
 * assertExpressions(empty, [], 'SELECT'); // ✗ Throws (empty object)
 * ```
 */
export const assertExpressions = (
  query: Record<string, unknown>,
  columnList: string[],
  context: string,
): string[] => {
  // expressions is optional, so undefined is valid
  if (query.expressions === undefined) {
    return [];
  }

  // If provided, must be a non-null object (not an array)
  if (
    typeof query.expressions !== 'object' ||
    query.expressions === null ||
    Array.isArray(query.expressions)
  ) {
    throw new TypeError(
      `Invalid ${context} query: 'expressions' must be a non-null object`,
    );
  }

  const expressions = query.expressions as Record<string, unknown>;
  const expressionKeys = Object.keys(expressions);

  // If provided, must not be empty
  if (expressionKeys.length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'expressions' cannot be empty if provided`,
    );
  }

  // Validate each expression
  for (const [key, expr] of Object.entries(expressions)) {
    // Key must NOT start with @ (plain string, referenced with @ in WHERE/projection)
    if (key.startsWith('@')) {
      throw new TypeError(
        `Invalid ${context} query: expression key '${key}' must not start with '@'`,
      );
    }

    // Validate expression value
    try {
      assertExpression(expr, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid ${context} query: expression '${key}' is invalid: ${
          (error as Error).message
        }`,
      );
    }
  }

  return expressionKeys;
};

/**
 * Validates a single data entry (key-value pair) for DML queries.
 * Used by INSERT, UPDATE, and UPSERT to validate data object contents.
 *
 * @param key - The data key to validate
 * @param value - The data value to validate
 * @param columnList - List of valid column names
 * @param context - Context string for error messages (e.g., 'UPDATE', 'INSERT query: data[0]')
 * @param options - Optional validation options
 * @param options.allowColumnReferences - Whether to allow column references in expressions (default: true)
 * @throws {TypeError} If the key or value is invalid
 *
 * @example
 * ```ts
 * // Valid: key in columns, primitive value
 * assertDataEntry('name', 'John', ['id', 'name'], 'INSERT query: data[0]');
 *
 * // Valid: key in columns, expression value
 * assertDataEntry('createdAt', { type: 'NOW' }, ['createdAt'], 'UPDATE');
 *
 * // Invalid: key not in columns
 * assertDataEntry('email', 'test@example.com', ['id', 'name'], 'INSERT query: data[0]'); // ✗ Throws
 *
 * // Invalid: column reference in INSERT (when allowColumnReferences=false)
 * assertDataEntry('count', { type: 'ADD', args: ['@count', 1] }, ['count'], 'INSERT query: data[0]', { allowColumnReferences: false }); // ✗ Throws
 * ```
 */
export const assertDataEntry = (
  key: string,
  value: unknown,
  columnList: string[],
  context: string,
  options?: { allowColumnReferences?: boolean },
): void => {
  // Key must be in columns list (this also ensures no @ prefix since columnList has plain strings)
  if (!columnList.includes(key)) {
    throw new TypeError(
      `Invalid ${context}: key '${key}' is not in columns list`,
    );
  }

  // null/undefined are valid values
  if (value === null || value === undefined) {
    return;
  }

  // Date is a valid value (check before generic object check)
  if (value instanceof Date) {
    return;
  }

  // Object values must be valid Expressions
  if (typeof value === 'object') {
    const allowColumnReferences = options?.allowColumnReferences ?? true;

    try {
      // For INSERT (allowColumnReferences=false), pass undefined to skip column validation
      // For UPDATE/UPSERT (allowColumnReferences=true), pass columnList
      assertExpression(value, allowColumnReferences ? columnList : undefined);

      // If column references are not allowed (INSERT), check for them
      if (!allowColumnReferences) {
        const hasColumnReferences = checkForColumnReferences(value);
        if (hasColumnReferences) {
          throw new TypeError(
            'Column references (e.g., @columnName) are not allowed in INSERT expressions',
          );
        }
      }
    } catch (error) {
      throw new TypeError(
        `Invalid ${context}: ${key} has invalid expression: ${
          (error as Error).message
        }`,
      );
    }
    return;
  }

  // Primitive values must be string, number, boolean, or Date
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean' &&
    !(value instanceof Date)
  ) {
    throw new TypeError(
      `Invalid ${context}: ${key} must be a primitive value, Date, or Expression`,
    );
  }
};

/**
 * Recursively checks if an expression contains any column references.
 * Column references are strings starting with '@'.
 *
 * @param expr - The expression object to check
 * @returns true if any column references are found, false otherwise
 * @internal
 */
const checkForColumnReferences = (expr: unknown): boolean => {
  if (typeof expr === 'string') {
    return expr.startsWith('@');
  }

  if (Array.isArray(expr)) {
    return expr.some((item) => checkForColumnReferences(item));
  }

  if (typeof expr === 'object' && expr !== null) {
    return Object.values(expr).some((value) => checkForColumnReferences(value));
  }

  return false;
};
