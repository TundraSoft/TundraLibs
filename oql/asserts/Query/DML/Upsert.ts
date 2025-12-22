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
import { assertColumnIdentifier } from '../../ColumnIdentifier.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../Common.ts';
import { assertDataEntry } from './Common.ts';

/**
 * Validates conflict keys array.
 * Helper function to reduce cognitive complexity.
 *
 * @param conflictKeys - The conflict keys array to validate
 * @param columnList - List of valid column names
 * @throws {TypeError} If conflict keys are invalid
 * @internal
 */
const validateConflictKeys = (
  conflictKeys: unknown,
  columnList: string[],
): void => {
  if (!Array.isArray(conflictKeys) || conflictKeys.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'conflictKeys' must be a non-empty array`,
    );
  }

  for (const key of conflictKeys) {
    try {
      assertColumnIdentifier(key, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid UPSERT query: conflictKeys - ${(error as Error).message}`,
      );
    }
  }
};

/**
 * Validates updateOnConflict array.
 * Helper function to reduce cognitive complexity.
 *
 * @param updateOnConflict - The updateOnConflict array to validate
 * @param conflictKeys - The conflict keys to check against
 * @param columnList - List of valid column names
 * @param firstData - First data object to check column availability
 * @throws {TypeError} If updateOnConflict is invalid
 * @internal
 */
const validateUpdateOnConflict = (
  updateOnConflict: unknown,
  conflictKeys: string[],
  columnList: string[],
  firstData: unknown,
): void => {
  if (!Array.isArray(updateOnConflict)) {
    throw new TypeError(
      `Invalid UPSERT query: 'updateOnConflict' must be an array if provided`,
    );
  }

  if (updateOnConflict.length === 0) {
    throw new TypeError(
      `Invalid UPSERT query: 'updateOnConflict' cannot be an empty array`,
    );
  }

  const dataKeys = typeof firstData === 'object' && firstData !== null
    ? Object.keys(firstData as Record<string, unknown>)
    : [];

  for (const identifier of updateOnConflict) {
    // Validate column identifier format
    try {
      assertColumnIdentifier(identifier, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid UPSERT query: updateOnConflict - ${(error as Error).message}`,
      );
    }

    // Check if updateOnConflict includes any conflictKeys
    if (conflictKeys.includes(identifier as string)) {
      throw new TypeError(
        `Invalid UPSERT query: updateOnConflict should not include conflictKey '${identifier}'`,
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
};

/**
 * Validates a single data object structure and contents.
 * Helper function to reduce cognitive complexity.
 *
 * @param dataObj - The data object to validate
 * @param index - Index or identifier for error messages
 * @param label - Label for error messages (e.g., 'data')
 * @param columnList - List of valid column names
 * @throws {TypeError} If the data object is invalid
 * @internal
 */
const validateDataObject = (
  dataObj: unknown,
  index: number | string,
  label: string,
  columnList: string[],
): void => {
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
    assertDataEntry(
      key,
      value,
      columnList,
      `UPSERT query: ${label}[${index}]`,
    );
  }
};

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

  // Validate basic properties using common functions
  assertQueryType(query, 'UPSERT', 'UPSERT');
  assertTableName(query, 'UPSERT');
  assertSchemaName(query, 'UPSERT');
  const columnList = assertColumns(query, 'UPSERT');

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

  // Validate each data object
  for (let i = 0; i < dataArray.length; i++) {
    validateDataObject(dataArray[i], i, 'data', columnList);
  }

  // Validate conflictKeys (required)
  validateConflictKeys(query.conflictKeys, columnList);

  // Validate updateOnConflict (optional)
  if (query.updateOnConflict !== undefined) {
    const firstData = Array.isArray(query.data) ? query.data[0] : query.data;
    validateUpdateOnConflict(
      query.updateOnConflict,
      query.conflictKeys as string[],
      columnList,
      firstData,
    );
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
export const isUpsertQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'UPSERT', PT> => {
  try {
    assertUpsertQuery(x);
    return true;
  } catch {
    return false;
  }
};
