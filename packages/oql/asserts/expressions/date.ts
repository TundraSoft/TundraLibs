/**
 * Date Expression Validators
 *
 * This module provides validation functions for date and time-related expressions in OQL.
 * It includes assertion and type guard functions for various date operations:
 * - NOW: Current timestamp
 * - CURRENT_DATE: Current date without time
 * - CURRENT_TIME: Current time without date
 * - CURRENT_TIMESTAMP: Current timestamp (alias for NOW)
 * - CURRENT_TIMESTAMPTZ: Current timestamp with timezone (PostgreSQL)
 * - DATE_ADD: Add/subtract time intervals from dates
 *
 * @module asserts/Expressions/Date
 */

import { isColumnIdentifier } from '../columnIdentifier.ts';
import type { DateExpressions, Expressions } from '../../types/mod.ts';
import { assertBaseExpression, validateTimeUnits } from './base.ts';

/**
 * Asserts that a value is a valid NOW expression.
 *
 * The NOW expression returns the current timestamp with full date and time information.
 * This is a parameterless expression that evaluates to the current moment.
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid NOW expression
 *
 * @example
 * ```ts
 * const expr = { $$_expression: 'NOW' };
 * assertNowExpression(expr);
 * ```
 */
export const assertNowExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { $$_expression: 'NOW' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { $$_expression: 'NOW' }> => {
  assertBaseExpression(x, 'NOW');
  // Additional properties are ignored as NOW requires no arguments
};

/**
 * Type guard to check if a value is a valid NOW expression.
 *
 * @param x - The value to check
 * @returns `true` if the value is a valid NOW expression, `false` otherwise
 *
 * @example
 * ```ts
 * declare function getUserInput(): unknown;
 *
 * const expr = { $$_expression: 'NOW' };
 * if (isNowExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'NOW' }>
 *   console.log('Current timestamp expression');
 * }
 *
 * // Use in expression validation
 * const maybeNow: unknown = getUserInput();
 * if (isNowExpression(maybeNow)) {
 *   // Safe to use as NOW expression
 *   console.log('Valid NOW expression for timestamp comparison');
 * } else {
 *   console.log('Not a NOW expression');
 * }
 * ```
 */
export const isNowExpression = (
  x: unknown,
): x is Extract<Expressions, { $$_expression: 'NOW' }> => {
  try {
    assertNowExpression(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid CURRENT_DATE expression.
 *
 * The CURRENT_DATE expression returns the current date without time component.
 * This is useful when you only need the date portion (year, month, day).
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid CURRENT_DATE expression
 *
 * @example
 * ```ts
 * const expr = { $$_expression: 'CURRENT_DATE' };
 * assertCurrentDateExpression(expr);
 * ```
 */
export const assertCurrentDateExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { $$_expression: 'CURRENT_DATE' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { $$_expression: 'CURRENT_DATE' }> => {
  assertBaseExpression(x, 'CURRENT_DATE');
  // Additional properties are ignored as CURRENT_DATE requires no arguments
};

/**
 * Type guard to check if a value is a valid CURRENT_DATE expression.
 *
 * @param x - The value to check
 * @returns `true` if the value is a valid CURRENT_DATE expression, `false` otherwise
 *
 * @example
 * ```ts
 * declare const expr: unknown;
 *
 * if (isCurrentDateExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'CURRENT_DATE' }>
 *   console.log('Current date expression');
 * }
 * ```
 */
export const isCurrentDateExpression = (
  x: unknown,
): x is Extract<Expressions, { $$_expression: 'CURRENT_DATE' }> => {
  try {
    assertCurrentDateExpression(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid CURRENT_TIME expression.
 *
 * The CURRENT_TIME expression returns the current time without date component.
 * This is useful when you only need the time portion (hours, minutes, seconds).
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid CURRENT_TIME expression
 *
 * @example
 * ```ts
 * const expr = { $$_expression: 'CURRENT_TIME' };
 * assertCurrentTimeExpression(expr);
 * ```
 */
export const assertCurrentTimeExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { $$_expression: 'CURRENT_TIME' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { $$_expression: 'CURRENT_TIME' }> => {
  assertBaseExpression(x, 'CURRENT_TIME');
  // Additional properties are ignored as CURRENT_TIME requires no arguments
};

/**
 * Type guard to check if a value is a valid CURRENT_TIME expression.
 *
 * @param x - The value to check
 * @returns `true` if the value is a valid CURRENT_TIME expression, `false` otherwise
 *
 * @example
 * ```ts
 * declare const expr: unknown;
 *
 * if (isCurrentTimeExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'CURRENT_TIME' }>
 *   console.log('Current time expression');
 * }
 * ```
 */
export const isCurrentTimeExpression = (
  x: unknown,
): x is Extract<Expressions, { $$_expression: 'CURRENT_TIME' }> => {
  try {
    assertCurrentTimeExpression(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid CURRENT_TIMESTAMP expression.
 *
 * The CURRENT_TIMESTAMP expression is an alias for NOW, returning the current
 * timestamp with full date and time information. Provided for SQL compatibility.
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid CURRENT_TIMESTAMP expression
 *
 * @example
 * ```ts
 * const expr = { $$_expression: 'CURRENT_TIMESTAMP' };
 * assertCurrentTimestampExpression(expr);
 * ```
 */
export const assertCurrentTimestampExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { $$_expression: 'CURRENT_TIMESTAMP' }> =
  (
    x: unknown,
  ): asserts x is Extract<
    Expressions,
    { $$_expression: 'CURRENT_TIMESTAMP' }
  > => {
    assertBaseExpression(x, 'CURRENT_TIMESTAMP');
    // Additional properties are ignored as CURRENT_TIMESTAMP requires no arguments
  };

/**
 * Type guard to check if a value is a valid CURRENT_TIMESTAMP expression.
 *
 * @param x - The value to check
 * @returns `true` if the value is a valid CURRENT_TIMESTAMP expression, `false` otherwise
 *
 * @example
 * ```ts
 * declare const expr: unknown;
 *
 * if (isCurrentTimestampExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'CURRENT_TIMESTAMP' }>
 *   console.log('Current timestamp expression');
 * }
 * ```
 */
export const isCurrentTimestampExpression = (
  x: unknown,
): x is Extract<Expressions, { $$_expression: 'CURRENT_TIMESTAMP' }> => {
  try {
    assertCurrentTimestampExpression(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid CURRENT_TIMESTAMPTZ expression.
 *
 * The CURRENT_TIMESTAMPTZ expression returns the current timestamp with timezone
 * information. This is PostgreSQL-specific and translates to CURRENT_TIMESTAMP on
 * other database systems.
 *
 * @param x - The value to validate
 * @throws {TypeError} If the value is not a valid CURRENT_TIMESTAMPTZ expression
 *
 * @example
 * ```ts
 * const expr = { $$_expression: 'CURRENT_TIMESTAMPTZ' };
 * assertCurrentTimestampTZExpression(expr);
 * ```
 */
export const assertCurrentTimestampTZExpression: (
  x: unknown,
) => asserts x is Extract<
  Expressions,
  { $$_expression: 'CURRENT_TIMESTAMPTZ' }
> = (
  x: unknown,
): asserts x is Extract<
  Expressions,
  { $$_expression: 'CURRENT_TIMESTAMPTZ' }
> => {
  assertBaseExpression(x, 'CURRENT_TIMESTAMPTZ');
  // Additional properties are ignored as CURRENT_TIMESTAMPTZ requires no arguments
};

/**
 * Type guard to check if a value is a valid CURRENT_TIMESTAMPTZ expression.
 *
 * @param x - The value to check
 * @returns `true` if the value is a valid CURRENT_TIMESTAMPTZ expression, `false` otherwise
 *
 * @example
 * ```ts
 * declare const expr: unknown;
 *
 * if (isCurrentTimestampTZExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'CURRENT_TIMESTAMPTZ' }>
 *   console.log('Current timestamp with timezone expression');
 * }
 * ```
 */
export const isCurrentTimestampTZExpression: (
  x: unknown,
) => x is Extract<Expressions, { $$_expression: 'CURRENT_TIMESTAMPTZ' }> = (
  x: unknown,
): x is Extract<Expressions, { $$_expression: 'CURRENT_TIMESTAMPTZ' }> => {
  try {
    assertCurrentTimestampTZExpression(x);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid DATE_ADD expression.
 *
 * The DATE_ADD expression adds or subtracts a specified amount of time from a date.
 * It requires three components:
 * - `date`: A Date object or column identifier containing a date
 * - `amount`: A number or column identifier specifying how much to add (negative to subtract)
 * - `unit`: The time unit ('DAYS', 'MONTHS', 'YEARS', 'HOURS', 'MINUTES', 'SECONDS')
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid DATE_ADD expression
 * @throws {TypeError} If date is not a Date object or valid column identifier
 * @throws {TypeError} If amount is not a number or valid column identifier
 * @throws {TypeError} If unit is not a valid time unit
 *
 * @example
 * ```ts
 * // Negative `amount` subtracts.
 * const expr = {
 *   $$_expression: 'DATE_ADD',
 *   args: { date: '@order_date', amount: -30, unit: 'DAYS' }
 * };
 * assertDateAddExpression(expr, ['order_date']);
 * ```
 */
export const assertDateAddExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { $$_expression: 'DATE_ADD' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { $$_expression: 'DATE_ADD' }> => {
  assertBaseExpression(x, 'DATE_ADD');
  if (!('args' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'args' property`,
    );
  }
  if (
    typeof x.args !== 'object' ||
    x.args === null
  ) {
    throw new TypeError(
      `Invalid Expression definition: args key must be an object with date, amount and unit properties`,
    );
  }
  if ('date' in x.args) {
    // Known column reference (well-formed AND in the columnList, or
    // columnList undefined). Anything else falls through — only Date
    // objects are valid here, so an @-string not in the list or a bare
    // literal string both get rejected as wrong type.
    if (!isColumnIdentifier(x.args.date, columnList)) {
      if (!(x.args.date instanceof Date)) {
        throw new TypeError(
          `Invalid Expression definition: date must be a Date object or ColumnIdentifier, got ${typeof x
            .args.date}`,
        );
      }
    }
  } else {
    throw new TypeError(
      `Invalid Expression definition: Missing 'date' property in args`,
    );
  }
  if ('amount' in x.args) {
    if (!isColumnIdentifier(x.args.amount, columnList)) {
      if (typeof x.args.amount !== 'number') {
        throw new TypeError(
          `Invalid Expression definition: amount must be a number or ColumnIdentifier, got ${typeof x
            .args.amount}`,
        );
      }
    }
  } else {
    throw new TypeError(
      `Invalid Expression definition: Missing 'amount' property in args`,
    );
  }
  if ('unit' in x.args) {
    validateTimeUnits(x.args.unit);
  } else {
    throw new TypeError(
      `Invalid Expression definition: Missing 'unit' property in args`,
    );
  }
};

/**
 * Type guard to check if a value is a valid DATE_ADD expression.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid DATE_ADD expression, `false` otherwise
 *
 * @example
 * ```ts
 * declare function getExpressionFromUser(): unknown;
 * declare function processDateCalculation(x: unknown): void;
 *
 * const expr = {
 *   $$_expression: 'DATE_ADD',
 *   args: { date: new Date(), amount: 5, unit: 'DAYS' }
 * };
 *
 * if (isDateAddExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: 'DATE_ADD' }>
 *   const { date, amount, unit } = expr.args;
 *   console.log(`Adding ${amount} ${unit} to ${date}`);
 * }
 *
 * // Validate user input safely
 * const userExpr: unknown = getExpressionFromUser();
 * if (isDateAddExpression(userExpr, ['order_date', 'delivery_days'])) {
 *   // Safe to use - all column references are validated
 *   processDateCalculation(userExpr);
 * }
 * ```
 */
export const isDateAddExpression = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { $$_expression: 'DATE_ADD' }> => {
  try {
    assertDateAddExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};

/**
 * Asserts that a value is a valid date-related expression.
 *
 * This is a comprehensive validator that checks if a value matches any of the
 * supported date expression types. It automatically delegates to the appropriate
 * specific validator based on the expression type.
 *
 * Supported date expression types:
 * - NOW: Current timestamp
 * - CURRENT_DATE: Current date only
 * - CURRENT_TIME: Current time only
 * - CURRENT_TIMESTAMP: Current timestamp (alias for NOW)
 * - CURRENT_TIMESTAMPTZ: Current timestamp with timezone
 * - DATE_ADD: Add/subtract time intervals
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid date expression
 * @throws {TypeError} If the expression type is not a recognized date type
 *
 * @example
 * ```ts
 * // Delegates to the matching per-type validator...
 * assertDateExpression({ $$_expression: 'DATE_ADD', args: { date: '@created', amount: 7, unit: 'DAYS' } }, ['created']);
 * // ...and rejects a non-date expression type.
 * assertDateExpression({ $$_expression: 'SUM' });  // throws: TypeError
 * ```
 */
export const assertDateExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => asserts x is Extract<Expressions, { $$_expression: DateExpressions }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): asserts x is Extract<Expressions, { $$_expression: DateExpressions }> => {
  if (depth > maxDepth) {
    throw new TypeError(
      `Expression exceeds maximum nesting depth of ${maxDepth}. ` +
        `This may indicate overly complex expression or circular reference.`,
    );
  }
  assertBaseExpression(x);
  if (x.$$_expression === 'NOW') {
    assertNowExpression(x);
  } else if (x.$$_expression === 'CURRENT_DATE') {
    assertCurrentDateExpression(x);
  } else if (x.$$_expression === 'CURRENT_TIME') {
    assertCurrentTimeExpression(x);
  } else if (x.$$_expression === 'CURRENT_TIMESTAMP') {
    assertCurrentTimestampExpression(x);
  } else if (x.$$_expression === 'CURRENT_TIMESTAMPTZ') {
    assertCurrentTimestampTZExpression(x);
  } else if (x.$$_expression === 'DATE_ADD') {
    assertDateAddExpression(x, columnList);
  } else {
    throw new TypeError(
      `Invalid Expression type: Expected a Date expression type, got '${x.$$_expression}'`,
    );
  }
};

/**
 * Type guard to check if a value is a valid date-related expression.
 *
 * This is a comprehensive type guard that checks if a value matches any of the
 * supported date expression types. It narrows the type to a union of all date expressions.
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid date expression, `false` otherwise
 *
 * @example
 * ```ts
 * declare function getExpression(): unknown;
 * declare function getAllExpressions(): unknown[];
 * declare function buildQuery(): unknown;
 * declare function executeQuery(x: unknown): void;
 *
 * const expr: unknown = getExpression();
 *
 * if (isDateExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { $$_expression: DateExpressions }>
 *   switch (expr.$$_expression) {
 *     case 'NOW':
 *       console.log('Current timestamp');
 *       break;
 *     case 'CURRENT_DATE':
 *       console.log('Current date only');
 *       break;
 *     case 'DATE_ADD':
 *       console.log('Date arithmetic:', expr.args);
 *       break;
 *     case 'CURRENT_TIME':
 *       console.log('Current time only');
 *       break;
 *     case 'CURRENT_TIMESTAMP':
 *     case 'CURRENT_TIMESTAMPTZ':
 *       console.log('Timestamp expression');
 *       break;
 *   }
 * }
 *
 * // Filter expressions by category
 * const expressions: unknown[] = getAllExpressions();
 * const dateExpressions = expressions.filter((x) => isDateExpression(x));
 * console.log(`Found ${dateExpressions.length} date expressions`);
 *
 * // Validate query expressions with column validation
 * const queryExpr: unknown = buildQuery();
 * if (isDateExpression(queryExpr, ['created_at', 'updated_at'])) {
 *   // All date references are validated against column list
 *   executeQuery(queryExpr);
 * }
 * ```
 */
export const isDateExpression: (
  x: unknown,
  columnList?: string[],
  depth?: number,
  maxDepth?: number,
) => x is Extract<Expressions, { $$_expression: DateExpressions }> = (
  x: unknown,
  columnList?: string[],
  depth = 0,
  maxDepth = 10,
): x is Extract<Expressions, { $$_expression: DateExpressions }> => {
  try {
    assertDateExpression(x, columnList, depth, maxDepth);
    return true;
  } catch {
    return false;
  }
};
