/**
 * Aggregate Function Validators
 *
 * Validation functions for the aggregate-expression types in OQL.
 * Covers `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `STRING_AGG`, `ARRAY_AGG`,
 * `JSON_ROW`. Each aggregate type has a paired `assertXxxAggregate` /
 * `isXxxAggregate` and the top-level `assertAggregate` / `isAggregate`
 * dispatches by the `$$_aggregate` discriminator.
 *
 * ## Shape
 *
 * Every aggregate is an object with at least a `$$_aggregate: AggregateFunction`.
 * Most also take a `column` (column identifier or nested expression) and
 * an optional `distinct: boolean`. `STRING_AGG` adds a `separator: string`,
 * and `JSON_ROW` takes a `columns: Record<string, ColumnOrExpression>` map
 * instead of a single column.
 *
 * @module asserts/Aggregates
 */

import type { AggregateFunction, Aggregates } from '../types/mod.ts';
import { isColumnIdentifier } from './columnIdentifier.ts';
import {
  assertExpression,
  assertNumericExpression,
} from './expressions/mod.ts';

/** All recognised aggregate function names. @internal */
const AGGREGATE_TYPES: readonly AggregateFunction[] = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'STRING_AGG',
  'ARRAY_AGG',
  'JSON_ROW',
] as const;

/**
 * Validate the basic aggregate envelope and return a narrowed object.
 *
 * Confirms `x` is a non-null object and (when `expectedType` is given)
 * that `x.$$_aggregate` matches. Returns the value as `Record<string, unknown>`
 * so callers can index it without further casts.
 *
 * @internal
 */
const narrowAggregate = (
  x: unknown,
  expectedType?: AggregateFunction,
): Record<string, unknown> => {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) {
    throw new TypeError(
      `Invalid Aggregate definition: Expected object, got ${typeof x}`,
    );
  }
  const obj = x as Record<string, unknown>;

  if (!('$$_aggregate' in obj)) {
    throw new TypeError(
      `Invalid Aggregate definition: Missing '$$_aggregate' property`,
    );
  }
  if (typeof obj.$$_aggregate !== 'string') {
    throw new TypeError(
      `Invalid Aggregate definition: '$$_aggregate' must be a string, got ${typeof obj
        .$$_aggregate}`,
    );
  }
  if (!AGGREGATE_TYPES.includes(obj.$$_aggregate as AggregateFunction)) {
    throw new TypeError(
      `Invalid Aggregate type: Expected one of ${
        AGGREGATE_TYPES.join(', ')
      }, got '${obj.$$_aggregate}'`,
    );
  }
  if (expectedType !== undefined && obj.$$_aggregate !== expectedType) {
    throw new TypeError(
      `Invalid Aggregate definition: Expected type '${expectedType}', got '${obj.$$_aggregate}'`,
    );
  }
  return obj;
};

/**
 * Validate a `column` reference (column identifier or nested expression).
 *
 * `requireNumeric` switches the nested-expression validator from any
 * expression to a numeric-only expression — used by SUM / AVG / MIN /
 * MAX whose semantics demand numeric input.
 *
 * @internal
 */
