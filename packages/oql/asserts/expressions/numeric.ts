/**
 * Numeric Expression Validators
 *
 * This module provides validation functions for numeric/mathematical expressions in OQL.
 * It includes assertion and type guard functions for various numeric operations:
 * - ADD: Sum multiple values
 * - SUBTRACT: Subtract values from first argument
 * - MULTIPLY: Multiply values together
 * - DIVIDE: Divide first value by second
 * - MODULO: Remainder after division
 * - ABS: Absolute value (remove negative sign)
 * - CEIL: Round up to nearest integer
 * - FLOOR: Round down to nearest integer
 * - ROUND: Round to nearest integer
 * - POWER: Raise base to exponent power
 * - SQRT: Square root of a number
 * - LENGTH: Get string length (returns number)
 *
 * @module asserts/Expressions/Numeric
 */

import type { Expressions, NumericExpressions } from '../../types/mod.ts';
import { isColumnIdentifier } from '../columnIdentifier.ts';
import { assertBaseExpression, validateTimeUnits } from './base.ts';

/**
 * One unified arg validator for numeric / string / date contexts. Each
 * `kind` defines what literal types are accepted; column references
 * (`@col`) are always allowed.
 *
 * - `numeric`: number, bigint, column ref, or nested numeric expression
 *              (recurses to `assertNumericExpression`). Used by ADD, SUB,
 *              MUL, DIV, MOD, ABS, CEIL, FLOOR, ROUND, POWER, SQRT.
 * - `string`:  any string (literal or column ref). Used by LENGTH.
 * - `date`:    Date instance or column ref. Used by DATE_DIFF.
 *
 * @internal
 */
