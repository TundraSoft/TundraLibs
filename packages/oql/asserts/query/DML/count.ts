/**
 * `COUNT` query validator.
 *
 * @module asserts/Query/DML/Count
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertJoins, assertQueryFilter } from '../../filters/mod.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { validateExpressions } from './common.ts';

/**
 * Validates the optional `distinct` property of a COUNT query: a
 * single-element array of ONE plain column name (no `@` prefix) that
 * must appear in the declared `columns`. Exactly one column because
 * multi-column DISTINCT counts are not portable across SQL dialects.
 *
 * @internal
 */
const validateDistinct = (
  query: Record<string, unknown>,
  columnList: string[],
): void => {
  if (query.distinct === undefined) return;
  if (!Array.isArray(query.distinct)) {
    throw new TypeError(
      `Invalid COUNT query: 'distinct' must be an array if provided, got ${typeof query
        .distinct}`,
    );
  }
  if (query.distinct.length === 0) {
    throw new TypeError(
      `Invalid COUNT query: 'distinct' cannot be an empty array`,
    );
  }
  if (query.distinct.length > 1) {
    throw new TypeError(
      `Invalid COUNT query: 'distinct' must contain exactly one column — multi-column DISTINCT counts are not portable across dialects, got ${query.distinct.length}`,
    );
  }
  const col = query.distinct[0];
  if (typeof col !== 'string' || col.trim().length === 0) {
    throw new TypeError(
      `Invalid COUNT query: 'distinct[0]' must be a non-empty string, got ${typeof col}`,
    );
  }
  if (col.startsWith('@')) {
    throw new TypeError(
      `Invalid COUNT query: 'distinct[0]' must be a plain column name without '@' prefix. Got '${col}'`,
    );
  }
  if (!columnList.includes(col)) {
    throw new TypeError(
      `Invalid COUNT query: 'distinct[0]' column '${col}' does not exist in columns. Available: ${
        columnList.join(', ')
      }`,
    );
  }
};

/**
 * Asserts a value is a valid `COUNT` query: `type === 'COUNT'`, `table` and
 * `columns` are valid, optional `schema` is valid, optional `distinct`
 * names exactly one declared column, optional `expressions` are
 * well-formed, and optional `where` is a valid filter that may reference
 * declared columns and expression keys.
 *
 * `columns` is the table-schema column list — used to resolve `@col`
 * references in the filter — not a projection (COUNT returns just a number).
 */
export const assertCountQuery: <PT extends TableType = TableType>(
  x: unknown,
) => asserts x is Query<'COUNT', PT> = <PT extends TableType = TableType>(
  x: unknown,
): asserts x is Query<'COUNT', PT> => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid COUNT query: Expected object, got ${typeof x}`,
    );
  }

  const query = x as Record<string, unknown>;

  assertQueryType(query, 'COUNT', 'COUNT');
  assertTableName(query, 'COUNT');
  assertSchemaName(query, 'COUNT');
  const columnList = assertColumns(query, 'COUNT');

  validateDistinct(query, columnList);

  // A COUNT produces a single scalar with no GROUP BY, so there is no
  // user-referenceable aggregate alias to filter on — a `having` clause is
  // meaningless. It was also unusable: the SQL translators rewrite COUNT as
  // a SELECT whose only aggregate is an internal alias, so any user key threw
  // a misleading "not in the provided column list" error, while Mongo dropped
  // it silently. Reject it here so every dialect fails the same clear way.
  if (query.having !== undefined) {
    throw new TypeError(
      `Invalid COUNT query: 'having' is not supported — COUNT returns a single value with no GROUP BY. Use a SELECT with 'aggregates' + 'having' for post-aggregation filtering.`,
    );
  }

  const expressionKeys = validateExpressions(query, columnList, 'COUNT');

  // Joins extend the filter scope — `@<Alias>.@<col>` references in
  // `where` resolve against the joined tables. Same handling SELECT
  // does in `validateJoinsBlock`.
  const joinedColumns: string[] = [];
  if (query.joins !== undefined) {
    const joins = query.joins as Record<string, Record<string, unknown>>;
    for (const [alias, joinDef] of Object.entries(joins)) {
      if (Array.isArray(joinDef.columns)) {
        for (const col of joinDef.columns) {
          joinedColumns.push(`${alias}.${col}`);
        }
      }
    }
    try {
      assertJoins(query.joins, [...columnList, ...joinedColumns]);
    } catch (error) {
      throw new TypeError(
        `Invalid COUNT query: 'joins' is invalid - ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  if (query.where !== undefined) {
    // `assertQueryFilter` expects a bare-name list (no `@` prefix).
    // Mirrors SELECT's `whereAllowedKeys` construction.
    const whereAllowedKeys = columnList.concat(expressionKeys, joinedColumns);
    assertQueryFilter(query.where, whereAllowedKeys);
  }
};

/** Type guard for {@link assertCountQuery}. */
export const isCountQuery = <PT extends TableType = TableType>(
  x: unknown,
): x is Query<'COUNT', PT> => {
  try {
    assertCountQuery(x);
    return true;
  } catch {
    return false;
  }
};
