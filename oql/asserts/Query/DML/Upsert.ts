/**
 * UPSERT Query Validator
 *
 * This module provides validation for UPSERT queries in OQL.
 * UPSERT queries insert new rows or update existing ones based on
 * conflict keys, with support for partial updates on conflict.
 *
 * @module asserts/Query/DML/Upsert
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertExpression } from '../../Expressions/mod.ts';
import { assertColumnIdentifier } from '../../ColumnIdentifier.ts';

/**
 * Asserts that a value is a valid UPSERT query.
 *
 * Validates all UPSERT-specific properties including:
 * - Required: type, table, columns, data, conflictKeys
 * - Optional: schema, updateOnConflict
 *
 * **Validation Rules**:
 * - `type` must be 'UPSERT'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition)
 * - `data` must be single object or array of objects
 * - `data` keys must match columns (plain strings, no @ prefix)
 * - `data` values can be primitives or Expression objects
 * - `conflictKeys` must be non-empty array of column identifiers (with @ prefix)
 * - `conflictKeys` must reference existing columns
 * - `updateOnConflict` (optional) must be array of column identifiers (with @ prefix)
 * - `updateOnConflict` columns must exist in data
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid UPSERT query
 *
 * @example
 * ```ts
 * // Simple UPSERT on primary key
 * const query = {
 *   type: 'UPSERT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email', 'createdAt'],
 *   data: {
 *     id: 1,
 *     name: 'John Doe',
 *     email: 'john@example.com',
 *     createdAt: { type: 'NOW' }
 *   },
 *   conflictKeys: ['@id']
 * };
 * assertUpsertQuery(query); // ✓
 *
 * // UPSERT with partial update on conflict
 * const partial = {
 *   type: 'UPSERT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email', 'createdAt', 'updatedAt'],
 *   data: {
 *     id: 1,
 *     name: 'John',
 *     email: 'john@example.com',
 *     createdAt: { type: 'NOW' },
 *     updatedAt: { type: 'NOW' }
 *   },
 *   conflictKeys: ['@id'],
 *   updateOnConflict: ['@name', '@updatedAt']
 *   // email and createdAt not updated on conflict
 * };
 * assertUpsertQuery(partial); // ✓
 *
 * // UPSERT with composite key
 * const composite = {
 *   type: 'UPSERT',
 *   table: 'user_products',
 *   columns: ['userId', 'productId', 'quantity', 'lastViewed'],
 *   data: {
 *     userId: 1,
 *     productId: 100,
 *     quantity: 1,
 *     lastViewed: { type: 'NOW' }
 *   },
 *   conflictKeys: ['@userId', '@productId'],
 *   updateOnConflict: ['@quantity', '@lastViewed']
 * };
 * assertUpsertQuery(composite); // ✓
 *
 * // Bulk UPSERT
 * const bulk = {
 *   type: 'UPSERT',
 *   table: 'settings',
 *   columns: ['key', 'value'],
 *   conflictKeys: ['@key'],
 *   data: [
 *     { key: 'theme', value: 'dark' },
 *     { key: 'lang', value: 'en' }
 *   ],
 *   conflictKeys: ['key']
 * };
 * assertUpsertQuery(bulk); // ✓
 * ```
 */