const validateExprArg = (
  arg: unknown,
  argName: string,
  expressionType: string,
  kind: 'numeric' | 'string' | 'date',
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): void => {
  // Known column reference (well-formed AND in the columnList, or
  // columnList undefined). Anything else falls through to the
  // kind-specific literal-validation path below — including @-strings
  // that aren't in the list, which become literals (string context)
  // or get rejected as wrong-type (numeric/date context).
  if (isColumnIdentifier(arg, columnList)) return;

  if (kind === 'string') {
    if (typeof arg !== 'string') {
      throw new TypeError(
        `Invalid Expression definition: ${argName} must be a string ` +
          `or column identifier in ${expressionType} expression, got ${typeof arg}`,
      );
    }
    return; // plain string literal is OK in string context
  }
  // Reject string literals in numeric/date contexts (only `@col` strings allowed).
  if (typeof arg === 'string') {
    throw new TypeError(
      `Invalid Expression definition: ${argName} must be a ${
        kind === 'numeric' ? 'number' : 'Date'
      } or column identifier in ${expressionType} expression, got string literal`,
    );
  }
  if (kind === 'date') {
    if (!(arg instanceof Date)) {
      throw new TypeError(
        `Invalid Expression definition: ${argName} must be a Date or ` +
          `column identifier in ${expressionType} expression, got ${typeof arg}`,
      );
    }
    return;
  }
  // numeric: literal number / bigint / nested numeric expression.
  if (typeof arg === 'number' || typeof arg === 'bigint') return;
  if (typeof arg === 'object' && arg !== null && '$$_expression' in arg) {
    try {
      assertNumericExpression(arg, columnList, depth + 1, maxDepth);
      return;
    } catch (error) {
      throw new TypeError(
        `Invalid Expression definition: ${argName} contains invalid ` +
          `nested expression in ${expressionType} - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }
  throw new TypeError(
    `Invalid Expression definition: ${argName} must be a number, bigint, ` +
      `column identifier, or nested expression in ${expressionType} ` +
      `expression, got ${typeof arg}`,
  );
};

/**
 * Helper function to validate array-based numeric expressions.
 * Used by ADD, SUBTRACT, MULTIPLY, DIVIDE, MODULO, ABS, CEIL, FLOOR, ROUND, SQRT.
 *
 * @param x - The expression to validate
 * @param type - The expression type name
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @param minArgs - Minimum number of arguments required (default: 1)
 * @param depth - Current recursion depth (internal use, default: 0)
 * @param maxDepth - Maximum allowed recursion depth (default: 10)
 * @throws {TypeError} If the expression structure is invalid
 * @internal
 */
const assertArrayNumericExpression = (
  x: unknown,
  type: string,
  columnList?: string[],
  minArgs = 1,
  depth = 0,
  maxDepth = 10,
): void => {
  assertBaseExpression(x, type);
  if (!('args' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'args' property for ${type} expression`,
    );
  }
  if (!Array.isArray(x.args) || x.args.length < minArgs) {
    throw new TypeError(
      `Invalid Expression definition: 'args' must be an array with at least ${minArgs} element(s) for ${type} expression`,
    );
  }
  for (let i = 0; i < x.args.length; i++) {
    validateExprArg(
      x.args[i],
      `args[${i}]`,
      type,
      'numeric',
      columnList,
      depth,
      maxDepth,
    );
  }
};

/**
 * Asserts that a value is a valid ADD expression.
 *
 * The ADD expression sums multiple numeric values. All arguments can be numeric
 * literals (number or bigint) or column identifiers.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid ADD expression
 * @throws {TypeError} If args is not an array or contains invalid values
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'ADD',
 *   args: ['@price', '@tax', '@shipping']
 * };
 * assertAddExpression(expr, ['price', 'tax', 'shipping']);
 * ```
 */
export const assertAddExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'ADD' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'ADD' }> => {
  assertArrayNumericExpression(x, 'ADD', columnList, 1, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid ADD expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid ADD expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'ADD',
 *   args: ['@price', '@tax']
 * };
 *
 * if (isAddExpression(expr, ['price', 'tax'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'ADD' }>
 *   console.log(`Adding ${expr.args.length} values`);
 * }
 * ```
 */
export const isAddExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'ADD' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'ADD' }> => {
  try {
    assertAddExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid SUBTRACT expression.
 *
 * The SUBTRACT expression subtracts all remaining arguments from the first argument.
 * All arguments can be numeric literals (number or bigint) or column identifiers.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid SUBTRACT expression
 * @throws {TypeError} If args is not an array or contains invalid values
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'SUBTRACT',
 *   args: ['@balance', '@withdrawal']
 * };
 * assertSubtractExpression(expr, ['balance', 'withdrawal']);
 * ```
 */
export const assertSubtractExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'SUBTRACT' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'SUBTRACT' }> => {
  assertArrayNumericExpression(x, 'SUBTRACT', columnList, 2, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid SUBTRACT expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid SUBTRACT expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'SUBTRACT',
 *   args: ['@total', '@discount']
 * };
 *
 * if (isSubtractExpression(expr, ['total', 'discount'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'SUBTRACT' }>
 *   console.log('Calculating difference');
 * }
 * ```
 */
export const isSubtractExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'SUBTRACT' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'SUBTRACT' }> => {
  try {
    assertSubtractExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid MULTIPLY expression.
 *
 * The MULTIPLY expression calculates the product of all numeric arguments.
 * All arguments can be numeric literals (number or bigint) or column identifiers.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid MULTIPLY expression
 * @throws {TypeError} If args is not an array or contains invalid values
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'MULTIPLY',
 *   args: ['@quantity', '@unit_price']
 * };
 * assertMultiplyExpression(expr, ['quantity', 'unit_price']);
 * ```
 */
export const assertMultiplyExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'MULTIPLY' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'MULTIPLY' }> => {
  assertArrayNumericExpression(x, 'MULTIPLY', columnList, 1, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid MULTIPLY expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid MULTIPLY expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'MULTIPLY',
 *   args: ['@quantity', '@price']
 * };
 *
 * if (isMultiplyExpression(expr, ['quantity', 'price'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'MULTIPLY' }>
 *   console.log('Calculating product');
 * }
 * ```
 */
export const isMultiplyExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'MULTIPLY' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'MULTIPLY' }> => {
  try {
    assertMultiplyExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid DIVIDE expression.
 *
 * The DIVIDE expression divides the first argument by the second argument.
 * All arguments can be numeric literals (number or bigint) or column identifiers.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid DIVIDE expression
 * @throws {TypeError} If args is not an array with exactly 2 elements
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'DIVIDE',
 *   args: ['@total', '@count']
 * };
 * assertDivideExpression(expr, ['total', 'count']);
 * ```
 */
export const assertDivideExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'DIVIDE' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'DIVIDE' }> => {
  assertArrayNumericExpression(x, 'DIVIDE', columnList, 2, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid DIVIDE expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid DIVIDE expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'DIVIDE',
 *   args: ['@total', '@count']
 * };
 *
 * if (isDivideExpression(expr, ['total', 'count'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'DIVIDE' }>
 *   console.log('Calculating division');
 * }
 * ```
 */
export const isDivideExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'DIVIDE' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'DIVIDE' }> => {
  try {
    assertDivideExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid MODULO expression.
 *
 * The MODULO expression calculates the remainder after dividing the first argument
 * by the second argument. All arguments can be numeric literals or column identifiers.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid MODULO expression
 * @throws {TypeError} If args is not an array with exactly 2 elements
 *
 * @example
 * ```ts
 * // Check if even/odd
 * const expr = {
 *   $$_expression: 'MODULO',
 *   args: ['@number', 2]
 * };
 * assertModuloExpression(expr, ['number']);
 * ```
 */
export const assertModuloExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'MODULO' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'MODULO' }> => {
  assertArrayNumericExpression(x, 'MODULO', columnList, 2, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid MODULO expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid MODULO expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'MODULO',
 *   args: ['@value', 10]
 * };
 *
 * if (isModuloExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'MODULO' }>
 *   console.log('Calculating remainder');
 * }
 * ```
 */
export const isModuloExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'MODULO' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'MODULO' }> => {
  try {
    assertModuloExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid ABS expression.
 *
 * The ABS expression returns the absolute (non-negative) value of a number.
 * The argument can be a numeric literal or column identifier.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid ABS expression
 * @throws {TypeError} If args is not an array with at least one element
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'ABS',
 *   args: ['@temperature_difference']
 * };
 * assertAbsExpression(expr, ['temperature_difference']);
 * ```
 */
export const assertAbsExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'ABS' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'ABS' }> => {
  assertArrayNumericExpression(x, 'ABS', columnList, 1, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid ABS expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid ABS expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'ABS',
 *   args: ['@value']
 * };
 *
 * if (isAbsExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'ABS' }>
 *   console.log('Will return absolute value');
 * }
 * ```
 */
export const isAbsExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'ABS' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'ABS' }> => {
  try {
    assertAbsExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid CEIL expression.
 *
 * The CEIL expression rounds a number up to the nearest integer.
 * The argument can be a numeric literal or column identifier.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid CEIL expression
 * @throws {TypeError} If args is not an array with at least one element
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'CEIL',
 *   args: ['@price']
 * };
 * assertCeilExpression(expr, ['price']);
 * ```
 */
export const assertCeilExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'CEIL' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'CEIL' }> => {
  assertArrayNumericExpression(x, 'CEIL', columnList, 1, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid CEIL expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid CEIL expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'CEIL',
 *   args: ['@value']
 * };
 *
 * if (isCeilExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'CEIL' }>
 *   console.log('Will round up');
 * }
 * ```
 */
export const isCeilExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'CEIL' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'CEIL' }> => {
  try {
    assertCeilExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid FLOOR expression.
 *
 * The FLOOR expression rounds a number down to the nearest integer.
 * The argument can be a numeric literal or column identifier.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid FLOOR expression
 * @throws {TypeError} If args is not an array with at least one element
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'FLOOR',
 *   args: ['@rating']
 * };
 * assertFloorExpression(expr, ['rating']);
 * ```
 */
export const assertFloorExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'FLOOR' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'FLOOR' }> => {
  assertArrayNumericExpression(x, 'FLOOR', columnList, 1, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid FLOOR expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid FLOOR expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'FLOOR',
 *   args: ['@value']
 * };
 *
 * if (isFloorExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'FLOOR' }>
 *   console.log('Will round down');
 * }
 * ```
 */
export const isFloorExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'FLOOR' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'FLOOR' }> => {
  try {
    assertFloorExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid ROUND expression.
 *
 * The ROUND expression rounds a number to the nearest integer.
 * The argument can be a numeric literal or column identifier.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid ROUND expression
 * @throws {TypeError} If args is not an array with at least one element
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'ROUND',
 *   args: ['@average_score']
 * };
 * assertRoundExpression(expr, ['average_score']);
 * ```
 */
export const assertRoundExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'ROUND' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'ROUND' }> => {
  assertArrayNumericExpression(x, 'ROUND', columnList, 1, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid ROUND expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid ROUND expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'ROUND',
 *   args: ['@value']
 * };
 *
 * if (isRoundExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'ROUND' }>
 *   console.log('Will round to nearest integer');
 * }
 * ```
 */
export const isRoundExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'ROUND' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'ROUND' }> => {
  try {
    assertRoundExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid POWER expression.
 *
 * The POWER expression raises a base number to the power of an exponent (base^exponent).
 * Both base and exponent can be numeric literals or column identifiers.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid POWER expression
 * @throws {TypeError} If required properties are missing
 * @throws {TypeError} If base or exponent are not valid
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'POWER',
 *   args: { base: '@radius', exponent: 2 }
 * };
 * assertPowerExpression(expr, ['radius']);
 * ```
 */
export const assertPowerExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'POWER' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'POWER' }> => {
  assertBaseExpression(x, 'POWER');
  if (!('args' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'args' property for POWER expression`,
    );
  }
  if (typeof x.args !== 'object' || x.args === null) {
    throw new TypeError(
      `Invalid Expression definition: 'args' must be an object for POWER expression`,
    );
  }
  if (!('base' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'base' property in args for POWER expression`,
    );
  }
  validateExprArg(
    x.args.base,
    'base',
    'POWER',
    'numeric',
    columnList,
    depth,
    maxDepth,
  );

  if (!('exponent' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'exponent' property in args for POWER expression`,
    );
  }
  validateExprArg(
    x.args.exponent,
    'exponent',
    'POWER',
    'numeric',
    columnList,
    depth,
    maxDepth,
  );
};

/**
 * Type guard to check if a value is a valid POWER expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid POWER expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'POWER',
 *   args: { base: '@value', exponent: 2 }
 * };
 *
 * if (isPowerExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'POWER' }>
 *   const { base, exponent } = expr.args;
 *   console.log(`Calculating ${base} to the power of ${exponent}`);
 * }
 * ```
 */
export const isPowerExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'POWER' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'POWER' }> => {
  try {
    assertPowerExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid SQRT expression.
 *
 * The SQRT expression returns the square root of a number.
 * The argument can be a numeric literal or column identifier.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid SQRT expression
 * @throws {TypeError} If args is not an array with at least one element
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'SQRT',
 *   args: ['@area']
 * };
 * assertSqrtExpression(expr, ['area']);
 * ```
 */
export const assertSqrtExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'SQRT' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'SQRT' }> => {
  assertArrayNumericExpression(x, 'SQRT', columnList, 1, depth, maxDepth);
};

/**
 * Type guard to check if a value is a valid SQRT expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid SQRT expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'SQRT',
 *   args: ['@value']
 * };
 *
 * if (isSqrtExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'SQRT' }>
 *   console.log('Will calculate square root');
 * }
 * ```
 */
export const isSqrtExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'SQRT' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'SQRT' }> => {
  try {
    assertSqrtExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid LENGTH expression.
 *
 * The LENGTH expression returns the number of characters in a string.
 * While this returns a numeric value, it operates on string inputs.
 * The argument can be a string literal or column identifier.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid LENGTH expression
 * @throws {TypeError} If args is not a valid string or column identifier
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'LENGTH',
 *   args: '@username'
 * };
 * assertLengthExpression(expr, ['username']);
 * ```
 */
export const assertLengthExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'LENGTH' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'LENGTH' }> => {
  assertBaseExpression(x, 'LENGTH');
  if (!('args' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'args' property for LENGTH expression`,
    );
  }
  validateExprArg(
    x.args,
    'args',
    'LENGTH',
    'string',
    columnList,
    depth,
    maxDepth,
  );
};

