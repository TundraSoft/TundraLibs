/**
 * DELETE Query Validator
 *
 * This module provides validation for DELETE queries in OQL.
 * DELETE queries remove rows from a table based on filter conditions.
 *
 * @module asserts/Query/DML/Delete
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertFilterOperator, assertQueryFilter } from '../../Filters/mod.ts';
import { assertExpression } from '../../Expressions/mod.ts';

/**
 * Asserts that a value is a valid DELETE query.
 *
 * Validates all DELETE-specific properties including:
 * - Required: type, table, columns
 * - Optional: schema, expressions, where
 *
 * **Validation Rules**:
 * - `type` must be 'DELETE'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition for validation)
 * - `expressions` must be Record<string, Expression> if present (pre-declared expressions)
 * - `where` can reference columns and expressions (strongly recommended for safety)
 *
 * **Safety Note**: DELETE without WHERE clause will remove ALL rows from the table.
 * While this is syntactically valid, it's potentially dangerous in production.
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid DELETE query
 *
 * @example
 * ```ts
 * // DELETE with WHERE clause
 * const query = {
 *   type: 'DELETE',
 *   table: 'users',
 *   columns: ['id', 'status', 'lastLogin'],
 *   where: { '@status': 'inactive' }
 * };
 * assertDeleteQuery(query); // ✓
 *
 * // DELETE with pre-declared expression
 * const complex = {
 *   type: 'DELETE',
 *   table: 'logs',
 *   columns: ['id', 'createdAt', 'level', 'size'],
 *   expressions: {
 *     isOld: {
 *       type: 'LT',
 *       args: ['@createdAt', new Date('2024-01-01')]
 *     }
 *   },
 *   where: {
 *     $and: [
 *       { '@level': 'debug' },
 *       { '@isOld': true }
 *     ]
 *   }
 * };
 * assertDeleteQuery(complex); // ✓
 *
 * // DELETE all rows (no WHERE - risky but valid)
 * const deleteAll = {
 *   type: 'DELETE',
 *   table: 'temp_data',
 *   columns: ['id', 'data']
 * };
 * assertDeleteQuery(deleteAll); // ✓ (but potentially dangerous)
 * ```
 */
export const assertDeleteQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'DELETE', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'DELETE', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid DELETE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  // Validate type
  if (query.type !== 'DELETE') {
    throw new TypeError(
      `Invalid DELETE query: Expected type 'DELETE', got '${query.type}'`,
    );
  }

  // Validate table
  if (typeof query.table !== 'string' || query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid DELETE query: 'table' must be a non-empty string`,
    );
  }

  // Validate schema (optional)
  if (query.schema !== undefined) {
    if (
      typeof query.schema !== 'string' || query.schema.trim().length === 0
    ) {
      throw new TypeError(
        `Invalid DELETE query: 'schema' must be a non-empty string if provided`,
      );
    }
  }

  // Validate columns
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid DELETE query: 'columns' must be a non-empty array`,
    );
  }

  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid DELETE query: Each column in 'columns' must be a non-empty string`,
      );
    }
    // Columns should NOT have @ prefix
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid DELETE query: Columns should be plain strings without '@' prefix. Got '${col}'`,
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
        `Invalid DELETE query: 'expressions' must be a non-null object`,
      );
    }

    const expressions = query.expressions as Record<string, unknown>;
    const expressionKeys = Object.keys(expressions);

    if (expressionKeys.length === 0) {
      throw new TypeError(
        `Invalid DELETE query: 'expressions' cannot be empty if provided`,
      );
    }

    // Validate each expression
    for (const [key, expr] of Object.entries(expressions)) {
      // Key must NOT start with @ (plain string, referenced with @ in WHERE)
      if (key.startsWith('@')) {
        throw new TypeError(
          `Invalid DELETE query: expression key '${key}' must not start with '@'`,
        );
      }

      // Validate expression value
      try {
        assertExpression(expr, columnList);
      } catch (error) {
        throw new TypeError(
          `Invalid DELETE query: expression '${key}' is invalid: ${
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
    // Expression keys are plain strings (e.g., 'isOld'), add directly
    availableKeys.push(...Object.keys(expressions));
  }

  // Validate where (optional but strongly recommended)
  // WHERE can reference columns and expressions
  if (query.where !== undefined) {
    assertQueryFilter(query.where, availableKeys);
  }
};

/**
 * Type guard for DELETE queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid DELETE query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'DELETE', table: 'users', where: { '@id': 1 } };
 * if (isDelete(query)) {
 *   // query is now typed as Query<'DELETE', ...>
 *   console.log(query.table);
 * }
 * ```
 */
export const isDeleteQuery = <T extends Query<'DELETE', any>>(
  x: unknown,
): x is T => {
  try {
    assertDeleteQuery(x as T);
    return true;
  } catch {
    return false;
  }
};
