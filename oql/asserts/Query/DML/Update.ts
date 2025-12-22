/**
 * UPDATE Query Validator
 *
 * This module provides validation for UPDATE queries in OQL.
 * UPDATE queries modify existing rows in a table with support for
 * partial updates and expressions in column values.
 *
 * @module asserts/Query/DML/Update
 */

import type { Query, TableType } from '../../../types/mod.ts';
import {
  assertFilterOperator,
  assertQueryFilter,
} from '../../Filters/mod.ts';
import { assertExpression } from '../../Expressions/mod.ts';

/**
 * Asserts that a value is a valid UPDATE query.
 *
 * Validates all UPDATE-specific properties including:
 * - Required: type, table, columns, data
 * - Optional: schema, expressions, where
 *
 * **Validation Rules**:
 * - `type` must be 'UPDATE'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition)
 * - `expressions` must be Record<string, Expression> if present (pre-declared expressions)
 * - `data` must be an object with at least one property (partial update)
 * - `data` keys must be subset of columns (plain strings, no @ prefix)
 * - `data` values can be primitives or Expression objects
 * - `where` can reference columns and expressions (if defined)
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid UPDATE query
 *
 * @example
 * ```ts
 * // Simple UPDATE with WHERE clause
 * const query = {
 *   type: 'UPDATE',
 *   table: 'users',
 *   columns: ['id', 'name', 'email', 'updatedAt'],
 *   data: {
 *     email: 'newemail@example.com',
 *     updatedAt: { type: 'NOW' }
 *   },
 *   where: { '@id': 1 }
 * };
 * assertUpdateQuery(query); // ✓
 *
 * // UPDATE with pre-declared expression in WHERE
 * const withExpr = {
 *   type: 'UPDATE',
 *   table: 'products',
 *   columns: ['id', 'price', 'discount', 'tax'],
 *   expressions: {
 *     totalPrice: { type: 'ADD', args: ['@price', '@tax'] }
 *   },
 *   data: {
 *     price: { type: 'MULTIPLY', args: ['@price', 0.9] }
 *   },
 *   where: { '@totalPrice': { $gt: 100 } }
 * };
 * assertUpdateQuery(withExpr); // ✓
 *
 * // UPDATE all rows (no WHERE - risky but valid)
 * const updateAll = {
 *   type: 'UPDATE',
 *   table: 'settings',
 *   columns: ['key', 'value', 'lastSync'],
 *   data: {
 *     lastSync: { type: 'NOW' }
 *   }
 * };
 * assertUpdateQuery(updateAll); // ✓ (but potentially dangerous)
 * ```
 */
export const assertUpdateQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'UPDATE', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'UPDATE', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid UPDATE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  // Validate type
  if (query.type !== 'UPDATE') {
    throw new TypeError(
      `Invalid UPDATE query: Expected type 'UPDATE', got '${query.type}'`,
    );
  }

  // Validate table
  if (typeof query.table !== 'string' || query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid UPDATE query: 'table' must be a non-empty string`,
    );
  }

  // Validate schema (optional)
  if (query.schema !== undefined) {
    if (
      typeof query.schema !== 'string' || query.schema.trim().length === 0
    ) {
      throw new TypeError(
        `Invalid UPDATE query: 'schema' must be a non-empty string if provided`,
      );
    }
  }

  // Validate columns
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid UPDATE query: 'columns' must be a non-empty array`,
    );
  }

  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid UPDATE query: Each column in 'columns' must be a non-empty string`,
      );
    }
    // Columns should NOT have @ prefix
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid UPDATE query: Columns should be plain strings without '@' prefix. Got '${col}'`,
      );
    }
  }

  const columnList = query.columns as string[];

  // Validate expressions (optional)
  if (query.expressions !== undefined) {
    if (
      typeof query.expressions !== 'object' ||
      query.expressions === null ||
      Array.isArray(query.expressions)
    ) {
      throw new TypeError(
        `Invalid UPDATE query: 'expressions' must be a non-null object`,
      );
    }

    const expressions = query.expressions as Record<string, unknown>;
    const expressionKeys = Object.keys(expressions);

    if (expressionKeys.length === 0) {
      throw new TypeError(
        `Invalid UPDATE query: 'expressions' cannot be empty if provided`,
      );
    }

    // Validate each expression
    for (const [key, expr] of Object.entries(expressions)) {
      // Key must NOT start with @ (plain string, referenced with @ in WHERE)
      if (key.startsWith('@')) {
        throw new TypeError(
          `Invalid UPDATE query: expression key '${key}' must not start with '@'`,
        );
      }

      // Validate expression value
      try {
        assertExpression(expr, columnList);
      } catch (error) {
        throw new TypeError(
          `Invalid UPDATE query: expression '${key}' is invalid: ${
            (error as Error).message
          }`,
        );
      }
    }
  }

  // Collect available keys for WHERE clause: columns + expressions
  // Note: assertFilterOperator expects column names WITHOUT @ prefix
  const availableKeys = [...columnList];
  if (query.expressions !== undefined) {
    const expressions = query.expressions as Record<string, unknown>;
    // Expression keys are plain strings (e.g., 'fullName'), add directly
    availableKeys.push(...Object.keys(expressions));
  }

  // Validate data (must be object with at least one property)
  if (
    !query.data || typeof query.data !== 'object' || Array.isArray(query.data)
  ) {
    throw new TypeError(
      `Invalid UPDATE query: 'data' must be a non-null object (not an array)`,
    );
  }

  const data = query.data as Record<string, unknown>;
  const dataKeys = Object.keys(data);

  if (dataKeys.length === 0) {
    throw new TypeError(
      `Invalid UPDATE query: 'data' must have at least one property`,
    );
  }

  // Validate each key/value pair
  for (const [key, value] of Object.entries(data)) {
    // Key must be a plain string (no @ prefix)
    if (key.startsWith('@')) {
      throw new TypeError(
        `Invalid UPDATE query: data key '${key}' should not have '@' prefix`,
      );
    }

    // Key must be in columns list
    if (!columnList.includes(key)) {
      throw new TypeError(
        `Invalid UPDATE query: data key '${key}' is not in columns list`,
      );
    }

    // Value can be primitive or Expression
    if (value === null || value === undefined) {
      // null/undefined are valid values
      continue;
    }

    if (typeof value === 'object') {
      // Must be an Expression
      try {
        assertExpression(value, columnList);
      } catch (error) {
        throw new TypeError(
          `Invalid UPDATE query: data.${key} has invalid expression: ${
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
        `Invalid UPDATE query: data.${key} must be a primitive value, Date, or Expression`,
      );
    }
  }

  // Validate where (optional but recommended)
  // WHERE can reference columns and expressions
  if (query.where !== undefined) {
    assertQueryFilter(query.where, availableKeys);
  }
};
