/**
 * DELETE Query Validator
 *
 * This module provides validation for DELETE queries in OQL.
 * DELETE queries remove rows from a table based on filter conditions.
 *
 * @module asserts/Query/DML/Delete
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertFilterOperator } from '../../Filters/mod.ts';

/**
 * Asserts that a value is a valid DELETE query.
 *
 * Validates all DELETE-specific properties including:
 * - Required: type, table, columns
 * - Optional: schema, where
 *
 * **Validation Rules**:
 * - `type` must be 'DELETE'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition for validation)
 * - `where` must be valid QueryFilter if present (strongly recommended for safety)
 * - `returnColumns` must be array of strings if present
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
 * // DELETE with complex filter
 * const complex = {
 *   type: 'DELETE',
 *   table: 'logs',
 *   columns: ['id', 'createdAt', 'level'],
 *   where: {
 *     $and: [
 *       { '@level': 'debug' },
 *       { '@createdAt': { $lt: new Date('2024-01-01') } }
 *     ]
 *   }
 * };
 * assertDeleteQuery(complex); // ✓
 *
 * // DELETE with returnColumns
 * const withReturn = {
 *   type: 'DELETE',
 *   table: 'tasks',
 *   columns: ['id', 'status'],
 *   where: { '@status': 'completed' },
 *   returnColumns: ['id', 'status']
 * };
 * assertDeleteQuery(withReturn); // ✓
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

  // Validate where (optional but strongly recommended)
  if (query.where !== undefined) {
    assertFilterOperator(query.where, columnList);
  }

  // Validate returnColumns (optional)
  if (query.returnColumns !== undefined) {
    if (!Array.isArray(query.returnColumns)) {
      throw new TypeError(
        `Invalid DELETE query: 'returnColumns' must be an array if provided`,
      );
    }

    for (const col of query.returnColumns) {
      if (typeof col !== 'string' || col.trim().length === 0) {
        throw new TypeError(
          `Invalid DELETE query: Each column in 'returnColumns' must be a non-empty string`,
        );
      }
    }
  }
};
