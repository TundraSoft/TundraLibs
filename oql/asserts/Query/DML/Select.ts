/**
 * SELECT Query Validator
 *
 * This module provides validation for SELECT queries in OQL.
 * SELECT queries retrieve data from one or more tables with optional
 * filtering, joining, grouping, ordering, and pagination.
 *
 * @module asserts/Query/DML/Select
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertColumnIdentifier } from '../../ColumnIdentifier.ts';
import { assertFilterOperator } from '../../Filters/mod.ts';
import { assertExpression } from '../../Expressions/mod.ts';
import { assertAggregate } from '../../Aggregates.ts';

/**
 * Asserts that a value is a valid SELECT query.
 *
 * Validates all SELECT-specific properties including:
 * - Required: type, table, columns, projection
 * - Optional: schema, where, joins, orderBy, groupBy, having, limit, offset, distinct, returnColumns
 *
 * **Validation Rules**:
 * - `type` must be 'SELECT'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of strings (schema definition)
 * - `projection` is MANDATORY and must define output shape
 * - `where` must be valid QueryFilter if present
 * - `joins` must be valid Joins object if present
 * - `orderBy` must be valid sort specification if present
 * - `groupBy` array must reference valid columns
 * - `having` must be valid QueryFilter if present (post-aggregation)
 * - `limit` and `offset` must be positive integers
 * - `distinct` must be boolean if present
 * - `returnColumns` must be array of strings if present
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid SELECT query
 *
 * @example
 * ```ts
 * // Simple SELECT
 * const query = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'name', 'email'],
 *   projection: { userId: '@id', userName: '@name' }
 * };
 * assertSelectQuery(query); // ✓
 *
 * // With WHERE clause
 * const filtered = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'name', 'status'],
 *   projection: { id: '@id', name: '@name' },
 *   where: { '@status': 'active' }
 * };
 * assertSelectQuery(filtered); // ✓
 *
 * // With joins and aggregates
 * const complex = {
 *   type: 'SELECT',
 *   table: 'orders',
 *   columns: ['id', 'userId', 'total'],
 *   projection: {
 *     userId: '@userId',
 *     totalSpent: { type: 'SUM', column: '@total' }
 *   },
 *   joins: {
 *     User: {
 *       table: 'users',
 *       type: 'INNER',
 *       on: { '@User.@id': '@userId' }
 *     }
 *   },
 *   groupBy: ['@userId'],
 *   orderBy: { '@totalSpent': 'DESC' },
 *   limit: 10
 * };
 * assertSelectQuery(complex); // ✓
 * ```
 */
