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
import { assertQueryFilter } from '../../Filters/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../Common.ts';
import { assertDataEntry, assertExpressions } from './Common.ts';

/**
 * Validates the data object structure and contents.
 * Helper function to reduce cognitive complexity of main validator.
 *
 * @param query - The query object containing the data property
 * @param columnList - List of valid column names
 * @throws {TypeError} If the data is invalid
 * @internal
 */
const validateData = (
  query: Record<string, unknown>,
  columnList: string[],
): void => {
  // Validate data (must be object with at least one property)
  if (
    !query.data || typeof query.data !== 'object' || Array.isArray(query.data)
  ) {
    throw new TypeError(
      `Invalid UPDATE query: 'data' must be a non-null object (not an array)`,
    );
  }

  if (Object.keys(query.data).length === 0) {
    throw new TypeError(
      `Invalid UPDATE query: 'data' must have at least one property`,
    );
  }

  // Validate each key/value pair using common function
  for (const [key, value] of Object.entries(query.data)) {
    assertDataEntry(key, value, columnList, 'UPDATE query: data');
  }
};

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

  // Validate basic properties using common functions
  assertQueryType(query, 'UPDATE', 'UPDATE');
  assertTableName(query, 'UPDATE');
  assertSchemaName(query, 'UPDATE');
  const columnList = assertColumns(query, 'UPDATE');

  // Validate expressions (optional) and collect expression keys
  const expressionKeys = assertExpressions(query, columnList, 'UPDATE');

  // Collect available keys for WHERE clause: columns + expressions
  const availableKeys = [...columnList, ...expressionKeys];

  // Validate data using helper function
  validateData(query, columnList);

  // Validate where (optional but recommended)
  // WHERE can reference columns and expressions
  if (query.where !== undefined) {
    assertQueryFilter(query.where, availableKeys);
  }
};

/**
 * Type guard for UPDATE queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid UPDATE query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'UPDATE', table: 'users', data: { name: 'John' } };
 * if (isUpdate(query)) {
 *   // query is now typed as Query<'UPDATE', ...>
 *   console.log(query.table);
 * }
 * ```
 */
export const isUpdateQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'UPDATE', PT> => {
  try {
    assertUpdateQuery(x);
    return true;
  } catch {
    return false;
  }
};
