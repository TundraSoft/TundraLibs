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
import { assertQueryFilter } from '../filters/filterOperator.ts';
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
  'TO_STRING',
]);

const CONDITIONAL_TYPES = new Set<string>(['COALESCE', 'NULLIF', 'CASE']);

const DATE_TYPES = new Set<string>([
  'NOW',
  'CURRENT_DATE',
  'CURRENT_TIME',
  'CURRENT_TIMESTAMP',
  'CURRENT_TIMESTAMPTZ',
  'DATE_ADD',
  'DATE_TRUNC',
  'UNIX_TIMESTAMP',
]);

/**
 * Validate one argument of a conditional expression: `null`, a literal
 * of any type, a column reference, or a nested expression of any kind.
 *
 * @internal
 */
const assertConditionalArg = (
  arg: unknown,
  argName: string,
  type: string,
  columnList: string[] | undefined,
  depth: number,
  maxDepth: number,
): void => {
  if (
    typeof arg !== 'object' || arg === null || arg instanceof Date
  ) {
    if (typeof arg === 'function' || typeof arg === 'symbol') {
      throw new TypeError(
        `Invalid Expression definition: ${argName} in ${type} must be a ` +
          `literal, column identifier or expression, got ${typeof arg}`,
      );
    }
    return;
  }
  try {
    assertExpression(arg, columnList, depth + 1, maxDepth);
  } catch (error) {
    throw new TypeError(
      `Invalid Expression definition: ${argName} contains invalid nested ` +
        `expression in ${type} - ${
          error instanceof Error ? error.message : String(error)
        }`,
    );
  }
};

/**
 * Validate `COALESCE` (two or more args), `NULLIF` (exactly two) and
 * `CASE` (`cases` of `{ when: filter, then }`, optional `else`).
 *
 * @internal
 */
const assertConditionalExpression = (
  x: Expressions,
  columnList: string[] | undefined,
  depth: number,
  maxDepth: number,
): void => {
  const type = x.$$_expression;
  const args = (x as { args?: unknown }).args;
  const check = (arg: unknown, name: string) =>
    assertConditionalArg(arg, name, type, columnList, depth, maxDepth);
  if (type !== 'CASE') {
    const arity = type === 'NULLIF' ? 'exactly 2' : 'at least 2';
    if (
      !Array.isArray(args) ||
      (type === 'NULLIF' ? args.length !== 2 : args.length < 2)
    ) {
      throw new TypeError(
        `Invalid Expression definition: ${type} needs an 'args' array of ` +
          `${arity} values`,
      );
    }
    args.forEach((a, i) => check(a, `args[${i}]`));
    return;
  }
  const body = args as { cases?: unknown; else?: unknown } | undefined;
  if (
    typeof body !== 'object' || body === null ||
    !Array.isArray(body.cases) || body.cases.length === 0
  ) {
    throw new TypeError(
      `Invalid Expression definition: CASE needs 'args.cases', a non-empty ` +
        `array of { when, then }`,
    );
  }
  body.cases.forEach((c: unknown, i: number) => {
    if (
      typeof c !== 'object' || c === null || !('when' in c) || !('then' in c)
    ) {
      throw new TypeError(
        `Invalid Expression definition: CASE cases[${i}] must be { when, then }`,
      );
    }
    try {
      assertQueryFilter(c.when, columnList);
    } catch (error) {
      throw new TypeError(
        `Invalid Expression definition: CASE cases[${i}].when is not a ` +
          `valid filter - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
    check(c.then, `cases[${i}].then`);
  });
  if ('else' in body) check(body.else, 'else');
};

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
  if (CONDITIONAL_TYPES.has(type)) {
    assertConditionalExpression(x, columnList, depth, maxDepth);
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
