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

import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import type { Expressions, NumericExpressions } from '../../types/mod.ts';
import { assertBaseExpression, validateTimeUnits } from './Base.ts';

/**
 * Helper function to validate a numeric argument (number or column identifier).
 *
 * @param arg - The argument to validate
 * @param argName - Name of the argument (for error messages)
 * @param expressionType - The expression type (for error messages)
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @throws {TypeError} If the argument is not a valid number or column identifier
 * @internal
 */
const validateNumericArg = (
  arg: unknown,
  argName: string,
  expressionType: string,
  columnList?: string[],
): void => {
  if (typeof arg === 'string') {
    if (arg.startsWith('@')) {
      try {
        assertColumnIdentifier(arg, columnList);
      } catch {
        throw new TypeError(
          `Invalid Expression definition: Invalid column identifier ${arg} for ${argName} in ${expressionType} expression`,
        );
      }
    } else {
      throw new TypeError(
        `Invalid Expression definition: ${argName} must be a number or column identifier in ${expressionType} expression, got string literal`,
      );
    }
  } else if (typeof arg !== 'number' && typeof arg !== 'bigint') {
    throw new TypeError(
      `Invalid Expression definition: ${argName} must be a number, bigint, or column identifier in ${expressionType} expression, got ${typeof arg}`,
    );
  }
};

/**
 * Helper function to validate a string argument (for LENGTH expression).
 *
 * @param arg - The argument to validate
 * @param argName - Name of the argument (for error messages)
 * @param expressionType - The expression type (for error messages)
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @throws {TypeError} If the argument is not a valid string or column identifier
 * @internal
 */
const validateStringArg = (
  arg: unknown,
  argName: string,
  expressionType: string,
  columnList?: string[],
): void => {
  if (typeof arg === 'string') {
    if (arg.startsWith('@')) {
      try {
        assertColumnIdentifier(arg, columnList);
      } catch {
        throw new TypeError(
          `Invalid Expression definition: Invalid column identifier ${arg} for ${argName} in ${expressionType} expression`,
        );
      }
    }
  } else {
    throw new TypeError(
      `Invalid Expression definition: ${argName} must be a string or column identifier in ${expressionType} expression, got ${typeof arg}`,
    );
  }
};

/**
 * Helper function to validate a date argument (Date or column identifier).
 *
 * @param arg - The argument to validate
 * @param argName - Name of the argument (for error messages)
 * @param expressionType - The expression type (for error messages)
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @throws {TypeError} If the argument is not a valid Date or column identifier
 * @internal
 */
const validateDateArg = (
  arg: unknown,
  argName: string,
  expressionType: string,
  columnList?: string[],
): void => {
  if (typeof arg === 'string') {
    if (arg.startsWith('@')) {
      try {
        assertColumnIdentifier(arg, columnList);
      } catch {
        throw new TypeError(
          `Invalid Expression definition: Invalid column identifier ${arg} for ${argName} in ${expressionType} expression`,
        );
      }
    } else {
      throw new TypeError(
        `Invalid Expression definition: ${argName} must be a Date or column identifier in ${expressionType} expression, got string literal`,
      );
    }
  } else if (!(arg instanceof Date)) {
    throw new TypeError(
      `Invalid Expression definition: ${argName} must be a Date or column identifier in ${expressionType} expression, got ${typeof arg}`,
    );
  }
};

/**
 * Helper function to validate array-based numeric expressions.
 * Used by ADD, SUBTRACT, MULTIPLY, DIVIDE, MODULO, ABS, CEIL, FLOOR, ROUND, SQRT.
 *
 * @param x - The expression to validate
 * @param type - The expression type name
 * @param columnList - Optional list of valid column names (without '@' prefix)
 * @param minArgs - Minimum number of arguments required (default: 1)
 * @throws {TypeError} If the expression structure is invalid
 * @internal
 */
