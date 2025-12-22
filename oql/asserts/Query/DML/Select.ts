/**
 * SELECT Query Validator
 *
 * This module provides validation for SELECT queries in OQL.
 * SELECT queries retrieve data from one or more tables with optional
 * filtering, joining, aggregation, ordering, and pagination.
 *
 * **New Structure**: Pre-declared aggregates and expressions with
 * projection using @ prefix keys.
 *
 * @module asserts/Query/DML/Select
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertJoins, assertQueryFilter } from '../../Filters/mod.ts';
import { assertExpression } from '../../Expressions/mod.ts';
import { assertAggregate } from '../../Aggregates.ts';

/**
 * Asserts that a value is a valid SELECT query.
 *
 * Validates all SELECT-specific properties including:
 * - Required: type, table, columns, projection
 * - Optional: schema, aggregates, expressions, joins, where, having, orderBy, limit, offset
 *
 * **Validation Rules**:
 * - `type` must be 'SELECT'
 * - `table` must be a non-empty string
 * - `columns` must be non-empty array of plain strings (no @ prefix)
 * - `aggregates` (optional) must be Record<string, Aggregates>
 * - `expressions` (optional) must be Record<string, Expressions>
 * - `joins` (optional) must have required `columns` array
 * - `projection` is MANDATORY with @ prefix keys and boolean|string values
 * - `projection` keys must exist in: columns, expressions, aggregates, or joined columns
 * - `where` can reference columns, expressions, joined columns (NOT aggregates)
 * - `having` can reference aggregates only
 * - `orderBy` can reference projection keys or joined columns
 * - `limit` and `offset` must be positive integers
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
 *   columns: ['id', 'name'],
 *   projection: {
 *     '@id': 'userId',
 *     '@name': true
 *   }
 * };
 * assertSelectQuery(query); // ✓
 *
 * // With aggregates and expressions
 * const complex = {
 *   type: 'SELECT',
 *   table: 'users',
 *   columns: ['id', 'firstName', 'lastName', 'amount'],
 *   expressions: {
 *     fullName: { type: 'CONCAT', args: ['@firstName', ' ', '@lastName'] }
 *   },
 *   aggregates: {
 *     totalSales: { type: 'SUM', column: '@amount' }
 *   },
 *   projection: {
 *     '@id': 'userId',
 *     '@fullName': true,
 *     '@totalSales': 'total'
 *   },
 *   where: { '@fullName': { $like: 'John%' } },
 *   having: { '@totalSales': { $gte: 100 } }
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

  for (const [index, col] of query.columns.entries()) {
    if (typeof col !== 'string' || col.trim().length === 0) {
      throw new TypeError(
        `Invalid SELECT query: columns[${index}] must be a non-empty string`,
      );
    }
    // Columns should NOT have @ prefix (they are schema definitions)
    if (col.startsWith('@')) {
      throw new TypeError(
        `Invalid SELECT query: columns[${index}] should be plain string without '@' prefix. Got '${col}'`,
      );
    }
  }

  const columnList = query.columns as string[];
  const availableKeys: string[] = [...columnList.map((c) => `@${c}`)];

  // Validate aggregates (optional)
  const aggregateKeys: string[] = [];
  if (query.aggregates !== undefined) {
    if (
      typeof query.aggregates !== 'object' || query.aggregates === null ||
      Array.isArray(query.aggregates)
    ) {
      throw new TypeError(
        `Invalid SELECT query: 'aggregates' must be an object if provided`,
      );
    }

    const aggregates = query.aggregates as Record<string, unknown>;
    const aggKeys = Object.keys(aggregates);

    if (aggKeys.length === 0) {
      throw new TypeError(
        `Invalid SELECT query: 'aggregates' cannot be an empty object`,
      );
    }

    for (const [key, value] of Object.entries(aggregates)) {
      if (typeof key !== 'string' || key.trim().length === 0) {
        throw new TypeError(
          `Invalid SELECT query: aggregate keys must be non-empty strings`,
        );
      }

      // Aggregate keys must NOT start with @ (plain string, referenced with @ in projection/HAVING)
      if (key.startsWith('@')) {
        throw new TypeError(
          `Invalid SELECT query: aggregate key '${key}' must not start with '@'`,
        );
      }

      try {
        assertAggregate(value, columnList);
      } catch (error) {
        throw new TypeError(
          `Invalid SELECT query: aggregates['${key}'] is invalid - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      aggregateKeys.push(`@${key}`);
      availableKeys.push(`@${key}`);
    }
  }

  // Validate expressions (optional)
  const expressionKeys: string[] = [];
  if (query.expressions !== undefined) {
    if (
      typeof query.expressions !== 'object' || query.expressions === null ||
      Array.isArray(query.expressions)
    ) {
      throw new TypeError(
        `Invalid SELECT query: 'expressions' must be an object if provided`,
      );
    }

    const expressions = query.expressions as Record<string, unknown>;
    const exprKeys = Object.keys(expressions);

    if (exprKeys.length === 0) {
      throw new TypeError(
        `Invalid SELECT query: 'expressions' cannot be an empty object`,
      );
    }

    for (const [key, value] of Object.entries(expressions)) {
      if (typeof key !== 'string' || key.trim().length === 0) {
        throw new TypeError(
          `Invalid SELECT query: expression keys must be non-empty strings`,
        );
      }

      // Expression keys must NOT start with @ (plain string, referenced with @ in projection/WHERE)
      if (key.startsWith('@')) {
        throw new TypeError(
          `Invalid SELECT query: expression key '${key}' must not start with '@'`,
        );
      }

      try {
        assertExpression(value, columnList);
      } catch (error) {
        throw new TypeError(
          `Invalid SELECT query: expressions['${key}'] is invalid - ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      expressionKeys.push(`@${key}`);
      availableKeys.push(`@${key}`);
    }
  }

  // Validate joins (optional)
  const joinedColumns: string[] = [];
  if (query.joins !== undefined) {
    // First, collect all joined columns for the combined column list
    const joins = query.joins as Record<string, Record<string, unknown>>;
    for (const [alias, joinDef] of Object.entries(joins)) {
      if (Array.isArray(joinDef.columns)) {
        for (const col of joinDef.columns) {
          const joinedCol = `${alias}.${col}`;
          joinedColumns.push(joinedCol);
        }
      }
    }

    // Now validate joins with complete column list (base + joined)
    const completeColumnList = [...columnList, ...joinedColumns];
    try {
      assertJoins(query.joins, completeColumnList);
    } catch (error) {
      throw new TypeError(
        `Invalid SELECT query: 'joins' is invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Add joined columns with @ prefix to availableKeys for projection/WHERE
    for (const [alias, joinDef] of Object.entries(joins)) {
      if (Array.isArray(joinDef.columns)) {
        for (const col of joinDef.columns) {
          const joinedCol = `@${alias}.@${col}`;
          availableKeys.push(joinedCol);
        }
      }
    }
  }

  // Validate projection (MANDATORY for SELECT)
  if (!query.projection || typeof query.projection !== 'object') {
    throw new TypeError(
      `Invalid SELECT query: 'projection' is required and must be an object`,
    );
  }

  if (Array.isArray(query.projection)) {
    throw new TypeError(
      `Invalid SELECT query: 'projection' must be an object, not an array`,
    );
  }

  const projection = query.projection as Record<string, unknown>;
  const projectionKeys = Object.keys(projection);

  if (projectionKeys.length === 0) {
    throw new TypeError(
      `Invalid SELECT query: 'projection' must have at least one property`,
    );
  }

  // Validate each projection entry
  for (const [key, value] of Object.entries(projection)) {
    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new TypeError(
        `Invalid SELECT query: projection keys must be non-empty strings`,
      );
    }

    // Key must start with @
    if (!key.startsWith('@')) {
      throw new TypeError(
        `Invalid SELECT query: projection key '${key}' must start with '@' prefix`,
      );
    }

    // Key must exist in available keys (columns, expressions, aggregates, joined columns)
    if (!availableKeys.includes(key)) {
      throw new TypeError(
        `Invalid SELECT query: projection key '${key}' does not exist in columns, expressions, aggregates, or joined columns. Available: ${
          availableKeys.join(', ')
        }`,
      );
    }

    // Value must be boolean (same name) or string (alias)
    if (typeof value !== 'boolean' && typeof value !== 'string') {
      throw new TypeError(
        `Invalid SELECT query: projection['${key}'] must be boolean or string, got ${typeof value}`,
      );
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      throw new TypeError(
        `Invalid SELECT query: projection['${key}'] alias cannot be empty string`,
      );
    }
  }

  // Validate where (optional)
  // WHERE can reference: columns, expressions, joined columns (NOT aggregates)
  if (query.where !== undefined) {
    const whereAllowedKeys = columnList.concat(
      expressionKeys.map((k) => k.substring(1)), // Strip @ from expressions
      joinedColumns, // Already in format 'Alias.column'
    );

    try {
      assertQueryFilter(query.where, whereAllowedKeys);
    } catch (error) {
      throw new TypeError(
        `Invalid SELECT query: 'where' is invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    // Additional check: WHERE cannot reference aggregates
    const whereObj = query.where as Record<string, unknown>;
    for (const key of Object.keys(whereObj)) {
      if (key.startsWith('@') && aggregateKeys.includes(key)) {
        throw new TypeError(
          `Invalid SELECT query: 'where' cannot reference aggregate '${key}'. Use 'having' for aggregate filters`,
        );
      }
    }
  }

  // Validate having (optional)
  // HAVING can only reference aggregates
  if (query.having !== undefined) {
    if (aggregateKeys.length === 0) {
      throw new TypeError(
        `Invalid SELECT query: 'having' clause requires 'aggregates' to be defined`,
      );
    }

    const havingAllowedKeys = aggregateKeys.map((k) => k.substring(1));

    try {
      assertQueryFilter(query.having, havingAllowedKeys);
    } catch (error) {
      throw new TypeError(
        `Invalid SELECT query: 'having' is invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  // Validate orderBy (optional)
  // ORDER BY can reference projection keys or joined columns
  if (query.orderBy !== undefined) {
    if (
      typeof query.orderBy !== 'object' || query.orderBy === null ||
      Array.isArray(query.orderBy)
    ) {
      throw new TypeError(
        `Invalid SELECT query: 'orderBy' must be an object if provided`,
      );
    }

    const orderBy = query.orderBy as Record<string, unknown>;
    const orderByKeys = Object.keys(orderBy);

    if (orderByKeys.length === 0) {
      throw new TypeError(
        `Invalid SELECT query: 'orderBy' cannot be an empty object`,
      );
    }

    const orderByAllowedKeys = [...projectionKeys, ...joinedColumns];

    for (const [col, direction] of Object.entries(orderBy)) {
      // Column must exist in projection or joined columns
      if (!orderByAllowedKeys.includes(col)) {
        throw new TypeError(
          `Invalid SELECT query: orderBy key '${col}' must exist in projection or joined columns. Available: ${
            orderByAllowedKeys.join(', ')
          }`,
        );
      }

      if (direction !== 'ASC' && direction !== 'DESC') {
        throw new TypeError(
          `Invalid SELECT query: orderBy direction must be 'ASC' or 'DESC', got '${direction}'`,
        );
      }
    }
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

  // Validate no old properties exist
  const deprecatedProps = ['groupBy', 'distinct', 'returnColumns'];
  for (const prop of deprecatedProps) {
    if (prop in query) {
      throw new TypeError(
        `Invalid SELECT query: '${prop}' is no longer supported. See migration guide.`,
      );
    }
  }
};

/**
 * Type guard for SELECT queries.
 *
 * @param x - The value to check
 * @returns True if the value is a valid SELECT query, false otherwise
 *
 * @example
 * ```ts
 * const query = { type: 'SELECT', table: 'users', where: { '@active': true } };
 * if (isSelect(query)) {
 *   // query is now typed as Query<'SELECT', ...>
 *   console.log(query.table);
 * }
 * ```
 */
export const isSelectQuery = <T extends Query<'SELECT', any, any>>(
  x: unknown,
): x is T => {
  try {
    assertSelectQuery(x as T);
    return true;
  } catch {
    return false;
  }
};
