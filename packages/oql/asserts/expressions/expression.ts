/**
 * Top-level Expression dispatcher.
 *
 * Routes to the matching category-specific validator based on the
 * `$$_expression` discriminator. Cheaper than the try-each-category
 * pattern: one set lookup, then one delegate.
 *
 * @module asserts/Expressions/Expression
 */

import type { Expressions } from '../../types/mod.ts';
import { assertBaseExpression } from './base.ts';
import { assertDateExpression } from './date.ts';
import { assertNumericExpression } from './numeric.ts';
import { assertStringExpression } from './string.ts';

/** Maximum nesting depth for Expressions to prevent stack overflow. @internal */
const MAX_EXPRESSION_DEPTH = 10;

/**
 * Numeric expression type names. Kept here (rather than imported) so
 * {@link assertExpression} can dispatch with a single string check
 * without pulling each category's full implementation.
 *
 * @internal
 */
const NUMERIC_TYPES = new Set<string>([
  'ADD',
  'SUBTRACT',
  'MULTIPLY',
  'DIVIDE',
  'MODULO',
  'ABS',
  'CEIL',
  'FLOOR',
  'ROUND',
  'POWER',
  'SQRT',
  'LENGTH',
  'DATE_DIFF',
]);

const STRING_TYPES = new Set<string>([
  'CONCAT',
  'LOWER',
  'UPPER',
  'TRIM',
  'LTRIM',
  'RTRIM',
  'SUBSTR',
  'REPLACE',
  'LPAD',
  'RPAD',
  'UUID',
  'ENCRYPT',
  'DECRYPT',
  'HASH',
]);

const DATE_TYPES = new Set<string>([
  'NOW',
  'CURRENT_DATE',
  'CURRENT_TIME',
  'CURRENT_TIMESTAMP',
  'CURRENT_TIMESTAMPTZ',
  'DATE_ADD',
]);

/**
 * Asserts that a value is a valid expression of any type.
 *
 * Dispatches to the matching category validator (date, numeric, or
 * string) based on the `$$_expression` discriminator.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @param depth - Current recursion depth (internal use, default: 0)
 * @param maxDepth - Maximum allowed recursion depth (default: 10)
 * @throws {TypeError} If the value is not a valid expression
 * @throws {TypeError} If the expression type is not recognized
 * @throws {TypeError} If maximum nesting depth is exceeded
 *
 * @example
 * ```ts
 * assertExpression({ $$_expression: 'NOW' });                                // date
 * assertExpression({ $$_expression: 'ADD', args: [1, 2, 3] });               // numeric
 * assertExpression({ $$_expression: 'CONCAT', args: ['Hello ', 'World'] });  // string
 * assertExpression(
 *   { $$_expression: 'MULTIPLY', args: ['@price', '@quantity'] },
 *   ['price', 'quantity'],
 * );
 * ```
 */
export const assertExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Expressions = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = MAX_EXPRESSION_DEPTH,
): asserts x is Expressions => {
  if (depth > maxDepth) {
    throw new TypeError(
      `Expression exceeds maximum nesting depth of ${maxDepth}. ` +
        `This may indicate overly complex expression or circular reference.`,
    );
  }
  assertBaseExpression(x);
  const type = x.$$_expression as string;

  if (NUMERIC_TYPES.has(type)) {
    assertNumericExpression(x, columnList, depth, maxDepth);
    return;
  }
  if (STRING_TYPES.has(type)) {
    assertStringExpression(x, columnList, depth, maxDepth);
    return;
  }
  if (DATE_TYPES.has(type)) {
    assertDateExpression(x, columnList, depth, maxDepth);
    return;
  }
  throw new TypeError(
    `Invalid Expression type: Unknown expression type '${type}'`,
  );
};

/**
 * Type guard for any expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (no '@' prefix)
 * @param depth - Current recursion depth (internal use, default: 0)
 * @param maxDepth - Maximum allowed recursion depth (default: 10)
 * @returns `true` if the value is a valid expression, `false` otherwise
 */
export const isExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => x is Expressions = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = MAX_EXPRESSION_DEPTH,
): x is Expressions => {
  try {
    assertExpression(x, columnList, depth, maxDepth);
    return true;
  } catch {
    return false;
  }
};
