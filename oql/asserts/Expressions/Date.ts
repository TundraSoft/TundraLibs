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

import { assertColumnIdentifier } from '../ColumnIdentifier.ts';
import type { Expressions } from '../../types/mod.ts';
import { assertBaseExpression, validateTimeUnits } from './Base.ts';

/**
 * Union type of all date-related expression type literals.
 * Used for type narrowing and validation.
 */
type DateExpressions =
  | 'NOW'
  | 'CURRENT_DATE'
  | 'CURRENT_TIME'
  | 'CURRENT_TIMESTAMP'
  | 'CURRENT_TIMESTAMPTZ'
  | 'DATE_ADD';

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
 * // Basic NOW expression
 * const expr = { type: 'NOW' };
 * assertNowExpression(expr); // ✓ Valid
 *
 * // Use in WHERE clause to filter recent records
 * const recentOrders = {
 *   type: 'NOW'
 * }; // Will be used in: WHERE order_date > NOW()
 * assertNowExpression(recentOrders); // ✓ Valid
 *
 * // Invalid - wrong type
 * assertNowExpression({ type: 'CURRENT_DATE' }); // ✗ Throws TypeError
 * ```
 */
export const assertNowExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { type: 'NOW' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { type: 'NOW' }> => {
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
 * const expr = { type: 'NOW' };
 * if (isNowExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { type: 'NOW' }>
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
): x is Extract<Expressions, { type: 'NOW' }> => {
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
 * // Basic CURRENT_DATE expression
 * const expr = { type: 'CURRENT_DATE' };
 * assertCurrentDateExpression(expr); // ✓ Valid
 *
 * // Find records created today (ignoring time)
 * const todayFilter = { type: 'CURRENT_DATE' };
 * // Will be used in: WHERE DATE(created_at) = CURRENT_DATE
 * assertCurrentDateExpression(todayFilter); // ✓ Valid
 *
 * // Calculate age in years
 * const ageCalculation = { type: 'CURRENT_DATE' };
 * // Used in: YEAR(CURRENT_DATE) - YEAR(birth_date)
 * assertCurrentDateExpression(ageCalculation); // ✓ Valid
 * ```
 */
