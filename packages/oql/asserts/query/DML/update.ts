/**
 * `UPDATE` query validator.
 *
 * @module asserts/Query/DML/Update
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertQueryFilter } from '../../filters/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { validateDataEntry, validateExpressions } from './common.ts';

/**
 * Validates `query.data` for UPDATE: must be a non-empty plain object whose
 * keys are columns and whose values are valid primitives/Date/expressions.
 * Column references inside expression values ARE allowed (unlike INSERT) —
 * UPDATE expressions can read other columns of the row being updated.
 * @internal
 */
const validateData = (
  query: Record<string, unknown>,
  columnList: string[],
): void => {
  if (
    !query.data || typeof query.data !== 'object' || Array.isArray(query.data)
  ) {
    throw new TypeError(
      `Invalid UPDATE query: 'data' must be a non-null object (not an array)`,
    );
  }

  if (Object.keys(query.data).length === 0) {
    throw new TypeError(
      `Invalid UPDATE query: 'data' must have at least one property`,
    );
  }

  for (const [key, value] of Object.entries(query.data)) {
    validateDataEntry(key, value, columnList, 'UPDATE query: data');
  }
};

/**
 * Asserts a value is a valid `UPDATE` query: `table` and `columns` are valid,
 * optional `schema` is valid, optional `expressions` are well-formed, `data`
 * is a non-empty key/value map, and optional `where` is a valid filter that
 * may reference declared columns and expression keys.
 *
 * `where` is syntactically optional but UPDATE without WHERE rewrites every
 * row — pass one in production code.
 */
export const assertUpdateQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'UPDATE', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'UPDATE', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid UPDATE query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'UPDATE', 'UPDATE');
  assertTableName(query, 'UPDATE');
  assertSchemaName(query, 'UPDATE');
  const columnList = assertColumns(query, 'UPDATE');

  const expressionKeys = validateExpressions(query, columnList, 'UPDATE');
  const availableKeys = [...columnList, ...expressionKeys];

  validateData(query, columnList);

  if (query.where !== undefined) {
    // Declared columns are eligible as JSON-path roots (`@col.@key`);
    // the base table name takes precedence (qualified-column form) and
    // is excluded. UPDATE has no joins, so no alias exclusion is needed.
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

/** Type guard for {@link assertUpdateQuery}. */
export const isUpdateQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'UPDATE', PT> => {
  try {
    assertUpdateQuery(x);
    return true;
  } catch {
    return false;
  }
};
