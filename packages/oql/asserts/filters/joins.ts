/**
 * Joins Validators
 *
 * This module provides validation functions for join-related types:
 * - JoinFilter: ON clause for table joins
 * - JoinDetails: Complete join specification
 * - Joins: Collection of all joins
 *
 * @module asserts/Filters/Joins
 */

import type {
  JoinDetails,
  JoinFilter,
  Joins,
  TableType,
} from '../../types/mod.ts';
import { assertColumnIdentifier } from '../columnIdentifier.ts';
import { assertExpression } from '../expressions/mod.ts';

/**
 * Valid join types.
 * @internal
 */
const JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL'] as const;

/**
 * Asserts that a value is a valid JoinFilter.
 *
 * JoinFilter defines the ON clause for table joins. Keys are column identifiers
 * from the linked table, and values can be:
 * - null: for NULL checks
 * - Direct constant values
 * - Column identifiers from primary or other linked tables
 * - Expressions for computed join conditions
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @throws {TypeError} If the value is not a valid JoinFilter
 *
 * @example
 * ```ts
 * // Column-to-column join
 * assertJoinFilter({
 *   '@Profile.@userId': '@User.@id'
 * }, ['User.id', 'Profile.userId']);
 *
 * // Constant value join
 * assertJoinFilter({
 *   '@Profile.@isActive': true
 * }, ['Profile.isActive']);
 *
 * // NULL check
 * assertJoinFilter({
 *   '@Profile.@deletedAt': null
 * }, ['Profile.deletedAt']);
 *
 * // Expression join
 * assertJoinFilter({
 *   '@Order.@total': {
 *     $$_expression: 'MULTIPLY',
 *     args: ['@Item.@price', '@Item.@quantity']
 *   }
 * }, ['Order.total', 'Item.price', 'Item.quantity']);
 * ```
 */
export const assertJoinFilter: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
) => asserts x is JoinFilter<PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
): asserts x is JoinFilter<PT, LT> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid JoinFilter: Expected an object, got ${typeof x}`,
    );
  }

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    throw new TypeError('Invalid JoinFilter: Object cannot be empty');
  }

  for (const [key, value] of Object.entries(obj)) {
    // Key must be a valid column identifier
    try {
      assertColumnIdentifier(key, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid JoinFilter: Key '${key}' is not a valid column identifier - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Value can be null
    if (value === null) {
      continue;
    }

    // Value can be a direct constant (primitive). String values that look
    // like column references (well-formed AND in the columnList, or
    // columnList undefined) are accepted as references; otherwise the
    // string is treated as a literal value.
    if (
      typeof value === 'string' || typeof value === 'number' ||
      typeof value === 'boolean' || typeof value === 'bigint' ||
      value instanceof Date
    ) {
      continue;
    }

    // Value can be an expression
    if (typeof value === 'object' && !Array.isArray(value)) {
      try {
        assertExpression(value, columnList);
        continue;
      } catch (error) {
        throw new TypeError(
          `Invalid JoinFilter: Value for key '${key}' is not a valid expression - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    throw new TypeError(
      `Invalid JoinFilter: Value for key '${key}' must be null, a primitive value, a column identifier, or an expression, got ${typeof value}`,
    );
  }
};

/**
 * Type guard for JoinFilter.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names
 * @returns True if the value is a valid JoinFilter, false otherwise
 */