export const assertCurrentDateExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { type: 'CURRENT_DATE' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { type: 'CURRENT_DATE' }> => {
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
 * if (isCurrentDateExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { type: 'CURRENT_DATE' }>
 *   console.log('Current date expression');
 * }
 * ```
 */
export const isCurrentDateExpression = (
  x: unknown,
): x is Extract<Expressions, { type: 'CURRENT_DATE' }> => {
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
 * // Basic CURRENT_TIME expression
 * const expr = { type: 'CURRENT_TIME' };
 * assertCurrentTimeExpression(expr); // ✓ Valid
 *
 * // Check business hours (e.g., 9 AM - 5 PM)
 * const timeCheck = { type: 'CURRENT_TIME' };
 * // Used in: WHERE CURRENT_TIME BETWEEN '09:00' AND '17:00'
 * assertCurrentTimeExpression(timeCheck); // ✓ Valid
 *
 * // Store check-in time without date
 * const checkIn = { type: 'CURRENT_TIME' };
 * assertCurrentTimeExpression(checkIn); // ✓ Valid
 * ```
 */
export const assertCurrentTimeExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { type: 'CURRENT_TIME' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { type: 'CURRENT_TIME' }> => {
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
 * if (isCurrentTimeExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { type: 'CURRENT_TIME' }>
 *   console.log('Current time expression');
 * }
 * ```
 */
export const isCurrentTimeExpression = (
  x: unknown,
): x is Extract<Expressions, { type: 'CURRENT_TIME' }> => {
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
 * // Basic CURRENT_TIMESTAMP expression
 * const expr = { type: 'CURRENT_TIMESTAMP' };
 * assertCurrentTimestampExpression(expr); // ✓ Valid
 *
 * // Set default value for created_at column
 * const defaultValue = { type: 'CURRENT_TIMESTAMP' };
 * // Used in: created_at = CURRENT_TIMESTAMP
 * assertCurrentTimestampExpression(defaultValue); // ✓ Valid
 *
 * // Audit trail timestamp
 * const auditStamp = { type: 'CURRENT_TIMESTAMP' };
 * // INSERT INTO audit_log VALUES (..., CURRENT_TIMESTAMP)
 * assertCurrentTimestampExpression(auditStamp); // ✓ Valid
 * ```
 */
export const assertCurrentTimestampExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { type: 'CURRENT_TIMESTAMP' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { type: 'CURRENT_TIMESTAMP' }> => {
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
 * if (isCurrentTimestampExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { type: 'CURRENT_TIMESTAMP' }>
 *   console.log('Current timestamp expression');
 * }
 * ```
 */
export const isCurrentTimestampExpression = (
  x: unknown,
): x is Extract<Expressions, { type: 'CURRENT_TIMESTAMP' }> => {
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
 * // Basic CURRENT_TIMESTAMPTZ expression (PostgreSQL)
 * const expr = { type: 'CURRENT_TIMESTAMPTZ' };
 * assertCurrentTimestampTZExpression(expr); // ✓ Valid
 *
 * // Store event time with timezone info
 * const eventTime = { type: 'CURRENT_TIMESTAMPTZ' };
 * // PostgreSQL: CURRENT_TIMESTAMPTZ
 * // Others: CURRENT_TIMESTAMP (without explicit TZ)
 * assertCurrentTimestampTZExpression(eventTime); // ✓ Valid
 *
 * // Global application timestamp with timezone awareness
 * const globalTime = { type: 'CURRENT_TIMESTAMPTZ' };
 * assertCurrentTimestampTZExpression(globalTime); // ✓ Valid
 * ```
 */
export const assertCurrentTimestampTZExpression: (
  x: unknown,
) => asserts x is Extract<Expressions, { type: 'CURRENT_TIMESTAMPTZ' }> = (
  x: unknown,
): asserts x is Extract<Expressions, { type: 'CURRENT_TIMESTAMPTZ' }> => {
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
 * if (isCurrentTimestampTZExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { type: 'CURRENT_TIMESTAMPTZ' }>
 *   console.log('Current timestamp with timezone expression');
 * }
 * ```
 */
export const isCurrentTimestampTZExpression: (
  x: unknown,
) => x is Extract<Expressions, { type: 'CURRENT_TIMESTAMPTZ' }> = (
  x: unknown,
): x is Extract<Expressions, { type: 'CURRENT_TIMESTAMPTZ' }> => {
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
 * // Add 7 days to a date
 * const expr = {
 *   type: 'DATE_ADD',
 *   args: {
 *     date: new Date(),
 *     amount: 7,
 *     unit: 'DAYS'
 *   }
 * };
 * assertDateAddExpression(expr); // ✓ Valid
 *
 * // Add hours using column reference
 * const expr2 = {
 *   type: 'DATE_ADD',
 *   args: {
 *     date: '@created_at',
 *     amount: '@duration_hours',
 *     unit: 'HOURS'
 *   }
 * };
 * assertDateAddExpression(expr2, ['created_at', 'duration_hours']); // ✓ Valid
 *
 * // Subtract days (negative amount)
 * const pastDate = {
 *   type: 'DATE_ADD',
 *   args: {
 *     date: '@order_date',
 *     amount: -30,
 *     unit: 'DAYS'
 *   }
 * };
 * assertDateAddExpression(pastDate, ['order_date']); // ✓ Valid
 *
 * // Add months to calculate subscription expiry
 * const expiry = {
 *   type: 'DATE_ADD',
 *   args: {
 *     date: '@subscription_start',
 *     amount: 12,
 *     unit: 'MONTHS'
 *   }
 * };
 * assertDateAddExpression(expiry, ['subscription_start']); // ✓ Valid
 *
 * // Add minutes to appointment time
 * const endTime = {
 *   type: 'DATE_ADD',
 *   args: {
 *     date: '@appointment_start',
 *     amount: 45,
 *     unit: 'MINUTES'
 *   }
 * };
 * assertDateAddExpression(endTime, ['appointment_start']); // ✓ Valid
 * ```
 */
export const assertDateAddExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: 'DATE_ADD' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: 'DATE_ADD' }> => {
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
  if (!('date' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'date' property in args`,
    );
  } else {
    if (typeof x.args.date === 'string') {
      assertColumnIdentifier(x.args.date, columnList);
    } else if (!(x.args.date instanceof Date)) {
      throw new TypeError(
        `Invalid Expression definition: date must be a Date object or ColumnIdentifier, got ${typeof x
          .args.date}`,
      );
    }
  }
  if (!('amount' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'amount' property in args`,
    );
  } else {
    if (typeof x.args.amount === 'string') {
      assertColumnIdentifier(x.args.amount, columnList);
    } else if (typeof x.args.amount !== 'number') {
      throw new TypeError(
        `Invalid Expression definition: amount must be a number or ColumnIdentifier, got ${typeof x
          .args.amount}`,
      );
    }
  }
  if (!('unit' in x.args)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'unit' property in args`,
    );
  } else {
    validateTimeUnits(x.args.unit);
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
 * const expr = {
 *   type: 'DATE_ADD',
 *   args: { date: new Date(), amount: 5, unit: 'DAYS' }
 * };
 *
 * if (isDateAddExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { type: 'DATE_ADD' }>
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
): x is Extract<Expressions, { type: 'DATE_ADD' }> => {
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
 * // Validate any date expression type
 * const expr1 = { type: 'NOW' };
 * assertDateExpression(expr1); // ✓ Delegates to assertNowExpression
 *
 * const expr2 = {
 *   type: 'DATE_ADD',
 *   args: { date: new Date(), amount: 1, unit: 'DAYS' }
 * };
 * assertDateExpression(expr2); // ✓ Delegates to assertDateAddExpression
 *
 * const expr3 = { type: 'CURRENT_DATE' };
 * assertDateExpression(expr3); // ✓ Delegates to assertCurrentDateExpression
 *
 * // Validate with column list
 * const expr4 = {
 *   type: 'DATE_ADD',
 *   args: { date: '@created', amount: 7, unit: 'DAYS' }
 * };
 * assertDateExpression(expr4, ['created', 'updated']); // ✓ Valid
 *
 * // Invalid expression type
 * assertDateExpression({ type: 'SUM' }); // ✗ Throws TypeError
 * ```
 */
export const assertDateExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Expressions, { type: DateExpressions }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Expressions, { type: DateExpressions }> => {
  assertBaseExpression(x);
  if (x.type === 'NOW') {
    assertNowExpression(x);
  } else if (x.type === 'CURRENT_DATE') {
    assertCurrentDateExpression(x);
  } else if (x.type === 'CURRENT_TIME') {
    assertCurrentTimeExpression(x);
  } else if (x.type === 'CURRENT_TIMESTAMP') {
    assertCurrentTimestampExpression(x);
  } else if (x.type === 'CURRENT_TIMESTAMPTZ') {
    assertCurrentTimestampTZExpression(x);
  } else if (x.type === 'DATE_ADD') {
    assertDateAddExpression(x, columnList);
  } else {
    throw new TypeError(
      `Invalid Expression type: Expected a Date expression type, got '${x.type}'`,
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
 * const expr: unknown = getExpression();
 *
 * if (isDateExpression(expr)) {
 *   // expr is narrowed to Extract<Expressions, { type: DateExpressions }>
 *   switch (expr.type) {
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
 * const dateExpressions = expressions.filter(isDateExpression);
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
) => x is Extract<Expressions, { type: DateExpressions }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Expressions, { type: DateExpressions }> => {
  try {
    assertDateExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};
