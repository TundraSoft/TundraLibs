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
  JoinDetails as _JoinDetails,
  JoinFilter as _JoinFilter,
  Joins as _Joins,
  TableType as _TableType,
} from '../../types/mod.ts';
import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import { assertExpression } from '../Expressions/mod.ts';

/**
 * Valid join types.
 * @internal
 */
const _JOIN_TYPES = ['INNER', 'LEFT', 'RIGHT', 'FULL'] as const;

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
 *     type: 'MULTIPLY',
 *     args: ['@Item.@price', '@Item.@quantity']
 *   }
 * }, ['Order.total', 'Item.price', 'Item.quantity']);
 * ```
 */
export const assertJoinFilter: <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
) => asserts x is _JoinFilter<PT, LT> = <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
): asserts x is _JoinFilter<PT, LT> => {
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

    // Value can be a direct constant (primitive)
    if (
      typeof value === 'string' || typeof value === 'number' ||
      typeof value === 'boolean' || typeof value === 'bigint' ||
      value instanceof Date
    ) {
      // If it's a string starting with '@', validate as column identifier
      if (typeof value === 'string' && value.startsWith('@')) {
        try {
          assertColumnIdentifier(value, columnList);
        } catch (error) {
          throw new TypeError(
            `Invalid JoinFilter: Value '${value}' for key '${key}' is not a valid column identifier - ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
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
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
) => x is _JoinFilter<PT, LT> = <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
): x is _JoinFilter<PT, LT> => {
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
 *   on: { '@Profile.@userId': '@User.@id' }
 * }, ['User.id', 'Profile.userId']);
 *
 * // LEFT JOIN with schema
 * assertJoinDetails({
 *   table: 'Orders',
 *   schema: 'sales',
 *   type: 'LEFT',
 *   on: { '@Orders.@customerId': '@Customer.@id' }
 * }, ['Customer.id', 'Orders.customerId']);
 *
 * // JOIN with expression
 * assertJoinDetails({
 *   table: 'Inventory',
 *   type: 'INNER',
 *   on: {
 *     '@Inventory.@productId': '@Product.@id',
 *     '@Inventory.@quantity': { $gt: 0 }
 *   }
 * });
 * ```
 */
export const assertJoinDetails: <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
) => asserts x is _JoinDetails<PT, LT> = <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
): asserts x is _JoinDetails<PT, LT> => {
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

    if (!_JOIN_TYPES.includes(obj.type as typeof _JOIN_TYPES[number])) {
      throw new TypeError(
        `Invalid JoinDetails: 'type' must be one of ${
          _JOIN_TYPES.join(', ')
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
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
) => x is _JoinDetails<PT, LT> = <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
): x is _JoinDetails<PT, LT> => {
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
 * // Multiple joins
 * assertJoins({
 *   Profile: {
 *     table: 'Profile',
 *     on: { '@Profile.@userId': '@User.@id' }
 *   },
 *   Orders: {
 *     table: 'Orders',
 *     type: 'LEFT',
 *     on: { '@Orders.@userId': '@User.@id' }
 *   }
 * }, ['User.id', 'Profile.userId', 'Orders.userId']);
 * ```
 */
export const assertJoins: <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
) => asserts x is _Joins<PT, LT> = <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
): asserts x is _Joins<PT, LT> => {
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
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
) => x is _Joins<PT, LT> = <
  PT extends _TableType = _TableType,
  LT extends Record<string, _TableType> = Record<string, _TableType>,
>(
  x: unknown,
  columnList?: string[],
): x is _Joins<PT, LT> => {
  try {
    assertJoins<PT, LT>(x, columnList);
    return true;
  } catch {
    return false;
  }
};
