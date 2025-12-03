import { assertColumnIdentifier } from '../ColumnIdentifier.ts';

/**
 * Asserts that a value is a valid arithmetic expression (ADD, SUBTRACT, MULTIPLY, DIVIDE, MODULO).
 *
 * Arithmetic expressions require:
 * - `type`: One of 'ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'MODULO'
 * - `args`: Array of numbers, bigints, or ColumnIdentifiers
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid arithmetic expression
 *
 * @example
 * ```typescript
 * assertArithmeticExpression({ type: 'ADD', args: [1, 2, 3] });  // OK
 * assertArithmeticExpression({ type: 'MULTIPLY', args: ['@price', '@quantity'] });  // OK
 * assertArithmeticExpression({ type: 'ADD', args: [] });  // Throws - args cannot be empty
 * ```
 */
export function assertArithmeticExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'DIVIDE' | 'MODULO';
  args: Array<string | number | bigint | object>;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid arithmetic expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  const validTypes = ['ADD', 'SUBTRACT', 'MULTIPLY', 'DIVIDE', 'MODULO'];
  if (!validTypes.includes(obj.type as string)) {
    throw new TypeError(
      customMessage ??
        `Invalid arithmetic expression: type must be one of ${
          validTypes.join(', ')
        }`,
    );
  }

  // Check for invalid properties
  const validProps = ['type', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Unknown properties: ${
          invalidProps.join(', ')
        }. Valid properties are: ${validProps.join(', ')}`,
    );
  }

  // args is required
  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Missing required property 'args'`,
    );
  }

  if (obj.args === null || obj.args === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args cannot be null or undefined`,
    );
  }

  // args must be an array
  if (!Array.isArray(obj.args)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args must be an array`,
    );
  }

  // args cannot be empty
  if (obj.args.length === 0) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args cannot be empty (at least one argument required)`,
    );
  }

  // For DIVIDE and MODULO, must have exactly 2 arguments
  if (
    (obj.type === 'DIVIDE' || obj.type === 'MODULO') && obj.args.length !== 2
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: must have exactly 2 arguments`,
    );
  }

  // Validate each argument
  for (let i = 0; i < obj.args.length; i++) {
    const arg = obj.args[i];

    if (arg === null || arg === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args[${i}] cannot be null or undefined`,
      );
    }

    const argType = typeof arg;

    // Must be number, bigint, string (ColumnIdentifier), or object (Expression)
    if (
      argType !== 'number' &&
      argType !== 'bigint' &&
      argType !== 'string' &&
      argType !== 'object'
    ) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args[${i}] must be a number, bigint, ColumnIdentifier, or Expression object`,
      );
    }

    // If string, validate it's a ColumnIdentifier
    if (argType === 'string') {
      try {
        assertColumnIdentifier(arg as string);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid ${obj.type} expression: args[${i}] - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }
}
