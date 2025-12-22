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
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../Common.ts';
import { assertDataEntry } from './Common.ts';

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

  // Validate basic properties using common functions
  assertQueryType(query, 'INSERT', 'INSERT');
  assertTableName(query, 'INSERT');
  assertSchemaName(query, 'INSERT');
  const columnList = assertColumns(query, 'INSERT');

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
      assertDataEntry(
        key,
        value,
        columnList,
        `INSERT query: data[${i}]`,
        { allowColumnReferences: false },
      );
    }
  }
};

/**
 * Type guard for INSERT queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid INSERT query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'INSERT', table: 'users', data: { name: 'John' } };
 * if (isInsert(query)) {
 *   // query is now typed as Query<'INSERT', ...>
 *   console.log(query.table);
 * }
 * ```
 */
export const isInsertQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'INSERT', PT> => {
  try {
    assertInsertQuery(x);
    return true;
  } catch {
    return false;
  }
};
