/**
 * `INSERT_FROM_QUERY` validator — `INSERT INTO ... SELECT ...`.
 *
 * Shape:
 * ```ts
 * {
 *   type: 'INSERT_FROM_QUERY',
 *   table: 'order_history',
 *   schema?: 'public',
 *   columns: ['id', 'userId', 'total'],   // target columns
 *   query: {                              // source SELECT
 *     type: 'SELECT',
 *     table: 'orders',
 *     columns: ['id', 'userId', 'total'],
 *     projection: { '@id': '@id', '@userId': '@userId', '@total': '@total' },
 *     where: { '@status': 'completed' },
 *   },
 * }
 * ```
 *
 * @module asserts/Query/DML/InsertFromQuery
 */

import type { Query, TableType } from '../../../types/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { assertSelectQuery } from './select.ts';

/**
 * Asserts a value is a valid `INSERT_FROM_QUERY` (insert-from-select) query:
 * `table` and target `columns` are valid, optional `schema` is valid, and
 * `query` is a valid SELECT whose `projection` has the same number of keys
 * as `columns` (positional mapping). Type compatibility between projected
 * values and target columns is enforced by the database.
 */
export const assertInsertFromQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'INSERT_FROM_QUERY', PT> = <
  PT extends TableType = TableType,
>(
  x: unknown,
): asserts x is Query<'INSERT_FROM_QUERY', PT> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid INSERT_FROM_QUERY query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'INSERT_FROM_QUERY', 'INSERT_FROM_QUERY');
  assertTableName(query, 'INSERT_FROM_QUERY');
  assertSchemaName(query, 'INSERT_FROM_QUERY');
  const targetColumns = assertColumns(query, 'INSERT_FROM_QUERY');

  if (query.query === undefined || query.query === null) {
    throw new TypeError(
      `Invalid INSERT_FROM_QUERY query: 'query' (source SELECT) is required`,
    );
  }

  try {
    assertSelectQuery(query.query);
  } catch (error) {
    throw new TypeError(
      `Invalid INSERT_FROM_QUERY query: 'query' is not a valid SELECT - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  // Belt-and-braces: assertSelectQuery should have caught a missing projection
  // already, but check before we read its keys.
  const projection = (query.query as { projection?: unknown }).projection;
  if (typeof projection !== 'object' || projection === null) {
    throw new TypeError(
      `Invalid INSERT_FROM_QUERY query: source SELECT must declare a 'projection'`,
    );
  }
  const projectionKeys = Object.keys(projection);
  if (projectionKeys.length !== targetColumns.length) {
    throw new TypeError(
      `Invalid INSERT_FROM_QUERY query: target 'columns' has ${targetColumns.length} entries, ` +
        `but source SELECT projection has ${projectionKeys.length} entries — they must match`,
    );
  }
};

/** Type guard for {@link assertInsertFromQuery}. */
export const isInsertFromQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'INSERT_FROM_QUERY', PT> => {
  try {
    assertInsertFromQuery<PT>(x);
    return true;
  } catch {
    return false;
  }
};
