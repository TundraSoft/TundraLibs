import { Expressions } from '../../types/mod.ts';
import { assertBaseExpression } from './Base.ts';
import { assertDateExpression } from './Date.ts';
import { assertNumericExpression } from './Numeric.ts';
import { assertStringExpression } from './String.ts';

/**
 * Asserts that a value is a valid expression of any type.
 *
 * This is the top-level validator that delegates to the appropriate
 * category-specific validator (date, numeric, or string) based on the
 * expression type.
 *
 * @param x - The value to validate
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @throws {TypeError} If the value is not a valid expression
 * @throws {TypeError} If the expression type is not recognized
 *
 * @example
 * ```ts
 * // Date expression
 * const expr1 = { type: 'NOW' };
 * assertExpression(expr1); // ✓ Delegates to assertDateExpression
 *
 * // Numeric expression
 * const expr2 = { type: 'ADD', args: [1, 2, 3] };
 * assertExpression(expr2); // ✓ Delegates to assertNumericExpression
 *
 * // String expression
 * const expr3 = { type: 'CONCAT', args: ['Hello', ' ', 'World'] };
 * assertExpression(expr3); // ✓ Delegates to assertStringExpression
 *
 * // With column validation
 * const expr4 = { type: 'MULTIPLY', args: ['@price', '@quantity'] };
 * assertExpression(expr4, ['price', 'quantity']); // ✓ Valid
 * ```
 */
export const assertExpression: (
  x: unknown,
  columnList?: string[],
) => asserts x is Expressions = (
  x: unknown,
  columnList?: string[],
): asserts x is Expressions => {
  assertBaseExpression(x);

  // Try date expressions first
  try {
    assertDateExpression(x, columnList);
    return;
  } catch {
    // Not a date expression, try next category
  }

  // Try numeric expressions
  try {
    assertNumericExpression(x, columnList);
    return;
  } catch {
    // Not a numeric expression, try next category
  }

  // Try string expressions
  try {
    assertStringExpression(x, columnList);
    return;
  } catch {
    // Not a string expression either
  }

  // If we get here, it's not a valid expression type
  throw new TypeError(
    `Invalid Expression type: Unknown expression type '${x.type}'`,
  );
};

/**
 * Type guard to check if a value is a valid expression of any type.
 *
 * This is the top-level type guard that checks if a value matches any
 * supported expression type (date, numeric, or string).
 *
 * @param x - The value to check
 * @param columnList - Optional list of valid column names (without '@' prefix) for validation
 * @returns `true` if the value is a valid expression, `false` otherwise
 *
 * @example
 * ```ts
 * const value: unknown = getUserInput();
 *
 * if (isExpression(value)) {
 *   // value is narrowed to Expressions
 *   console.log(`Expression type: ${value.type}`);
 *
 *   // Can safely use in queries
 *   const query = buildQuery({ computed: value });
 * }
 *
 * // Filter valid expressions from mixed array
 * const mixed: unknown[] = getExpressions();
 * const validExpressions = mixed.filter(isExpression);
 * console.log(`Found ${validExpressions.length} valid expressions`);
 *
 * // Validate with column list
 * const expr: unknown = parseUserExpression();
 * if (isExpression(expr, ['name', 'email', 'age'])) {
 *   // All column references are validated
 *   executeQuery(expr);
 * }
 * ```
 */
export const isExpression: (
  x: unknown,
  columnList?: string[],
) => x is Expressions = (
  x: unknown,
  columnList?: string[],
): x is Expressions => {
  try {
    assertExpression(x, columnList);
    return true;
  } catch {
    return false;
  }
};