export const assertUpsertQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'UPSERT', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'UPSERT', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid UPSERT query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  // Validate type
  if (query.type !== 'UPSERT') {
    throw new TypeError(
      `Invalid UPSERT query: Expected type 'UPSERT', got '${query.type}'`,
    );
  }

  // Validate table
  if (typeof query.table !== 'string' || query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'table' must be a non-empty string`,
    );
  }

  // Validate schema (optional)
  if (query.schema !== undefined) {
    if (
      typeof query.schema !== 'string' || query.schema.trim().length === 0
    ) {
      throw new TypeError(
        `Invalid UPSERT query: 'schema' must be a non-empty string if provided`,
      );
    }
  }

  // Validate columns
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'columns' must be a non-empty array`,
    );
  }

  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid UPSERT query: Each column in 'columns' must be a non-empty string`,
      );
    }
    // Columns should NOT have @ prefix
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid UPSERT query: Columns should be plain strings without '@' prefix. Got '${col}'`,
      );
    }
  }

  const columnList = query.columns as string[];

  // Validate data (single object or array)
  if (query.data === undefined || query.data === null) {
    throw new TypeError(
      `Invalid UPSERT query: 'data' is required`,
    );
  }

  const dataArray = Array.isArray(query.data) ? query.data : [query.data];

  if (dataArray.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'data' cannot be an empty array`,
    );
  }

  // Helper function to validate data object
  const validateDataObject = (
    dataObj: unknown,
    index: number | string,
    label: string,
  ) => {
    if (typeof dataObj !== 'object' || dataObj === null) {
      throw new TypeError(
        `Invalid UPSERT query: ${label}[${index}] must be an object`,
      );
    }

    const data = dataObj as Record<string, unknown>;
    const dataKeys = Object.keys(data);

    if (dataKeys.length === 0) {
      throw new TypeError(
        `Invalid UPSERT query: ${label}[${index}] cannot be empty`,
      );
    }

    // Validate each key/value pair
    for (const [key, value] of Object.entries(data)) {
      // Key must be a plain string (no @ prefix)
      if (key.startsWith('@')) {
        throw new TypeError(
          `Invalid UPSERT query: ${label}[${index}] key '${key}' should not have '@' prefix`,
        );
      }

      // Key must be in columns list
      if (!columnList.includes(key)) {
        throw new TypeError(
          `Invalid UPSERT query: ${label}[${index}] key '${key}' is not in columns list`,
        );
      }

      // Value can be primitive or Expression
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object') {
        try {
          assertExpression(value, columnList);
        } catch (error) {
          throw new TypeError(
            `Invalid UPSERT query: ${label}[${index}].${key} has invalid expression: ${
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
          `Invalid UPSERT query: ${label}[${index}].${key} must be a primitive value, Date, or Expression`,
        );
      }
    }
  };

  // Validate each data object
  for (let i = 0; i < dataArray.length; i++) {
    validateDataObject(dataArray[i], i, 'data');
  }

  // Validate conflictKeys (required) - must be column identifiers
  if (!Array.isArray(query.conflictKeys) || query.conflictKeys.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'conflictKeys' must be a non-empty array`,
    );
  }

  for (const key of query.conflictKeys) {
    try {
      assertColumnIdentifier(key, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid UPSERT query: conflictKeys - ${(error as Error).message}`,
      );
    }
  }

  // Validate updateOnConflict (optional) - must be array of column identifiers
  if (query.updateOnConflict !== undefined) {
    if (!Array.isArray(query.updateOnConflict)) {
      throw new TypeError(
        `Invalid UPSERT query: 'updateOnConflict' must be an array if provided`,
      );
    }

    if (query.updateOnConflict.length === 0) {
      throw new TypeError(
        `Invalid UPSERT query: 'updateOnConflict' cannot be an empty array`,
      );
    }

    // Get first data object to check which columns are available
    const firstData = Array.isArray(query.data) ? query.data[0] : query.data;
    const dataKeys = typeof firstData === 'object' && firstData !== null
      ? Object.keys(firstData as Record<string, unknown>)
      : [];

    for (const identifier of query.updateOnConflict) {
      // Validate column identifier format
      try {
        assertColumnIdentifier(identifier, columnList);
      } catch (error) {
        throw new TypeError(
          `Invalid UPSERT query: updateOnConflict - ${
            (error as Error).message
          }`,
        );
      }

      // Verify the column exists in data
      const columnName = (identifier as string).slice(1); // Remove @ prefix
      if (!dataKeys.includes(columnName)) {
        throw new TypeError(
          `Invalid UPSERT query: updateOnConflict column '${identifier}' (${columnName}) must exist in data`,
        );
      }
    }
  }
};

/**
 * Type guard for UPSERT queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid UPSERT query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'UPSERT', table: 'users', data: { id: 1, name: 'John' }, conflictKeys: ['@id'] };
 * if (isUpsert(query)) {
 *   // query is now typed as Query<'UPSERT', ...>
 *   console.log(query.table);
 * }
 * ```
 */
export const isUpsertQuery = <T extends Query<'UPSERT', any>>(
  x: unknown,
): x is T => {
  try {
    assertUpsertQuery(x as T);
    return true;
  } catch {
    return false;
  }
};