const validateColumnOrExpression = (
  column: unknown,
  aggregateType: AggregateFunction,
  columnList?: string[],
  requireNumeric = false,
): void => {
  if (typeof column === 'string') {
    // Known column reference (well-formed AND in the columnList, or
    // columnList undefined). Anything else — bare strings, @-strings
    // not in the list — is invalid in the column slot of an aggregate.
    if (isColumnIdentifier(column, columnList)) return;
    throw new TypeError(
      `Invalid ${aggregateType} aggregate: Column must be a column ` +
        `identifier (starting with '@') or an expression, got string literal`,
    );
  }
  if (typeof column !== 'object' || column === null) {
    throw new TypeError(
      `Invalid ${aggregateType} aggregate: Column must be a column identifier ` +
        `or expression, got ${typeof column}`,
    );
  }
  try {
    if (requireNumeric) {
      assertNumericExpression(column, columnList);
    } else {
      assertExpression(column, columnList);
    }
  } catch (error) {
    throw new TypeError(
      `Invalid ${aggregateType} aggregate: Invalid expression - ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
};

/**
 * Validate the optional `distinct` flag on an already-narrowed aggregate.
 * @internal
 */
const validateDistinct = (
  obj: Record<string, unknown>,
  aggregateType: AggregateFunction,
): void => {
  if (obj.distinct === undefined) return;
  if (typeof obj.distinct !== 'boolean') {
    throw new TypeError(
      `Invalid ${aggregateType} aggregate: 'distinct' must be a boolean, got ${typeof obj
        .distinct}`,
    );
  }
};

/**
 * Validate that a single-column aggregate has a `column` property and
 * that its value is a column reference or expression.
 *
 * Most aggregates (SUM, AVG, MIN, MAX, STRING_AGG, ARRAY_AGG) share this
 * shape; COUNT is the exception (column is optional) and JSON_ROW has
 * its own multi-column shape.
 *
 * @internal
 */
const validateSingleColumnAggregate = (
  obj: Record<string, unknown>,
  aggregateType: AggregateFunction,
  columnList: string[] | undefined,
  requireNumeric: boolean,
): void => {
  if (!('column' in obj)) {
    throw new TypeError(
      `Invalid ${aggregateType} aggregate: Missing 'column' property`,
    );
  }
  validateColumnOrExpression(
    obj.column,
    aggregateType,
    columnList,
    requireNumeric,
  );
  validateDistinct(obj, aggregateType);
};

//#region COUNT

/**
 * Asserts that a value is a valid COUNT aggregate.
 *
 * `COUNT` is the only aggregate where `column` is optional — without it,
 * the aggregate is `COUNT(*)` (count all rows) and `distinct` MUST also
 * be absent. With `column`, optional `distinct: true` makes it
 * `COUNT(DISTINCT column)`.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * assertCountAggregate({ $$_aggregate: 'COUNT' });                              // COUNT(*)
 * assertCountAggregate({ $$_aggregate: 'COUNT', column: '@id' }, ['id']);       // COUNT(id)
 * assertCountAggregate(
 *   { $$_aggregate: 'COUNT', column: '@email', distinct: true },
 *   ['email'],
 * );                                                                    // COUNT(DISTINCT email)
 * ```
 */
export const assertCountAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'COUNT' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'COUNT' }> => {
  const obj = narrowAggregate(x, 'COUNT');

  if ('column' in obj) {
    validateColumnOrExpression(obj.column, 'COUNT', columnList);
    validateDistinct(obj, 'COUNT');
    return;
  }
  // COUNT(*) — distinct must be absent.
  if (obj.distinct !== undefined) {
    throw new TypeError(
      `Invalid COUNT aggregate: 'distinct' cannot be used without a column`,
    );
  }
};

/**
 * Type guard for COUNT aggregates.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @returns `true` if the value is a valid COUNT aggregate, `false` otherwise
 */
export const isCountAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'COUNT' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'COUNT' }> => {
  try {
    assertCountAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

//#endregion COUNT

//#region SUM / AVG / MIN / MAX (numeric single-column aggregates)

/**
 * Asserts that a value is a valid SUM aggregate.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * assertSumAggregate({ $$_aggregate: 'SUM', column: '@amount' }, ['amount']);
 * assertSumAggregate(
 *   { $$_aggregate: 'SUM', column: { $$_aggregate: 'MULTIPLY', args: ['@qty', '@price'] } },
 *   ['qty', 'price'],
 * );
 * ```
 */
export const assertSumAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'SUM' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'SUM' }> => {
  validateSingleColumnAggregate(
    narrowAggregate(x, 'SUM'),
    'SUM',
    columnList,
    true,
  );
};

/** Type guard for SUM aggregates. */
export const isSumAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'SUM' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'SUM' }> => {
  try {
    assertSumAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid AVG aggregate.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 */
export const assertAvgAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'AVG' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'AVG' }> => {
  validateSingleColumnAggregate(
    narrowAggregate(x, 'AVG'),
    'AVG',
    columnList,
    true,
  );
};

/** Type guard for AVG aggregates. */
export const isAvgAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'AVG' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'AVG' }> => {
  try {
    assertAvgAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid MIN aggregate.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 */
export const assertMinAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'MIN' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'MIN' }> => {
  validateSingleColumnAggregate(
    narrowAggregate(x, 'MIN'),
    'MIN',
    columnList,
    true,
  );
};

/** Type guard for MIN aggregates. */
export const isMinAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'MIN' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'MIN' }> => {
  try {
    assertMinAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid MAX aggregate.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 */
export const assertMaxAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'MAX' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'MAX' }> => {
  validateSingleColumnAggregate(
    narrowAggregate(x, 'MAX'),
    'MAX',
    columnList,
    true,
  );
};

/** Type guard for MAX aggregates. */
export const isMaxAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'MAX' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'MAX' }> => {
  try {
    assertMaxAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

//#endregion SUM / AVG / MIN / MAX

//#region STRING_AGG / ARRAY_AGG

/**
 * Asserts that a value is a valid STRING_AGG aggregate.
 *
 * STRING_AGG concatenates values; the optional `separator` is the
 * delimiter (defaults to `,` at SQL level when omitted).
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * assertStringAggAggregate(
 *   { $$_aggregate: 'STRING_AGG', column: '@name', separator: ', ' },
 *   ['name'],
 * );
 * assertStringAggAggregate(
 *   { $$_aggregate: 'STRING_AGG', column: '@tag', separator: ';', distinct: true },
 *   ['tag'],
 * );
 * ```
 */
export const assertStringAggAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'STRING_AGG' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'STRING_AGG' }> => {
  const obj = narrowAggregate(x, 'STRING_AGG');
  validateSingleColumnAggregate(obj, 'STRING_AGG', columnList, false);
  if (obj.separator !== undefined && typeof obj.separator !== 'string') {
    throw new TypeError(
      `Invalid STRING_AGG aggregate: 'separator' must be a string, got ${typeof obj
        .separator}`,
    );
  }
};

/** Type guard for STRING_AGG aggregates. */
export const isStringAggAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'STRING_AGG' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'STRING_AGG' }> => {
  try {
    assertStringAggAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid ARRAY_AGG aggregate.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * assertArrayAggAggregate({ $$_aggregate: 'ARRAY_AGG', column: '@id' }, ['id']);
 * assertArrayAggAggregate(
 *   { $$_aggregate: 'ARRAY_AGG', column: '@category', distinct: true },
 *   ['category'],
 * );
 * ```
 */
export const assertArrayAggAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'ARRAY_AGG' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'ARRAY_AGG' }> => {
  validateSingleColumnAggregate(
    narrowAggregate(x, 'ARRAY_AGG'),
    'ARRAY_AGG',
    columnList,
    false,
  );
};

/** Type guard for ARRAY_AGG aggregates. */
export const isArrayAggAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'ARRAY_AGG' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'ARRAY_AGG' }> => {
  try {
    assertArrayAggAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

//#endregion STRING_AGG / ARRAY_AGG

//#region JSON_ROW

/**
 * Asserts that a value is a valid JSON_ROW aggregate.
 *
 * JSON_ROW takes a `columns: Record<string, ColumnOrExpression>` map —
 * each key becomes a JSON property in the output row. `distinct` is
 * not supported.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the aggregate structure is invalid
 *
 * @example
 * ```ts
 * assertJsonRowAggregate(
 *   {
 *     $$_aggregate: 'JSON_ROW',
 *     columns: { userId: '@id', userName: '@name' },
 *   },
 *   ['id', 'name'],
 * );
 * ```
 */
export const assertJsonRowAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { $$_aggregate: 'JSON_ROW' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { $$_aggregate: 'JSON_ROW' }> => {
  const obj = narrowAggregate(x, 'JSON_ROW');

  if (!('columns' in obj)) {
    throw new TypeError(
      `Invalid JSON_ROW aggregate: Missing 'columns' property`,
    );
  }
  const columns = obj.columns;
  if (
    typeof columns !== 'object' || columns === null || Array.isArray(columns)
  ) {
    throw new TypeError(
      `Invalid JSON_ROW aggregate: 'columns' must be an object (key-value mapping)`,
    );
  }

  for (const [key, value] of Object.entries(columns)) {
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError(
        `Invalid JSON_ROW aggregate: Column keys must be non-empty strings`,
      );
    }
    validateColumnOrExpression(value, 'JSON_ROW', columnList);
  }

  if (obj.distinct !== undefined) {
    throw new TypeError(
      `Invalid JSON_ROW aggregate: 'distinct' is not supported for JSON_ROW`,
    );
  }
};

/** Type guard for JSON_ROW aggregates. */
export const isJsonRowAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { $$_aggregate: 'JSON_ROW' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { $$_aggregate: 'JSON_ROW' }> => {
  try {
    assertJsonRowAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

//#endregion JSON_ROW

//#region Top-level dispatcher

/**
 * Asserts that a value is a valid aggregate of any type.
 *
 * Dispatches by the `$$_aggregate` discriminator to the matching specific
 * validator.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @throws {TypeError} If the value is not a valid aggregate
 *
 * @example
 * ```ts
 * assertAggregate({ $$_aggregate: 'COUNT' });
 * assertAggregate({ $$_aggregate: 'SUM', column: '@amount' }, ['amount']);
 * assertAggregate(
 *   { $$_aggregate: 'JSON_ROW', columns: { id: '@id', name: '@name' } },
 *   ['id', 'name'],
 * );
 * ```
 */
export const assertAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Aggregates = (
  x: unknown,
  columnList?: string[],
): asserts x is Aggregates => {
  const obj = narrowAggregate(x);
  switch (obj.$$_aggregate as AggregateFunction) {
    case 'COUNT':
      assertCountAggregate(x, columnList);
      return;
    case 'SUM':
      assertSumAggregate(x, columnList);
      return;
    case 'AVG':
      assertAvgAggregate(x, columnList);
      return;
    case 'MIN':
      assertMinAggregate(x, columnList);
      return;
    case 'MAX':
      assertMaxAggregate(x, columnList);
      return;
    case 'STRING_AGG':
      assertStringAggAggregate(x, columnList);
      return;
    case 'ARRAY_AGG':
      assertArrayAggAggregate(x, columnList);
      return;
    case 'JSON_ROW':
      assertJsonRowAggregate(x, columnList);
      return;
  }
};

/**
 * Type guard for any aggregate.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @returns `true` if the value is a valid aggregate, `false` otherwise
 */
export const isAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Aggregates = (
  x: unknown,
  columnList?: string[],
): x is Aggregates => {
  try {
    assertAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

//#endregion Top-level dispatcher
