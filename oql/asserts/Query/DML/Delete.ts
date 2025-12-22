/**
 * DELETE Query Validator
 *
 * This module provides validation for DELETE queries in OQL.
 * DELETE queries remove rows from a table based on filter conditions.
 *
 * @module asserts/Query/DML/Delete
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertQueryFilter } from '../../Filters/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../Common.ts';
import { assertExpressions } from './Common.ts';

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

  // Validate basic properties using common functions
  assertQueryType(query, 'DELETE', 'DELETE');
  assertTableName(query, 'DELETE');
  assertSchemaName(query, 'DELETE');
  const columnList = assertColumns(query, 'DELETE');

  // Validate expressions (optional) and collect expression keys
  const expressionKeys = assertExpressions(query, columnList, 'DELETE');

  // Collect available keys for WHERE clause: columns + expressions
  // Note: assertFilterOperator expects column names WITHOUT @ prefix
  const availableKeys = [...columnList, ...expressionKeys];

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
export const isDeleteQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'DELETE', PT> => {
  try {
    assertDeleteQuery(x);
    return true;
  } catch {
    return false;
  }
};