export const assertSelectQuery: <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
) => asserts x is Query<'SELECT', PT, LT> = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
): asserts x is Query<'SELECT', PT, LT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid SELECT query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  // Validate type
  if (query.type !== 'SELECT') {
    throw new TypeError(
      `Invalid SELECT query: Expected type 'SELECT', got '${query.type}'`,
    );
  }

  // Validate table
  if (typeof query.table !== 'string' || query.table.trim().length === 0) {
    throw new TypeError(
      `Invalid SELECT query: 'table' must be a non-empty string`,
    );
  }

  // Validate schema (optional)
  if (query.schema !== undefined) {
    if (
      typeof query.schema !== 'string' || query.schema.trim().length === 0
    ) {
      throw new TypeError(
        `Invalid SELECT query: 'schema' must be a non-empty string if provided`,
      );
    }
  }

  // Validate columns
  if (!Array.isArray(query.columns) || query.columns.length === 0) {
    throw new TypeError(
      `Invalid SELECT query: 'columns' must be a non-empty array`,
    );
  }

  for (const col of query.columns) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid SELECT query: Each column in 'columns' must be a non-empty string`,
      );
    }
    // Columns should NOT have @ prefix (they are schema definitions)
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid SELECT query: Columns should be plain strings without '@' prefix. Got '${col}'`,
      );
    }
  }

  const columnList = query.columns as string[];

  // Validate projection (MANDATORY for SELECT)
  if (!query.projection || typeof query.projection !== 'object') {
    throw new TypeError(
      `Invalid SELECT query: 'projection' is required and must be an object`,
    );
  }

  const projection = query.projection as Record<string, unknown>;
  const projectionKeys = Object.keys(projection);

  if (projectionKeys.length === 0) {
    throw new TypeError(
      `Invalid SELECT query: 'projection' must have at least one property`,
    );
  }

  // Validate each projection value (can be ColumnIdentifier, Expression, or Aggregate)
  for (const [key, value] of Object.entries(projection)) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new TypeError(
        `Invalid SELECT query: Projection keys must be non-empty strings`,
      );
    }

    // Value can be:
    // 1. ColumnIdentifier (string starting with @)
    // 2. Expression object
    // 3. Aggregate object
    if (typeof value === 'string') {
      assertColumnIdentifier(value, columnList);
    } else if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      // Check if it's an aggregate (has 'column' property) or expression (has 'type' and 'args')
      if ('column' in obj) {
        assertAggregate(value, columnList);
      } else if ('type' in obj) {
        assertExpression(value, columnList);
      } else {
        throw new TypeError(
          `Invalid SELECT query: Projection value for '${key}' must be a ColumnIdentifier, Expression, or Aggregate`,
        );
      }
    } else {
      throw new TypeError(
        `Invalid SELECT query: Projection value for '${key}' must be a ColumnIdentifier, Expression, or Aggregate`,
      );
    }
  }

  // Validate where (optional)
  if (query.where !== undefined) {
    assertFilterOperator(query.where, columnList);
  }

  // Validate joins (optional)
  if (query.joins !== undefined) {
    if (typeof query.joins !== 'object' || query.joins === null) {
      throw new TypeError(
        `Invalid SELECT query: 'joins' must be an object if provided`,
      );
    }

    const joins = query.joins as Record<string, unknown>;
    for (const [joinAlias, joinDef] of Object.entries(joins)) {
      if (typeof joinAlias !== 'string' || joinAlias.trim().length === 0) {
        throw new TypeError(
          `Invalid SELECT query: Join alias must be a non-empty string`,
        );
      }

      if (typeof joinDef !== 'object' || joinDef === null) {
        throw new TypeError(
          `Invalid SELECT query: Join definition for '${joinAlias}' must be an object`,
        );
      }

      const join = joinDef as Record<string, unknown>;

      // Validate table
      if (typeof join.table !== 'string' || join.table.trim().length === 0) {
        throw new TypeError(
          `Invalid SELECT query: Join '${joinAlias}' must have a non-empty 'table' property`,
        );
      }

      // Validate type
      const validJoinTypes = ['INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS'];
      if (!validJoinTypes.includes(join.type as string)) {
        throw new TypeError(
          `Invalid SELECT query: Join '${joinAlias}' must have a valid 'type' (${
            validJoinTypes.join(', ')
          })`,
        );
      }

      // Validate on (optional for CROSS join)
      if (join.type !== 'CROSS') {
        if (!join.on || typeof join.on !== 'object') {
          throw new TypeError(
            `Invalid SELECT query: Join '${joinAlias}' must have an 'on' property for ${join.type} join`,
          );
        }
        // Build extended column list including join columns with alias prefix
        const joinColumnList = [...columnList];
        if (join.columns && Array.isArray(join.columns)) {
          for (const col of join.columns) {
            joinColumnList.push(`${joinAlias}.${col}`);
          }
        }
        assertFilterOperator(join.on, joinColumnList);
      }

      // Validate columns (optional)
      if (join.columns !== undefined) {
        if (!Array.isArray(join.columns) || join.columns.length === 0) {
          throw new TypeError(
            `Invalid SELECT query: Join '${joinAlias}' columns must be a non-empty array if provided`,
          );
        }
        for (const col of join.columns) {
          if (typeof col !== 'string' || col.trim().length === 0) {
            throw new TypeError(
              `Invalid SELECT query: Each column in join '${joinAlias}' must be a non-empty string`,
            );
          }
        }
      }
    }
  }

  // Validate orderBy (optional)
  if (query.orderBy !== undefined) {
    if (typeof query.orderBy !== 'object' || query.orderBy === null) {
      throw new TypeError(
        `Invalid SELECT query: 'orderBy' must be an object if provided`,
      );
    }

    const orderBy = query.orderBy as Record<string, unknown>;
    for (const [col, direction] of Object.entries(orderBy)) {
      assertColumnIdentifier(col, columnList);
      if (direction !== 'ASC' && direction !== 'DESC') {
        throw new TypeError(
          `Invalid SELECT query: orderBy direction must be 'ASC' or 'DESC', got '${direction}'`,
        );
      }
    }
  }

  // Validate groupBy (optional)
  if (query.groupBy !== undefined) {
    if (!Array.isArray(query.groupBy) || query.groupBy.length === 0) {
      throw new TypeError(
        `Invalid SELECT query: 'groupBy' must be a non-empty array if provided`,
      );
    }

    for (const col of query.groupBy) {
      assertColumnIdentifier(col, columnList);
    }
  }

  // Validate having (optional, requires groupBy)
  if (query.having !== undefined) {
    assertFilterOperator(query.having, columnList);
  }

  // Validate limit (optional)
  if (query.limit !== undefined) {
    if (
      typeof query.limit !== 'number' || query.limit <= 0 ||
      !Number.isInteger(query.limit)
    ) {
      throw new TypeError(
        `Invalid SELECT query: 'limit' must be a positive integer if provided`,
      );
    }
  }

  // Validate offset (optional)
  if (query.offset !== undefined) {
    if (
      typeof query.offset !== 'number' || query.offset < 0 ||
      !Number.isInteger(query.offset)
    ) {
      throw new TypeError(
        `Invalid SELECT query: 'offset' must be a non-negative integer if provided`,
      );
    }
  }

  // Validate distinct (optional)
  if (query.distinct !== undefined) {
    if (typeof query.distinct !== 'boolean') {
      throw new TypeError(
        `Invalid SELECT query: 'distinct' must be a boolean if provided`,
      );
    }
  }

  // Validate returnColumns (optional)
  if (query.returnColumns !== undefined) {
    if (!Array.isArray(query.returnColumns)) {
      throw new TypeError(
        `Invalid SELECT query: 'returnColumns' must be an array if provided`,
      );
    }

    for (const col of query.returnColumns) {
      if (typeof col !== 'string' || col.trim().length === 0) {
        throw new TypeError(
          `Invalid SELECT query: Each column in 'returnColumns' must be a non-empty string`,
        );
      }
    }
  }
};