export const isJoinFilter: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
) => x is JoinFilter<PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
): x is JoinFilter<PT, LT> => {
  try {
    assertJoinFilter<PT, LT>(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid JoinDetails.
 *
 * JoinDetails contains the complete specification for a table join:
 * - table: The table name to join
 * - schema: Optional schema name
 * - columns: Required array of column names available from the joined table
 * - on: The JoinFilter (ON clause)
 * - type: Join type (INNER, LEFT, RIGHT, FULL)
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @throws {TypeError} If the value is not a valid JoinDetails
 *
 * @example
 * ```ts
 * // Simple INNER JOIN
 * assertJoinDetails({
 *   table: 'Profile',
 *   columns: ['userId', 'bio', 'email'],
 *   on: { '@Profile.@userId': '@User.@id' }
 * }, ['User.id', 'Profile.userId']);
 *
 * // LEFT JOIN with schema
 * assertJoinDetails({
 *   table: 'Orders',
 *   schema: 'sales',
 *   columns: ['customerId', 'amount', 'createdAt'],
 *   type: 'LEFT',
 *   on: { '@Orders.@customerId': '@Customer.@id' }
 * }, ['Customer.id', 'Orders.customerId']);
 * ```
 */
export const assertJoinDetails: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
) => asserts x is JoinDetails<PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
): asserts x is JoinDetails<PT, LT> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid JoinDetails: Expected an object, got ${typeof x}`,
    );
  }

  const obj = x as Record<string, unknown>;

  // Validate required 'table' property
  if (!('table' in obj)) {
    throw new TypeError(
      "Invalid JoinDetails: Missing required 'table' property",
    );
  }

  if (typeof obj.table !== 'string' && typeof obj.table !== 'symbol') {
    throw new TypeError(
      `Invalid JoinDetails: 'table' must be a string or symbol, got ${typeof obj
        .table}`,
    );
  }

  // Validate optional 'schema' property
  if ('schema' in obj && obj.schema !== undefined) {
    if (typeof obj.schema !== 'string') {
      throw new TypeError(
        `Invalid JoinDetails: 'schema' must be a string, got ${typeof obj
          .schema}`,
      );
    }
  }

  // Validate required 'columns' property
  if (!('columns' in obj)) {
    throw new TypeError(
      "Invalid JoinDetails: Missing required 'columns' property",
    );
  }

  if (!Array.isArray(obj.columns)) {
    throw new TypeError(
      `Invalid JoinDetails: 'columns' must be an array, got ${typeof obj
        .columns}`,
    );
  }

  if (obj.columns.length === 0) {
    throw new TypeError(
      "Invalid JoinDetails: 'columns' array cannot be empty",
    );
  }

  for (const [index, col] of obj.columns.entries()) {
    if (typeof col !== 'string' && typeof col !== 'symbol') {
      throw new TypeError(
        `Invalid JoinDetails: 'columns[${index}]' must be a string or symbol, got ${typeof col}`,
      );
    }

    const colStr = String(col);
    if (colStr.startsWith('@')) {
      throw new TypeError(
        `Invalid JoinDetails: 'columns[${index}]' should not have '@' prefix. Got '${colStr}'`,
      );
    }
  }

  // Validate required 'on' property
  if (!('on' in obj)) {
    throw new TypeError("Invalid JoinDetails: Missing required 'on' property");
  }

  try {
    assertJoinFilter<PT, LT>(obj.on, columnList);
  } catch (error) {
    throw new TypeError(
      `Invalid JoinDetails: 'on' property is invalid - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Validate optional 'type' property
  if ('type' in obj && obj.type !== undefined) {
    if (typeof obj.type !== 'string') {
      throw new TypeError(
        `Invalid JoinDetails: 'type' must be a string, got ${typeof obj.type}`,
      );
    }

    if (!JOIN_TYPES.includes(obj.type as typeof JOIN_TYPES[number])) {
      throw new TypeError(
        `Invalid JoinDetails: 'type' must be one of ${
          JOIN_TYPES.join(', ')
        }, got '${obj.type}'`,
      );
    }
  }
};

/**
 * Type guard for JoinDetails.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names
 * @returns True if the value is a valid JoinDetails, false otherwise
 */
export const isJoinDetails: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
) => x is JoinDetails<PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
): x is JoinDetails<PT, LT> => {
  try {
    assertJoinDetails<PT, LT>(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid Joins collection.
 *
 * Joins is a record mapping table names to their JoinDetails.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @throws {TypeError} If the value is not a valid Joins collection
 *
 * @example
 * ```ts
 * // Multiple joins (each JoinDetails needs its own `table` + `columns`)
 * assertJoins({
 *   Profile: {
 *     table: 'Profile',
 *     columns: ['userId'],
 *     on: { '@Profile.@userId': '@User.@id' }
 *   },
 *   Orders: {
 *     table: 'Orders',
 *     columns: ['userId'],
 *     type: 'LEFT',
 *     on: { '@Orders.@userId': '@User.@id' }
 *   }
 * }, ['User.id', 'Profile.userId', 'Orders.userId']);
 * ```
 */
export const assertJoins: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
) => asserts x is Joins<PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
): asserts x is Joins<PT, LT> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid Joins: Expected an object, got ${typeof x}`,
    );
  }

  const obj = x as Record<string, unknown>;
  const keys = Object.keys(obj);

  if (keys.length === 0) {
    throw new TypeError('Invalid Joins: Object cannot be empty');
  }

  for (const [key, value] of Object.entries(obj)) {
    try {
      assertJoinDetails<PT, LT>(value, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid Joins: Join '${key}' is invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
};

/**
 * Type guard for Joins.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names
 * @returns True if the value is a valid Joins collection, false otherwise
 *
 * @example
 * ```ts
 * if (isJoins(value, columnList)) {
 *   // value is Joins<PT, LT>
 *   // Can safely use with database queries
 * }
 * ```
 */
export const isJoins: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
) => x is Joins<PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
  columnList?: string[],
): x is Joins<PT, LT> => {
  try {
    assertJoins<PT, LT>(x, columnList);
    return true;
  } catch {
    return false;
  }
};
