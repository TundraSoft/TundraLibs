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
import { assertQueryFilter } from '../../Filters/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../Common.ts';
import { assertExpressions } from './Common.ts';

/**
 * Asserts that a value is a valid COUNT query.
 *
 * Validates all COUNT-specific properties including:
 * - Required: type, table, columns
 * - Optional: schema, expressions, where
 *
 * **Validation Rules**:
 * - `type` must be 'COUNT'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition for validation)
 * - `expressions` must be Record<string, Expression> if present (pre-declared expressions)
 * - `where` can reference columns and expressions
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
 * // COUNT with pre-declared expression
 * const withExpr = {
 *   type: 'COUNT',
 *   table: 'orders',
 *   columns: ['id', 'userId', 'status', 'total', 'discount'],
 *   expressions: {
 *     finalPrice: { type: 'SUBTRACT', args: ['@total', '@discount'] }
 *   },
 *   where: {
 *     $and: [
 *       { '@status': 'completed' },
 *       { '@finalPrice': { $gte: 100 } }
 *     ]
 *   }
 * };
 * assertCountQuery(withExpr); // ✓
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

  // Validate basic properties using common functions
  assertQueryType(query, 'COUNT', 'COUNT');
  assertTableName(query, 'COUNT');
  assertSchemaName(query, 'COUNT');
  const columnList = assertColumns(query, 'COUNT');

  // Validate expressions (optional) and collect expression keys
  const expressionKeys = assertExpressions(query, columnList, 'COUNT');

  // Collect available keys for WHERE clause: columns + expressions
  // Note: assertFilterOperator expects column names WITHOUT @ prefix
  const availableKeys = [...columnList, ...expressionKeys];

  // Validate where (optional)
  // WHERE can reference columns and expressions
  if (query.where !== undefined) {
    assertQueryFilter(query.where, availableKeys);
  }
};

/**
 * Type guard for COUNT queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid COUNT query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'COUNT', table: 'users', where: { '@active': true } };
 * if (isCount(query)) {
 *   // query is now typed as Query<'COUNT', ...>
 *   console.log(query.table);
 * }
 * ```
 */
export const isCountQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'COUNT', PT> => {
  try {
    assertCountQuery(x);
    return true;
  } catch {
    return false;
  }
};
