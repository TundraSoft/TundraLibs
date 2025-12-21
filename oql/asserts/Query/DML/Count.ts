/**
 * COUNT Query Validator
 *
 * This module provides validation for COUNT queries in OQL.
 * COUNT queries return the number of rows that match filter conditions,
 * optimized for counting without retrieving actual data.
 *
 * @module asserts/Query/DML/Count
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertFilterOperator } from '../../Filters/mod.ts';

/**
 * Asserts that a value is a valid COUNT query.
 *
 * Validates all COUNT-specific properties including:
 * - Required: type, table, columns
 * - Optional: schema, where, distinct
 *
 * **Validation Rules**:
 * - `type` must be 'COUNT'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition for validation)
 * - `where` must be valid QueryFilter if present
 * - `distinct` must be boolean if present (count unique rows only)
 *
 * **Note**: The `columns` property is used for validation of column references
 * in the WHERE clause. COUNT returns a number, not row data.
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid COUNT query
 *
 * @example
 * ```ts
 * // Simple COUNT all rows
 * const query = {
 *   type: 'COUNT',
 *   table: 'users',
 *   columns: ['id', 'status']
 * };
 * assertCountQuery(query); // ✓
 *
 * // COUNT with WHERE filter
 * const filtered = {
 *   type: 'COUNT',
 *   table: 'users',
 *   columns: ['id', 'status', 'createdAt'],
 *   where: {
 *     $and: [
 *       { '@status': 'active' },
 *       { '@createdAt': { $gte: new Date('2024-01-01') } }
 *     ]
 *   }
 * };
 * assertCountQuery(filtered); // ✓
 *
 * // COUNT DISTINCT
 * const distinct = {
 *   type: 'COUNT',
 *   table: 'orders',
 *   columns: ['id', 'userId', 'status'],
 *   where: { '@status': 'completed' },
 *   distinct: true
 * };
 * assertCountQuery(distinct); // ✓
 *
 * // COUNT with complex filter
 * const complex = {
 *   type: 'COUNT',
 *   table: 'products',
 *   columns: ['id', 'price', 'category', 'inStock'],
 *   where: {
 *     $and: [
 *       { '@category': { $in: ['electronics', 'computers'] } },
 *       { '@price': { $lte: 1000 } },
 *       { '@inStock': true }
 *     ]
 *   }
 * };
 * assertCountQuery(complex); // ✓
 * ```
 */
export const assertCountQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'COUNT', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'COUNT', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid COUNT query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  // Validate type
  if (query.type !== 'COUNT') {
    throw new TypeError(
      `Invalid COUNT query: Expected type 'COUNT', got '${query.type}'`,
    );
  }

  // Validate table
  if (typeof query.table !== 'string' || query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid COUNT query: 'table' must be a non-empty string`,
    );
  }

  // Validate schema (optional)
  if (query.schema !== undefined) {
    if (
      typeof query.schema !== 'string' || query.schema.trim().length === 0
    ) {
      throw new TypeError(
        `Invalid COUNT query: 'schema' must be a non-empty string if provided`,
      );
    }
  }

  // Validate columns
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid COUNT query: 'columns' must be a non-empty array`,
    );
  }

  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid COUNT query: Each column in 'columns' must be a non-empty string`,
      );
    }
    // Columns should NOT have @ prefix
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid COUNT query: Columns should be plain strings without '@' prefix. Got '${col}'`,
      );
    }
  }

  const columnList = query.columns as string[];

  // Validate where (optional)
  if (query.where !== undefined) {
    assertFilterOperator(query.where, columnList);
  }

  // Validate distinct (optional)
  if (query.distinct !== undefined) {
    if (typeof query.distinct !== 'boolean') {
      throw new TypeError(
        `Invalid COUNT query: 'distinct' must be a boolean if provided`,
      );
    }
  }
};
