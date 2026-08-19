/**
 * `DELETE` query validator.
 *
 * @module asserts/Query/DML/Delete
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertQueryFilter } from '../../filters/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { validateExpressions } from './common.ts';

/**
 * Asserts a value is a valid `DELETE` query: `table` and `columns` are valid,
 * optional `schema` is valid, optional `expressions` are well-formed, and
 * optional `where` is a valid filter that may reference declared columns and
 * expression keys.
 *
 * `where` is syntactically optional but DELETE without WHERE removes every
 * row — callers should pass one in production code.
 */
export const assertDeleteQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'DELETE', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'DELETE', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid DELETE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'DELETE', 'DELETE');
  assertTableName(query, 'DELETE');
  assertSchemaName(query, 'DELETE');
  const columnList = assertColumns(query, 'DELETE');

  const expressionKeys = validateExpressions(query, columnList, 'DELETE');
  const availableKeys = [...columnList, ...expressionKeys];

  if (query.where !== undefined) {
    // Declared columns are eligible as JSON-path roots (`@col.@key`);
    // the base table name takes precedence (qualified-column form) and
    // is excluded. DELETE has no joins, so no alias exclusion is needed.
    const jsonPathRoots = columnList.filter((c) => c !== query.table);
    assertQueryFilter(
      query.where,
      availableKeys,
      undefined,
      undefined,
      jsonPathRoots,
    );
  }
};

/** Type guard for {@link assertDeleteQuery}. */
export const isDeleteQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'DELETE', PT> => {
  try {
    assertDeleteQuery(x);
    return true;
  } catch {
    return false;
  }
};