const assertArrayNumericExpression = (
  x: unknown,
  type: string,
  columnList?: string[],
  minArgs = 1,
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
    validateNumericArg(x.args[i], `args[${i}]`, type, columnList);
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
 * // Add literal numbers
 * const expr1 = {
 *   type: 'ADD',
 *   args: [1, 2, 3]
 * };
 * assertAddExpression(expr1); // ✓ Valid (results in 6)
 *
 * // Add column values
 * const expr2 = {
 *   type: 'ADD',
 *   args: ['@price', '@tax', '@shipping']
 * };
 * assertAddExpression(expr2, ['price', 'tax', 'shipping']); // ✓ Valid
 *
 * // Mix literals and columns
 * const expr3 = {
 *   type: 'ADD',
 *   args: ['@subtotal', 10]
 * };
 * assertAddExpression(expr3, ['subtotal']); // ✓ Valid
 *
 * // Calculate total cost
 * const totalCost = {
 *   type: 'ADD',
 *   args: ['@base_price', '@options_cost', '@delivery_fee']
 * };
 * assertAddExpression(totalCost, ['base_price', 'options_cost', 'delivery_fee']); // ✓ Valid
 * ```
 */
export const assertAddExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'ADD' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'ADD' }> => {
  assertArrayNumericExpression(x, 'ADD', columnList, 1);
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
 *   type: 'ADD',
 *   args: ['@price', '@tax']
 * };
 *
 * if (isAddExpression(expr, ['price', 'tax'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'ADD' }>
 *   console.log(`Adding ${expr.args.length} values`);
 * }
 * ```
 */
export const isAddExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'ADD' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'ADD' }> => {
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
 * // Subtract literal numbers
 * const expr1 = {
 *   type: 'SUBTRACT',
 *   args: [10, 3, 2]
 * };
 * assertSubtractExpression(expr1); // ✓ Valid (results in 5: 10 - 3 - 2)
 *
 * // Subtract from column value
 * const expr2 = {
 *   type: 'SUBTRACT',
 *   args: ['@balance', '@withdrawal']
 * };
 * assertSubtractExpression(expr2, ['balance', 'withdrawal']); // ✓ Valid
 *
 * // Calculate discount
 * const discountPrice = {
 *   type: 'SUBTRACT',
 *   args: ['@original_price', '@discount_amount']
 * };
 * assertSubtractExpression(discountPrice, ['original_price', 'discount_amount']); // ✓ Valid
 * ```
 */
export const assertSubtractExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'SUBTRACT' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'SUBTRACT' }> => {
  assertArrayNumericExpression(x, 'SUBTRACT', columnList, 2);
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
 *   type: 'SUBTRACT',
 *   args: ['@total', '@discount']
 * };
 *
 * if (isSubtractExpression(expr, ['total', 'discount'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'SUBTRACT' }>
 *   console.log('Calculating difference');
 * }
 * ```
 */
export const isSubtractExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'SUBTRACT' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'SUBTRACT' }> => {
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
 * // Multiply literal numbers
 * const expr1 = {
 *   type: 'MULTIPLY',
 *   args: [5, 3, 2]
 * };
 * assertMultiplyExpression(expr1); // ✓ Valid (results in 30)
 *
 * // Calculate total price
 * const expr2 = {
 *   type: 'MULTIPLY',
 *   args: ['@quantity', '@unit_price']
 * };
 * assertMultiplyExpression(expr2, ['quantity', 'unit_price']); // ✓ Valid
 *
 * // Apply tax rate
 * const withTax = {
 *   type: 'MULTIPLY',
 *   args: ['@subtotal', 1.08]
 * };
 * assertMultiplyExpression(withTax, ['subtotal']); // ✓ Valid
 * ```
 */
export const assertMultiplyExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'MULTIPLY' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'MULTIPLY' }> => {
  assertArrayNumericExpression(x, 'MULTIPLY', columnList, 1);
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
 *   type: 'MULTIPLY',
 *   args: ['@quantity', '@price']
 * };
 *
 * if (isMultiplyExpression(expr, ['quantity', 'price'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'MULTIPLY' }>
 *   console.log('Calculating product');
 * }
 * ```
 */
export const isMultiplyExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'MULTIPLY' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'MULTIPLY' }> => {
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
 * // Divide literal numbers
 * const expr1 = {
 *   type: 'DIVIDE',
 *   args: [10, 2]
 * };
 * assertDivideExpression(expr1); // ✓ Valid (results in 5)
 *
 * // Calculate average
 * const expr2 = {
 *   type: 'DIVIDE',
 *   args: ['@total', '@count']
 * };
 * assertDivideExpression(expr2, ['total', 'count']); // ✓ Valid
 *
 * // Calculate percentage
 * const percentage = {
 *   type: 'DIVIDE',
 *   args: ['@completed_tasks', '@total_tasks']
 * };
 * assertDivideExpression(percentage, ['completed_tasks', 'total_tasks']); // ✓ Valid
 * ```
 */
export const assertDivideExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'DIVIDE' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'DIVIDE' }> => {
  assertArrayNumericExpression(x, 'DIVIDE', columnList, 2);
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
 *   type: 'DIVIDE',
 *   args: ['@total', '@count']
 * };
 *
 * if (isDivideExpression(expr, ['total', 'count'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'DIVIDE' }>
 *   console.log('Calculating division');
 * }
 * ```
 */
export const isDivideExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'DIVIDE' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'DIVIDE' }> => {
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
 * // Modulo literal numbers
 * const expr1 = {
 *   type: 'MODULO',
 *   args: [10, 3]
 * };
 * assertModuloExpression(expr1); // ✓ Valid (results in 1)
 *
 * // Check if even/odd
 * const expr2 = {
 *   type: 'MODULO',
 *   args: ['@number', 2]
 * };
 * assertModuloExpression(expr2, ['number']); // ✓ Valid
 *
 * // Pagination - get page position
 * const pagePosition = {
 *   type: 'MODULO',
 *   args: ['@record_index', '@page_size']
 * };
 * assertModuloExpression(pagePosition, ['record_index', 'page_size']); // ✓ Valid
 * ```
 */
export const assertModuloExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'MODULO' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'MODULO' }> => {
  assertArrayNumericExpression(x, 'MODULO', columnList, 2);
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
 *   type: 'MODULO',
 *   args: ['@value', 10]
 * };
 *
 * if (isModuloExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'MODULO' }>
 *   console.log('Calculating remainder');
 * }
 * ```
 */
export const isModuloExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'MODULO' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'MODULO' }> => {
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
 * // Absolute value of literal
 * const expr1 = {
 *   type: 'ABS',
 *   args: [-42]
 * };
 * assertAbsExpression(expr1); // ✓ Valid (results in 42)
 *
 * // Absolute value of column
 * const expr2 = {
 *   type: 'ABS',
 *   args: ['@temperature_difference']
 * };
 * assertAbsExpression(expr2, ['temperature_difference']); // ✓ Valid
 *
 * // Calculate distance (always positive)
 * const distance = {
 *   type: 'ABS',
 *   args: ['@delta']
 * };
 * assertAbsExpression(distance, ['delta']); // ✓ Valid
 * ```
 */
export const assertAbsExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'ABS' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'ABS' }> => {
  assertArrayNumericExpression(x, 'ABS', columnList, 1);
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
 *   type: 'ABS',
 *   args: ['@value']
 * };
 *
 * if (isAbsExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'ABS' }>
 *   console.log('Will return absolute value');
 * }
 * ```
 */
export const isAbsExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'ABS' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'ABS' }> => {
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
 * // Ceiling of literal
 * const expr1 = {
 *   type: 'CEIL',
 *   args: [4.3]
 * };
 * assertCeilExpression(expr1); // ✓ Valid (results in 5)
 *
 * // Ceiling of column
 * const expr2 = {
 *   type: 'CEIL',
 *   args: ['@price']
 * };
 * assertCeilExpression(expr2, ['price']); // ✓ Valid
 *
 * // Round up for pagination
 * const totalPages = {
 *   type: 'CEIL',
 *   args: ['@total_items_divided_by_page_size']
 * };
 * assertCeilExpression(totalPages, ['total_items_divided_by_page_size']); // ✓ Valid
 * ```
 */
export const assertCeilExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'CEIL' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'CEIL' }> => {
  assertArrayNumericExpression(x, 'CEIL', columnList, 1);
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
 *   type: 'CEIL',
 *   args: ['@value']
 * };
 *
 * if (isCeilExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'CEIL' }>
 *   console.log('Will round up');
 * }
 * ```
 */
export const isCeilExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'CEIL' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'CEIL' }> => {
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
 * // Floor of literal
 * const expr1 = {
 *   type: 'FLOOR',
 *   args: [4.8]
 * };
 * assertFloorExpression(expr1); // ✓ Valid (results in 4)
 *
 * // Floor of column
 * const expr2 = {
 *   type: 'FLOOR',
 *   args: ['@rating']
 * };
 * assertFloorExpression(expr2, ['rating']); // ✓ Valid
 *
 * // Truncate decimals
 * const wholeNumber = {
 *   type: 'FLOOR',
 *   args: ['@price_with_decimals']
 * };
 * assertFloorExpression(wholeNumber, ['price_with_decimals']); // ✓ Valid
 * ```
 */
export const assertFloorExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'FLOOR' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'FLOOR' }> => {
  assertArrayNumericExpression(x, 'FLOOR', columnList, 1);
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
 *   type: 'FLOOR',
 *   args: ['@value']
 * };
 *
 * if (isFloorExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'FLOOR' }>
 *   console.log('Will round down');
 * }
 * ```
 */
export const isFloorExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'FLOOR' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'FLOOR' }> => {
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
 * // Round literal
 * const expr1 = {
 *   type: 'ROUND',
 *   args: [4.5]
 * };
 * assertRoundExpression(expr1); // ✓ Valid (results in 5)
 *
 * // Round column value
 * const expr2 = {
 *   type: 'ROUND',
 *   args: ['@average_score']
 * };
 * assertRoundExpression(expr2, ['average_score']); // ✓ Valid
 *
 * // Round for display
 * const displayValue = {
 *   type: 'ROUND',
 *   args: ['@calculated_result']
 * };
 * assertRoundExpression(displayValue, ['calculated_result']); // ✓ Valid
 * ```
 */
export const assertRoundExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'ROUND' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'ROUND' }> => {
  assertArrayNumericExpression(x, 'ROUND', columnList, 1);
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
 *   type: 'ROUND',
 *   args: ['@value']
 * };
 *
 * if (isRoundExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'ROUND' }>
 *   console.log('Will round to nearest integer');
 * }
 * ```
 */
export const isRoundExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'ROUND' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'ROUND' }> => {
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
 * // Power with literals
 * const expr1 = {
 *   type: 'POWER',
 *   args: {
 *     base: 2,
 *     exponent: 3
 *   }
 * };
 * assertPowerExpression(expr1); // ✓ Valid (results in 8)
 *
 * // Power with column values
 * const expr2 = {
 *   type: 'POWER',
 *   args: {
 *     base: '@radius',
 *     exponent: 2
 *   }
 * };
 * assertPowerExpression(expr2, ['radius']); // ✓ Valid (radius squared)
 *
 * // Calculate compound interest
 * const compoundInterest = {
 *   type: 'POWER',
 *   args: {
 *     base: '@growth_rate',
 *     exponent: '@years'
 *   }
 * };
 * assertPowerExpression(compoundInterest, ['growth_rate', 'years']); // ✓ Valid
 * ```
 */
export const assertPowerExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'POWER' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'POWER' }> => {
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
  validateNumericArg(x.args.base, 'base', 'POWER', columnList);

  if (!('exponent' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'exponent' property in args for POWER expression`,
    );
  }
  validateNumericArg(x.args.exponent, 'exponent', 'POWER', columnList);
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
 *   type: 'POWER',
 *   args: { base: '@value', exponent: 2 }
 * };
 *
 * if (isPowerExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'POWER' }>
 *   const { base, exponent } = expr.args;
 *   console.log(`Calculating ${base} to the power of ${exponent}`);
 * }
 * ```
 */
export const isPowerExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'POWER' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'POWER' }> => {
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
 * // Square root of literal
 * const expr1 = {
 *   type: 'SQRT',
 *   args: [16]
 * };
 * assertSqrtExpression(expr1); // ✓ Valid (results in 4)
 *
 * // Square root of column
 * const expr2 = {
 *   type: 'SQRT',
 *   args: ['@area']
 * };
 * assertSqrtExpression(expr2, ['area']); // ✓ Valid
 *
 * // Calculate standard deviation component
 * const stdDev = {
 *   type: 'SQRT',
 *   args: ['@variance']
 * };
 * assertSqrtExpression(stdDev, ['variance']); // ✓ Valid
 * ```
 */
