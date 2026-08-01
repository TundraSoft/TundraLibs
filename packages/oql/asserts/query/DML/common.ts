/**
 * Shared DML validators: pre-declared expressions, per-row data entries.
 *
 * @module asserts/Query/DML/Common
 */

import { assertExpression } from '../../expressions/mod.ts';

/**
 * Validates an optional `expressions` map on a DML query: each key is a
 * plain (non-`@`-prefixed) name and each value is a valid `Expression`.
 * Returns the list of expression keys.
 *
 * @param query - The query object that may contain an `expressions` property
 * @param columnList - Valid column names for nested expression validation
 * @param context - Context label included in error messages
 * @returns The expression key list, or `[]` if `expressions` was absent
 */
export const validateExpressions = (
  query: Record<string, unknown>,
  columnList: string[],
  context: string,
): string[] => {
  if (query.expressions === undefined) return [];

  if (
    typeof query.expressions !== 'object' || query.expressions === null ||
    Array.isArray(query.expressions)
  ) {
    throw new TypeError(
      `Invalid ${context} query: 'expressions' must be a non-null object`,
    );
  }

  const expressions = query.expressions as Record<string, unknown>;
  const expressionKeys = Object.keys(expressions);

  if (expressionKeys.length === 0) {
    throw new TypeError(
      `Invalid ${context} query: 'expressions' cannot be empty if provided`,
    );
  }

  for (const [key, expr] of Object.entries(expressions)) {
    if (key.startsWith('@')) {
      throw new TypeError(
        `Invalid ${context} query: expression key '${key}' must not start with '@'`,
      );
    }

    try {
      assertExpression(expr, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid ${context} query: expression '${key}' is invalid: ${
          (error as Error).message
        }`,
      );
    }
  }

  return expressionKeys;
};

/**
 * Validates a single `key`/`value` pair of a DML data object. The key must be
 * one of the listed columns; the value must be:
 *
 * - `null` / `undefined`
 * - a `Date`
 * - a primitive (`string` / `number` / `boolean` / `bigint`)
 * - a valid `Expression` (a non-null object with a `$$_expression` discriminator)
 * - a literal object (treated as an opaque payload, e.g. for JSON/JSONB
 *   columns) — anything *without* a `$$_expression` field at the top level
 *
 * **Expression vs literal disambiguation.** Mirrors the translator's
 * behaviour at `_translateValue` / `_renderInsertValue`: a non-Date
 * object with a top-level `$$_expression` field is treated as an
 * Expression and validated as one; without it, the value is passed
 * through as a literal payload (JSON / JSONB column data). The
 * `$$_expression` key is deliberately distinctive so that no
 * real-world JSON payload accidentally collides with it.
 *
 * `allowColumnReferences` defaults to `true`. INSERT passes `false`
 * because an INSERT row doesn't have other rows' columns to reference;
 * UPDATE and UPSERT keep the default so expressions can reference the
 * row being updated (e.g. `{ count: { $$_expression: 'ADD', args: ['@count', 1] } }`).
 *
 * @param key - The data key
 * @param value - The data value
 * @param columnList - Valid column names
 * @param context - Context label included in error messages
 * @param options.allowColumnReferences - When false, reject `@col` references
 *   anywhere inside the value's expression tree
 */
export const validateDataEntry = (
  key: string,
  value: unknown,
  columnList: string[],
  context: string,
  options?: { allowColumnReferences?: boolean },
): void => {
  if (!columnList.includes(key)) {
    throw new TypeError(
      `Invalid ${context}: key '${key}' is not in columns list`,
    );
  }

  if (value === null || value === undefined) return;
  if (value instanceof Date) return;

  if (typeof value === 'object') {
    validateObjectDataValue(key, value, columnList, context, options);
    return;
  }

  if (
    typeof value !== 'string' && typeof value !== 'number' &&
    typeof value !== 'boolean' && typeof value !== 'bigint'
  ) {
    throw new TypeError(
      `Invalid ${context}: ${key} must be a primitive value, Date, Expression, or literal object`,
    );
  }
};

/**
 * Object-branch of {@link validateDataEntry}. Splits Expression
 * validation from literal-payload acceptance. Pulled out to keep the
 * outer function's branching simple.
 *
 * @internal
 */
const validateObjectDataValue = (
  key: string,
  value: object,
  columnList: string[],
  context: string,
  options?: { allowColumnReferences?: boolean },
): void => {
  if (Array.isArray(value)) {
    throw new TypeError(
      `Invalid ${context}: ${key} cannot be an array; expected a primitive, Date, Expression, or literal object payload`,
    );
  }

  // Expression vs literal: only validate as Expression when the value
  // carries a `$$_expression` discriminator (mirrors the translator's check).
  // Objects without `$$_expression` are passed through as literal payloads
  // (typical case: JSON / JSONB column values).
  if (!('$$_expression' in value)) return;

  const allowColumnReferences = options?.allowColumnReferences ?? true;

  try {
    assertExpression(value, allowColumnReferences ? columnList : undefined);

    if (!allowColumnReferences && hasColumnReference(value)) {
      throw new TypeError(
        'Column references (e.g., @columnName) are not allowed in INSERT expressions',
      );
    }
  } catch (error) {
    throw new TypeError(
      `Invalid ${context}: ${key} has invalid expression: ${
        (error as Error).message
      }`,
    );
  }
};

/**
 * Recursively checks whether `expr` contains any column reference (string
 * starting with `@`). Used to enforce the no-column-references rule on
 * INSERT data values.
 *
 * @internal
 */
const hasColumnReference = (expr: unknown): boolean => {
  if (typeof expr === 'string') return expr.startsWith('@');
  if (Array.isArray(expr)) return expr.some(hasColumnReference);
  if (typeof expr === 'object' && expr !== null) {
    return Object.values(expr).some(hasColumnReference);
  }
  return false;
};
