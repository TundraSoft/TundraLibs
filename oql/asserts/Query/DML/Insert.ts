/**
 * INSERT Query Validator
 *
 * This module provides validation for INSERT queries in OQL.
 * INSERT queries add new rows to a table with support for expressions
 * in column values.
 *
 * @module asserts/Query/DML/Insert
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertExpression } from '../../Expressions/mod.ts';

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

/**
 * Asserts that a value is a valid INSERT query.
 *
 * Validates all INSERT-specific properties including:
 * - Required: type, table, columns, data
 * - Optional: schema
 *
 * **Validation Rules**:
 * - `type` must be 'INSERT'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition)
 * - `data` must be single object or array of objects
 * - `data` keys must match columns (plain strings, no @ prefix)
 * - `data` values can be primitives or Expression objects
 * - `returnColumns` must be array of strings if present
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid INSERT query
 *
 * @example
 * ```ts
 * // Simple INSERT with literals
 * const query = {
 *   type: 'INSERT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email'],
 *   data: {
 *     id: 1,
 *     name: 'John Doe',
 *     email: 'john@example.com'
 *   }
 * };
 * assertInsertQuery(query); // ✓
 *
 * // INSERT with expressions
 * const withExpr = {
 *   type: 'INSERT',
 *   table: 'users',
 *   columns: ['id', 'name', 'createdAt'],
 *   data: {
 *     id: 1,
 *     name: 'John',
 *     createdAt: { type: 'NOW' }
 *   }
 * };
 * assertInsertQuery(withExpr); // ✓
 *
 * // Bulk INSERT (array of objects)
 * const bulk = {
 *   type: 'INSERT',
 *   table: 'users',
 *   columns: ['id', 'name'],
 *   data: [
 *     { id: 1, name: 'John' },
 *     { id: 2, name: 'Jane' }
 *   ]
 * };
 * assertInsertQuery(bulk); // ✓
 * ```
 */
export const assertInsertQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'INSERT', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'INSERT', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid INSERT query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  // Validate type
  if (query.type !== 'INSERT') {
    throw new TypeError(
      `Invalid INSERT query: Expected type 'INSERT', got '${query.type}'`,
    );
  }

  // Validate table
  if (typeof query.table !== 'string' || query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid INSERT query: 'table' must be a non-empty string`,
    );
  }

  // Validate schema (optional)
  if (query.schema !== undefined) {
    if (
      typeof query.schema !== 'string' || query.schema.trim().length === 0
    ) {
      throw new TypeError(
        `Invalid INSERT query: 'schema' must be a non-empty string if provided`,
      );
    }
  }

  // Validate columns
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid INSERT query: 'columns' must be a non-empty array`,
    );
  }

  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid INSERT query: Each column in 'columns' must be a non-empty string`,
      );
    }
    // Columns should NOT have @ prefix
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid INSERT query: Columns should be plain strings without '@' prefix. Got '${col}'`,
      );
    }
  }

  const columnList = query.columns as string[];

  // Validate data (single object or array)
  if (query.data === undefined || query.data === null) {
    throw new TypeError(
      `Invalid INSERT query: 'data' is required`,
    );
  }

  const dataArray = Array.isArray(query.data) ? query.data : [query.data];

  if (dataArray.length === 0) {
    throw new TypeError(
      `Invalid INSERT query: 'data' cannot be an empty array`,
    );
  }

  // Validate each data object
  for (let i = 0; i < dataArray.length; i++) {
    const dataObj = dataArray[i];

    if (typeof dataObj !== 'object' || dataObj === null) {
      throw new TypeError(
        `Invalid INSERT query: data[${i}] must be an object`,
      );
    }

    const data = dataObj as Record<string, unknown>;
    const dataKeys = Object.keys(data);

    if (dataKeys.length === 0) {
      throw new TypeError(
        `Invalid INSERT query: data[${i}] cannot be empty`,
      );
    }

    // Validate each key/value pair
    for (const [key, value] of Object.entries(data)) {
      // Key must be a plain string (no @ prefix)
      if (key.startsWith('@')) {
        throw new TypeError(
          `Invalid INSERT query: data[${i}] key '${key}' should not have '@' prefix`,
        );
      }

      // Key must be in columns list
      if (!columnList.includes(key)) {
        throw new TypeError(
          `Invalid INSERT query: data[${i}] key '${key}' is not in columns list`,
        );
      }

      // Value can be primitive or Expression
      if (value === null || value === undefined) {
        // null/undefined are valid values
        continue;
      }

      if (typeof value === 'object') {
        // Must be an Expression (no column references allowed in INSERT)
        try {
          // Pass undefined to skip column validation during expression parsing
          // Then check if the expression contains any column references
          assertExpression(value);

          // Validate that the expression doesn't reference any columns
          const hasColumnReferences = checkForColumnReferences(value);
          if (hasColumnReferences) {
            throw new TypeError(
              'Column references (e.g., @columnName) are not allowed in INSERT expressions',
            );
          }
        } catch (error) {
          throw new TypeError(
            `Invalid INSERT query: data[${i}].${key} has invalid expression: ${
              (error as Error).message
            }`,
          );
        }
      } else if (
        typeof value !== 'string' &&
        typeof value !== 'number' &&
        typeof value !== 'boolean' &&
        !(value instanceof Date)
      ) {
        throw new TypeError(
          `Invalid INSERT query: data[${i}].${key} must be a primitive value, Date, or Expression`,
        );
      }
    }
  }
};