export const assertSqrtExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'SQRT' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'SQRT' }> => {
  assertArrayNumericExpression(x, 'SQRT', columnList, 1);
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
 *   type: 'SQRT',
 *   args: ['@value']
 * };
 *
 * if (isSqrtExpression(expr, ['value'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'SQRT' }>
 *   console.log('Will calculate square root');
 * }
 * ```
 */
export const isSqrtExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'SQRT' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'SQRT' }> => {
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
 * // Length of literal string
 * const expr1 = {
 *   type: 'LENGTH',
 *   args: 'Hello'
 * };
 * assertLengthExpression(expr1); // ✓ Valid (results in 5)
 *
 * // Length of column value
 * const expr2 = {
 *   type: 'LENGTH',
 *   args: '@username'
 * };
 * assertLengthExpression(expr2, ['username']); // ✓ Valid
 *
 * // Validate input length
 * const checkLength = {
 *   type: 'LENGTH',
 *   args: '@password'
 * };
 * // WHERE LENGTH(password) >= 8
 * assertLengthExpression(checkLength, ['password']); // ✓ Valid
 * ```
 */
export const assertLengthExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'LENGTH' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'LENGTH' }> => {
  assertBaseExpression(x, 'LENGTH');
  if (!('args' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'args' property for LENGTH expression`,
    );
  }
  validateStringArg(x.args, 'args', 'LENGTH', columnList);
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
 *   type: 'LENGTH',
 *   args: '@description'
 * };
 *
 * if (isLengthExpression(expr, ['description'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'LENGTH' }>
 *   console.log('Will get string length');
 * }
 * ```
 */
export const isLengthExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'LENGTH' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'LENGTH' }> => {
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
 * // Calculate days between two dates
 * const expr1 = {
 *   type: 'DATE_DIFF',
 *   args: {
 *     from: new Date('2024-01-01'),
 *     to: new Date('2024-01-15'),
 *     unit: 'DAYS'
 *   }
 * };
 * assertDateDiffExpression(expr1); // ✓ Valid (results in 14)
 *
 * // Calculate years between dates using column references
 * const expr2 = {
 *   type: 'DATE_DIFF',
 *   args: { from: '@birthdate', to: '@current_date', unit: 'YEARS' }
 * };
 * // SELECT DATE_DIFF(YEAR, birthdate, current_date) AS age
 * assertDateDiffExpression(expr2, ['birthdate', 'current_date']); // ✓ Valid
 *
 * // Calculate hours between timestamps
 * const expr3 = {
 *   type: 'DATE_DIFF',
 *   args: { from: '@start_time', to: '@end_time', unit: 'HOURS' }
 * };
 * // WHERE DATE_DIFF(HOUR, start_time, end_time) > 8
 * assertDateDiffExpression(expr3, ['start_time', 'end_time']); // ✓ Valid
 * ```
 */
export const assertDateDiffExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'DATE_DIFF' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'DATE_DIFF' }> => {
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
  validateDateArg(x.args.from, 'from', 'DATE_DIFF', columnList);

  if (!('to' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'to' property in args for DATE_DIFF expression`,
    );
  }
  validateDateArg(x.args.to, 'to', 'DATE_DIFF', columnList);

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
 *   type: 'DATE_DIFF',
 *   args: { from: '@created_at', to: '@updated_at', unit: 'DAYS' }
 * };
 *
 * if (isDateDiffExpression(expr, ['created_at', 'updated_at'])) {
 *   // expr is narrowed to Extract<Expressions, { type: 'DATE_DIFF' }>
 *   console.log(`Will calculate ${expr.args.unit} between dates`);
 * }
 * ```
 */
export const isDateDiffExpression: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Expressions, { type: 'DATE_DIFF' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: 'DATE_DIFF' }> => {
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
 * // Validate any numeric expression type
 * const expr1 = { type: 'ADD', args: [1, 2, 3] };
 * assertNumericExpression(expr1); // ✓ Delegates to assertAddExpression
 *
 * const expr2 = { type: 'SQRT', args: [16] };
 * assertNumericExpression(expr2); // ✓ Delegates to assertSqrtExpression
 *
 * const expr3 = {
 *   type: 'MULTIPLY',
 *   args: ['@quantity', '@price']
 * };
 * assertNumericExpression(expr3, ['quantity', 'price']); // ✓ Valid
 *
 * // Invalid expression type
 * assertNumericExpression({ type: 'CONCAT' }); // ✗ Throws TypeError
 * ```
 */
