/**
 * `SELECT` query validator. Validates the full SELECT shape: pre-declared
 * aggregates and expressions, joins, mandatory `projection`, plus the
 * optional `where` / `having` / `orderBy` / `limit` / `offset` clauses.
 *
 * @module asserts/Query/DML/Select
 */

import type { Query, TableType } from '../../../types/mod.ts';
import { assertJoins, assertQueryFilter } from '../../filters/mod.ts';
import { assertAggregate } from '../../aggregates.ts';
import {
  assertColumns,
  assertQueryType,
  assertSchemaName,
  assertTableName,
} from '../common.ts';
import { validateExpressions } from './common.ts';

const DEPRECATED_PROPS = ['groupBy', 'returnColumns'] as const;

/**
 * Validates the optional `distinct` flag. Must be a boolean. When
 * `true` it cannot be combined with declared `aggregates` or with a
 * projection key that auto-expands a join alias into a `JSON_ROW`
 * aggregate — both trigger an automatic GROUP BY of every
 * non-aggregated projection key, which already deduplicates rows, so
 * a DISTINCT there is redundant and rejected rather than silently
 * ignored.
 *
 * @internal
 */
const validateDistinct = (query: Record<string, unknown>): void => {
  if (query.distinct === undefined) return;
  if (typeof query.distinct !== 'boolean') {
    throw new TypeError(
      `Invalid SELECT query: 'distinct' must be a boolean if provided, got ${typeof query
        .distinct}`,
    );
  }
  if (query.distinct !== true) return;
  if (query.aggregates !== undefined) {
    throw new TypeError(
      `Invalid SELECT query: 'distinct' cannot be combined with 'aggregates' — aggregate SELECTs GROUP BY every non-aggregated projection key, which already deduplicates rows`,
    );
  }
  const joins = (query.joins ?? {}) as Record<string, unknown>;
  const projection = (query.projection ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(projection)) {
    if (key.slice(1) in joins) {
      throw new TypeError(
        `Invalid SELECT query: 'distinct' cannot be combined with join-alias projection '${key}' — the JSON_ROW auto-expansion GROUP BYs the base columns, which already deduplicates rows`,
      );
    }
  }
};

/**
 * Validates `query.aggregates` and pushes the resulting `@key` aggregate
 * keys into `availableKeys` (the projection-resolution scope).
 *
 * @internal
 */
