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

/**
 * Asserts that a value is a valid UPSERT query.
 *
 * Validates all UPSERT-specific properties including:
 * - Required: type, table, columns, data, conflictKeys
 * - Optional: schema, updateOnConflict, returnColumns
 *
 * **Validation Rules**:
 * - `type` must be 'UPSERT'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition)
 * - `data` must be single object or array of objects
 * - `data` keys must match columns (plain strings, no @ prefix)
 * - `data` values can be primitives or Expression objects
 * - `conflictKeys` must be non-empty array of column names
 * - `conflictKeys` must be subset of columns
 * - `updateOnConflict` (optional) must be object with subset of columns
 * - `updateOnConflict` values can be primitives or Expression objects
 * - `returnColumns` must be array of strings if present
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
 *   conflictKeys: ['id']
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
 *   conflictKeys: ['id'],
 *   updateOnConflict: {
 *     name: 'John',
 *     updatedAt: { type: 'NOW' }
 *     // email and createdAt not updated on conflict
 *   }
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
 *   conflictKeys: ['userId', 'productId'],
 *   updateOnConflict: {
 *     quantity: { type: 'ADD', args: ['@quantity', 1] },
 *     lastViewed: { type: 'NOW' }
 *   }
 * };
 * assertUpsertQuery(composite); // ✓
 *
 * // Bulk UPSERT
 * const bulk = {
 *   type: 'UPSERT',
 *   table: 'settings',
 *   columns: ['key', 'value'],
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

  // Validate conflictKeys (required)
  if (!Array.isArray(query.conflictKeys) || query.conflictKeys.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'conflictKeys' must be a non-empty array`,
    );
  }

  for (const key of query.conflictKeys) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new TypeError(
        `Invalid UPSERT query: Each conflictKey must be a non-empty string`,
      );
    }

    // Conflict keys should NOT have @ prefix
    if ((key as string).startsWith('@')) {
      throw new TypeError(
        `Invalid UPSERT query: conflictKeys should be plain strings without '@' prefix. Got '${key}'`,
      );
    }

    // Conflict key must be in columns list
    if (!columnList.includes(key as string)) {
      throw new TypeError(
        `Invalid UPSERT query: conflictKey '${key}' is not in columns list`,
      );
    }
  }

  // Validate updateOnConflict (optional)
  if (query.updateOnConflict !== undefined) {
    if (
      typeof query.updateOnConflict !== 'object' ||
      query.updateOnConflict === null ||
      Array.isArray(query.updateOnConflict)
    ) {
      throw new TypeError(
        `Invalid UPSERT query: 'updateOnConflict' must be a non-null object (not an array) if provided`,
      );
    }

    validateDataObject(query.updateOnConflict, 'conflict', 'updateOnConflict');

    // Additional check: updateOnConflict keys should not include conflictKeys
    const updateKeys = Object.keys(
      query.updateOnConflict as Record<string, unknown>,
    );
    const conflictKeySet = new Set(query.conflictKeys as string[]);

    for (const key of updateKeys) {
      if (conflictKeySet.has(key)) {
        throw new TypeError(
          `Invalid UPSERT query: updateOnConflict should not include conflictKey '${key}' (conflict keys are never updated)`,
        );
      }
    }
  }

  // Validate returnColumns (optional)
  if (query.returnColumns !== undefined) {
    if (!Array.isArray(query.returnColumns)) {
      throw new TypeError(
        `Invalid UPSERT query: 'returnColumns' must be an array if provided`,
      );
    }

    for (const col of query.returnColumns) {
      if (typeof col !== 'string' || col.trim().length === 0) {
        throw new TypeError(
          `Invalid UPSERT query: Each column in 'returnColumns' must be a non-empty string`,
        );
      }
    }
  }
};
