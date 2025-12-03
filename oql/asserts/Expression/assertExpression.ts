import { assertArithmeticExpression } from './assertArithmeticExpression.ts';
import { assertUnaryMathExpression } from './assertUnaryMathExpression.ts';
import { assertPowerExpression } from './assertPowerExpression.ts';
import { assertVariadicStringExpression } from './assertVariadicStringExpression.ts';
import {
  assertPadExpression,
  assertReplaceExpression,
  assertSubstrExpression,
} from './assertComplexStringExpression.ts';
import { assertNoArgsExpression } from './assertNoArgsExpression.ts';
import {
  assertDateAddExpression,
  assertDateDiffExpression,
} from './assertDateExpression.ts';
import {
  assertCastExpression,
  assertCoalesceExpression,
  assertCryptoExpression,
  assertNullIfExpression,
} from './assertUtilityExpression.ts';

/**
 * Asserts that a value is a valid Expression.
 *
 * This is the main entry point for validating any expression type.
 * It delegates to the appropriate specific validator based on the expression type.
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid Expression
 *
 * @example
 * ```typescript
 * assertExpression({ type: 'ADD', args: [1, 2, 3] });  // OK
 * assertExpression({ type: 'CONCAT', args: ['Hello', ' ', 'World'] });  // OK
 * assertExpression({ type: 'NOW' });  // OK
 * assertExpression({ type: 'INVALID' });  // Throws
 * ```
 */
export function assertExpression(
  value: unknown,
  customMessage?: string,
): asserts value is { type: string; args?: unknown } {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid Expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type exists
  if (!('type' in obj)) {
    throw new TypeError(
      customMessage ?? `Invalid Expression: Missing required property 'type'`,
    );
  }

  if (typeof obj.type !== 'string') {
    throw new TypeError(
      customMessage ?? `Invalid Expression: 'type' must be a string`,
    );
  }

  // Delegate to specific validators based on type
  const type = obj.type;

  try {
    // Arithmetic expressions
    if (['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'MODULO'].includes(type)) {
      assertArithmeticExpression(value, customMessage);
      return;
    }

    // Unary math expressions
    if (['ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT', 'SIGN'].includes(type)) {
      assertUnaryMathExpression(value, customMessage);
      return;
    }

    // Power expression
    if (type === 'POWER') {
      assertPowerExpression(value, customMessage);
      return;
    }

    // Variadic string expressions
    if (
      ['CONCAT', 'LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM', 'LENGTH'].includes(
        type,
      )
    ) {
      assertVariadicStringExpression(value, customMessage);
      return;
    }

    // Complex string expressions
    if (type === 'SUBSTR') {
      assertSubstrExpression(value, customMessage);
      return;
    }

    if (type === 'REPLACE') {
      assertReplaceExpression(value, customMessage);
      return;
    }

    if (type === 'LPAD' || type === 'RPAD') {
      assertPadExpression(value, customMessage);
      return;
    }

    // No-args expressions
    if (
      [
        'NOW',
        'CURRENT_DATE',
        'CURRENT_TIME',
        'CURRENT_TIMESTAMP',
        'CURRENT_TIMESTAMPTZ',
        'UUID',
      ].includes(type)
    ) {
      assertNoArgsExpression(value, customMessage);
      return;
    }

    // Date expressions
    if (type === 'DATE_ADD') {
      assertDateAddExpression(value, customMessage);
      return;
    }

    if (type === 'DATE_DIFF') {
      assertDateDiffExpression(value, customMessage);
      return;
    }

    // Utility expressions
    if (type === 'COALESCE') {
      assertCoalesceExpression(value, customMessage);
      return;
    }

    if (type === 'NULLIF') {
      assertNullIfExpression(value, customMessage);
      return;
    }

    if (type === 'CAST') {
      assertCastExpression(value, customMessage);
      return;
    }

    // Crypto expressions
    if (['ENCRYPT', 'DECRYPT', 'HASH'].includes(type)) {
      assertCryptoExpression(value, customMessage);
      return;
    }

    // Unknown type
    throw new TypeError(
      customMessage ??
        `Invalid Expression: Unknown type '${type}'. Must be one of: ADD, SUBTRACT, MULTIPLY, DIVIDE, MODULO, ABS, CEIL, FLOOR, ROUND, POWER, SQRT, SIGN, LENGTH, CONCAT, LOWER, UPPER, TRIM, LTRIM, RTRIM, SUBSTR, REPLACE, LPAD, RPAD, NOW, CURRENT_DATE, CURRENT_TIME, CURRENT_TIMESTAMP, CURRENT_TIMESTAMPTZ, UUID, DATE_ADD, DATE_DIFF, COALESCE, NULLIF, CAST, ENCRYPT, DECRYPT, HASH`,
    );
  } catch (error) {
    // Re-throw with custom message if provided and error doesn't already use it
    if (customMessage && error instanceof TypeError) {
      if (!error.message.startsWith(customMessage)) {
        throw new TypeError(customMessage);
      }
    }
    throw error;
  }
}