const validateAggregates = (
  query: Record<string, unknown>,
  columnList: string[],
  availableKeys: string[],
): string[] => {
  const aggregateKeys: string[] = [];
  if (query.aggregates === undefined) return aggregateKeys;

  if (
    typeof query.aggregates !== 'object' || query.aggregates === null ||
    Array.isArray(query.aggregates)
  ) {
    throw new TypeError(
      `Invalid SELECT query: 'aggregates' must be an object if provided`,
    );
  }

  const aggregates = query.aggregates as Record<string, unknown>;
  if (Object.keys(aggregates).length === 0) {
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

  return aggregateKeys;
};

/**
 * Pre-walks `query.joins` (without running the full join validator) to
 * collect the flat `Alias.column` list each join exposes. Called *before*
 * aggregate / expression validation so an aggregate referencing a joined
 * column (`column: '@o.@amount'`) sees `o.amount` in scope — otherwise
 * the aggregate column-list check rejects it with "not in the provided
 * column list".
 *
 * Returns `[]` when there are no joins; the actual `assertJoins` call
 * happens later in `validateJoinsBlock`.
 *
 * @internal
 */
const collectJoinedColumns = (query: Record<string, unknown>): string[] => {
  if (query.joins === undefined) return [];
  if (
    typeof query.joins !== 'object' || query.joins === null ||
    Array.isArray(query.joins)
  ) {
    // Shape error — surfaced later by `validateJoinsBlock`. Just return
    // an empty scope here so aggregate validation isn't blocked by it.
    return [];
  }
  const joins = query.joins as Record<string, Record<string, unknown>>;
  const out: string[] = [];
  for (const [alias, joinDef] of Object.entries(joins)) {
    if (
      typeof joinDef === 'object' && joinDef !== null &&
      Array.isArray(joinDef.columns)
    ) {
      for (const col of joinDef.columns) {
        out.push(`${alias}.${col}`);
      }
    }
  }
  return out;
};

/**
 * Validates `query.joins` and pushes their `@Alias` + `@Alias.@column`
 * forms into `availableKeys`. The `joinedColumns` parameter is the
 * pre-collected flat list from {@link collectJoinedColumns}.
 *
 * @internal
 */
const validateJoinsBlock = (
  query: Record<string, unknown>,
  columnList: string[],
  joinedColumns: string[],
  availableKeys: string[],
): void => {
  if (query.joins === undefined) return;

  const joins = query.joins as Record<string, Record<string, unknown>>;

  try {
    assertJoins(query.joins, [...columnList, ...joinedColumns]);
  } catch (error) {
    throw new TypeError(
      `Invalid SELECT query: 'joins' is invalid - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  for (const [alias, joinDef] of Object.entries(joins)) {
    if (Array.isArray(joinDef.columns)) {
      // The join alias itself is a valid projection key — translators
      // auto-expand `@Alias` to a JSON_ROW of every column on the join.
      availableKeys.push(`@${alias}`);
      for (const col of joinDef.columns) {
        availableKeys.push(`@${alias}.@${col}`);
      }
    }
  }
};

/**
 * Validates `query.projection` — required for SELECT. Each key must be
 * `@`-prefixed and resolvable against `availableKeys`; each value is
 * `true` (passthrough) or a non-empty alias string. Returns the
 * projection key list.
 *
 * @internal
 */
const validateProjection = (
  query: Record<string, unknown>,
  availableKeys: string[],
): string[] => {
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

  for (const [key, value] of Object.entries(projection)) {
    validateProjectionEntry(key, value, availableKeys);
  }

  return projectionKeys;
};

/**
 * Validate one `key`/`value` entry of a SELECT projection. Extracted
 * from {@link validateProjection} to keep the outer function's
 * complexity low.
 *
 * @internal
 */
const validateProjectionEntry = (
  key: string,
  value: unknown,
  availableKeys: string[],
): void => {
  if (typeof key !== 'string' || key.trim().length === 0) {
    throw new TypeError(
      `Invalid SELECT query: projection keys must be non-empty strings`,
    );
  }
  if (!key.startsWith('@')) {
    throw new TypeError(
      `Invalid SELECT query: projection key '${key}' must start with '@' prefix`,
    );
  }
  if (!availableKeys.includes(key)) {
    throw new TypeError(
      `Invalid SELECT query: projection key '${key}' does not exist in columns, expressions, aggregates, or joined columns. Available: ${
        availableKeys.join(', ')
      }`,
    );
  }
  if (typeof value !== 'boolean' && typeof value !== 'string') {
    throw new TypeError(
      `Invalid SELECT query: projection['${key}'] must be boolean or string, got ${typeof value}`,
    );
  }
  if (typeof value !== 'string') return;
  if (value.trim().length === 0) {
    throw new TypeError(
      `Invalid SELECT query: projection['${key}'] alias cannot be empty string`,
    );
  }
  // The value is a SQL output-column alias, not a column reference.
  // The `@` prefix is reserved for column identifiers — rejecting it
  // here prevents stray `SELECT "x" AS "@y"` output that downstream
  // INSERT_FROM_QUERY / view consumers can't bind back.
  if (value.startsWith('@')) {
    throw new TypeError(
      `Invalid SELECT query: projection['${key}'] alias must not start with '@' — the alias is the output column name, not a column reference`,
    );
  }
};

/**
 * Validates `query.orderBy`: each key references a projection key or joined
 * column; each value is `'ASC'` or `'DESC'`.
 *
 * @internal
 */
const validateOrderBy = (
  query: Record<string, unknown>,
  projectionKeys: string[],
  joinedColumns: string[],
): void => {
  if (query.orderBy === undefined) return;

  if (
    typeof query.orderBy !== 'object' || query.orderBy === null ||
    Array.isArray(query.orderBy)
  ) {
    throw new TypeError(
      `Invalid SELECT query: 'orderBy' must be an object if provided`,
    );
  }

  const orderBy = query.orderBy as Record<string, unknown>;
  if (Object.keys(orderBy).length === 0) {
    throw new TypeError(
      `Invalid SELECT query: 'orderBy' cannot be an empty object`,
    );
  }

  const allowed = [...projectionKeys, ...joinedColumns];
  for (const [col, direction] of Object.entries(orderBy)) {
    if (!allowed.includes(col)) {
      throw new TypeError(
        `Invalid SELECT query: orderBy key '${col}' must exist in projection or joined columns. Available: ${
          allowed.join(', ')
        }`,
      );
    }
    if (direction !== 'ASC' && direction !== 'DESC') {
      throw new TypeError(
        `Invalid SELECT query: orderBy direction must be 'ASC' or 'DESC', got '${direction}'`,
      );
    }
  }
};

/**
 * Asserts a value is a valid `SELECT` query. Required: `type`, `table`,
 * `columns`, `projection`. Optional: `schema`, `distinct`, `aggregates`,
 * `expressions`, `joins`, `where`, `having`, `orderBy`, `limit`, `offset`.
 *
 * Scoping rules enforced here:
 * - `projection` keys must resolve to a column, expression, aggregate, or
 *   joined column.
 * - `where` may reference columns / expressions / joined columns, but NOT
 *   aggregates (those need GROUP BY semantics — use `having`).
 * - `having` may only reference aggregates, and requires `aggregates` to be
 *   present.
 * - `orderBy` may reference projection keys or joined columns.
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

  assertQueryType(query, 'SELECT', 'SELECT');
  assertTableName(query, 'SELECT');
  assertSchemaName(query, 'SELECT');
  const columnList = assertColumns(query, 'SELECT');
  const availableKeys: string[] = columnList.map((c) => `@${c}`);

  // Pre-collect joined-column names so aggregate / expression validation
  // can reference them. The full join validator runs further down (it
  // needs the projection / where / etc. context to make sense of join
  // `on:` predicates), but the bare list of `<alias>.<col>` entries each
  // join exposes is read straight off `query.joins`.
  const joinedColumns = collectJoinedColumns(query);
  const aggregateAndExpressionScope = [...columnList, ...joinedColumns];

  const aggregateKeys = validateAggregates(
    query,
    aggregateAndExpressionScope,
    availableKeys,
  );

  const expressionKeys: string[] = [];
  for (
    const key of validateExpressions(
      query,
      aggregateAndExpressionScope,
      'SELECT',
    )
  ) {
    expressionKeys.push(`@${key}`);
    availableKeys.push(`@${key}`);
  }

  validateJoinsBlock(query, columnList, joinedColumns, availableKeys);

  const projectionKeys = validateProjection(query, availableKeys);

  validateDistinct(query);

  if (query.where !== undefined) {
    const whereAllowedKeys = columnList.concat(
      expressionKeys.map((k) => k.substring(1)),
      joinedColumns,
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
    // WHERE may not reference aggregates — those need GROUP BY semantics
    // and belong in HAVING.
    const whereObj = query.where as Record<string, unknown>;
    for (const key of Object.keys(whereObj)) {
      if (key.startsWith('@') && aggregateKeys.includes(key)) {
        throw new TypeError(
          `Invalid SELECT query: 'where' cannot reference aggregate '${key}'. Use 'having' for aggregate filters`,
        );
      }
    }
  }

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

  validateOrderBy(query, projectionKeys, joinedColumns);

  if (
    query.limit !== undefined && (
      typeof query.limit !== 'number' || query.limit <= 0 ||
      !Number.isInteger(query.limit)
    )
  ) {
    throw new TypeError(
      `Invalid SELECT query: 'limit' must be a positive integer if provided`,
    );
  }

  if (
    query.offset !== undefined && (
      typeof query.offset !== 'number' || query.offset < 0 ||
      !Number.isInteger(query.offset)
    )
  ) {
    throw new TypeError(
      `Invalid SELECT query: 'offset' must be a non-negative integer if provided`,
    );
  }

  for (const prop of DEPRECATED_PROPS) {
    if (prop in query) {
      throw new TypeError(
        `Invalid SELECT query: '${prop}' is no longer supported. See migration guide.`,
      );
    }
  }
};

/** Type guard for {@link assertSelectQuery}. */
export const isSelectQuery = <
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
>(
  x: unknown,
): x is Query<'SELECT', PT, LT> => {
  try {
    assertSelectQuery(x);
    return true;
  } catch {
    return false;
  }
};