/**
 * Type guard to check if a value is a valid LENGTH expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid LENGTH expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'LENGTH',
 *   args: '@description'
 * };
 *
 * if (isLengthExpression(expr, ['description'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'LENGTH' }>
 *   console.log('Will get string length');
 * }
 * ```
 */
export const isLengthExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'LENGTH' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'LENGTH' }> => {
  try {
    assertLengthExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid DATE_DIFF expression.
 *
 * DATE_DIFF calculates the difference between two dates in the specified time unit.
 * Returns the number of complete time units between 'from' and 'to' dates.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the expression structure is invalid
 * @throws {TypeError} If required properties are missing
 * @throws {TypeError} If date arguments are invalid
 * @throws {TypeError} If unit is not a valid TimeUnit
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'DATE_DIFF',
 *   args: { from: '@birthdate', to: '@current_date', unit: 'YEARS' }
 * };
 * assertDateDiffExpression(expr, ['birthdate', 'current_date']);
 * ```
 */
export const assertDateDiffExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: 'DATE_DIFF' }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: 'DATE_DIFF' }> => {
  assertBaseExpression(x, 'DATE_DIFF');
  if (!('args' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'args' property for DATE_DIFF expression`,
    );
  }
  if (typeof x.args !== 'object' || x.args === null) {
    throw new TypeError(
      `Invalid Expression definition: 'args' must be an object for DATE_DIFF expression`,
    );
  }
  if (!('from' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'from' property in args for DATE_DIFF expression`,
    );
  }
  validateExprArg(
    x.args.from,
    'from',
    'DATE_DIFF',
    'date',
    columnList,
    depth,
    maxDepth,
  );

  if (!('to' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'to' property in args for DATE_DIFF expression`,
    );
  }
  validateExprArg(
    x.args.to,
    'to',
    'DATE_DIFF',
    'date',
    columnList,
    depth,
    maxDepth,
  );

  if (!('unit' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'unit' property in args for DATE_DIFF expression`,
    );
  }
  validateTimeUnits(x.args.unit);
};

/**
 * Type guard to check if a value is a valid DATE_DIFF expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid DATE_DIFF expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr = {
 *   $$_expression: 'DATE_DIFF',
 *   args: { from: '@created_at', to: '@updated_at', unit: 'DAYS' }
 * };
 *
 * if (isDateDiffExpression(expr, ['created_at', 'updated_at'])) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'DATE_DIFF' }>
 *   console.log(`Will calculate ${expr.args.unit} between dates`);
 * }
 * ```
 */
export const isDateDiffExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { $$_expression: 'DATE_DIFF' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'DATE_DIFF' }> => {
  try {
    assertDateDiffExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid numeric-related expression.
 *
 * This is a comprehensive validator that checks if a value matches any of the
 * supported numeric expression types. It automatically delegates to the appropriate
 * specific validator based on the expression type.
 *
 * Supported numeric expression types:
 * - ADD: Sum multiple values
 * - SUBTRACT: Subtract values from first argument
 * - MULTIPLY: Multiply values together
 * - DIVIDE: Divide first value by second
 * - MODULO: Remainder after division
 * - ABS: Absolute value
 * - CEIL: Round up to nearest integer
 * - FLOOR: Round down to nearest integer
 * - ROUND: Round to nearest integer
 * - POWER: Raise to power
 * - SQRT: Square root
 * - LENGTH: Get string length (returns number)
 * - DATE_DIFF: Calculate difference between dates
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid numeric expression
 * @throws {TypeError} If the expression type is not a recognized numeric type
 *
 * @example
 * ```ts
 * // Delegates to the matching per-type validator...
 * assertNumericExpression({ $$_expression: 'MULTIPLY', args: ['@quantity', '@price'] }, ['quantity', 'price']);
 * // ...and rejects a non-numeric expression type.
 * assertNumericExpression({ $$_expression: 'CONCAT' });  // throws: TypeError
 * ```
 */
export const assertNumericExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: NumericExpressions }> =
  (
    x: unknown,
    columnList?: string[],
    depth = 0,
    maxDepth = 10,
  ): asserts x is Extract<
    Expressions,
    { $$_expression: NumericExpressions }
  > => {
    if (depth > maxDepth) {
      throw new TypeError(
        `Expression exceeds maximum nesting depth of ${maxDepth}. ` +
          `This may indicate overly complex expression or circular reference.`,
      );
    }
    assertBaseExpression(x);
    if (x.$$_expression === 'ADD') {
      assertAddExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'SUBTRACT') {
      assertSubtractExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'MULTIPLY') {
      assertMultiplyExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'DIVIDE') {
      assertDivideExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'MODULO') {
      assertModuloExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'ABS') {
      assertAbsExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'CEIL') {
      assertCeilExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'FLOOR') {
      assertFloorExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'ROUND') {
      assertRoundExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'POWER') {
      assertPowerExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'SQRT') {
      assertSqrtExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'LENGTH') {
      assertLengthExpression(x, columnList, depth, maxDepth);
    } else if (x.$$_expression === 'DATE_DIFF') {
      assertDateDiffExpression(x, columnList, depth, maxDepth);
    } else {
      throw new TypeError(
        `Invalid Expression type: Expected a Numeric expression type, got '${x.$$_expression}'`,
      );
    }
  };

/**
 * Type guard to check if a value is a valid numeric-related expression.
 *
 * This is a comprehensive type guard that checks if a value matches any of the
 * supported numeric expression types. It narrows the type to a union of all numeric expressions.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid numeric expression, `false` otherwise
 *
 * @example
 * ```ts
 * const expr: unknown = getExpression();
 *
 * if (isNumericExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: NumericExpressions }>
 *   switch (expr.$$_expression) {
 *     case 'ADD':
 *     case 'SUBTRACT':
 *     case 'MULTIPLY':
 *     case 'DIVIDE':
 *       console.log('Basic arithmetic:', expr.args);
 *       break;
 *     case 'MODULO':
 *       console.log('Remainder operation');
 *       break;
 *     case 'ABS':
 *       console.log('Absolute value');
 *       break;
 *     case 'CEIL':
 *     case 'FLOOR':
 *     case 'ROUND':
 *       console.log('Rounding operation');
 *       break;
 *     case 'POWER':
 *       console.log('Exponentiation');
 *       break;
 *     case 'SQRT':
 *       console.log('Square root');
 *       break;
 *     case 'LENGTH':
 *       console.log('String length');
 *       break;
 *     case 'DATE_DIFF':
 *       console.log('Date difference calculation');
 *       break;
 *   }
 * }
 *
 * // Filter expressions by category
 * const expressions: unknown[] = getAllExpressions();
 * const numericExpressions = expressions.filter(isNumericExpression);
 * console.log(`Found ${numericExpressions.length} numeric expressions`);
 *
 * // Validate with column list
 * const queryExpr: unknown = buildQuery();
 * if (isNumericExpression(queryExpr, ['price', 'quantity', 'tax'])) {
 *   // All numeric references are validated against column list
 *   executeQuery(queryExpr);
 * }
 * ```
 */
export const isNumericExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => x is Extract<Expressions, { $$_expression: NumericExpressions }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): x is Extract<Expressions, { $$_expression: NumericExpressions }> => {
  try {
    assertNumericExpression(x, columnList, depth, maxDepth);
    return true;
  } catch {
    return false;
  }
};