export const assertNumericExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: NumericExpressions }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: NumericExpressions }> => {
  assertBaseExpression(x);
  if (x.type === 'ADD') {
    assertAddExpression(x, columnList);
  } else if (x.type === 'SUBTRACT') {
    assertSubtractExpression(x, columnList);
  } else if (x.type === 'MULTIPLY') {
    assertMultiplyExpression(x, columnList);
  } else if (x.type === 'DIVIDE') {
    assertDivideExpression(x, columnList);
  } else if (x.type === 'MODULO') {
    assertModuloExpression(x, columnList);
  } else if (x.type === 'ABS') {
    assertAbsExpression(x, columnList);
  } else if (x.type === 'CEIL') {
    assertCeilExpression(x, columnList);
  } else if (x.type === 'FLOOR') {
    assertFloorExpression(x, columnList);
  } else if (x.type === 'ROUND') {
    assertRoundExpression(x, columnList);
  } else if (x.type === 'POWER') {
    assertPowerExpression(x, columnList);
  } else if (x.type === 'SQRT') {
    assertSqrtExpression(x, columnList);
  } else if (x.type === 'LENGTH') {
    assertLengthExpression(x, columnList);
  } else if (x.type === 'DATE_DIFF') {
    assertDateDiffExpression(x, columnList);
  } else {
    throw new TypeError(
      `Invalid Expression type: Expected a Numeric expression type, got '${x.type}'`,
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
 *   // expr is narrowed to Extract<Expressions, { type: NumericExpressions }>
 *   switch (expr.type) {
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
) => x is Extract<Expressions, { type: NumericExpressions }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: NumericExpressions }> => {
  try {
    assertNumericExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};
