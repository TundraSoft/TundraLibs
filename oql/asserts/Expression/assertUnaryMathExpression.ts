import { assertColumnIdentifier } from '../ColumnIdentifier.ts';

/**
 * Asserts that a value is a valid unary math expression (ABS, CEIL, FLOOR, ROUND, SQRT, SIGN).
 *
 * Unary math expressions require:
 * - `type`: One of 'ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT', 'SIGN'
 * - `args`: Array with single numeric value, bigint, or ColumnIdentifier
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid unary math expression
 *
 * @example
 * ```typescript
 * assertUnaryMathExpression({ type: 'ABS', args: [-5] });  // OK
 * assertUnaryMathExpression({ type: 'SQRT', args: ['@value'] });  // OK
 * assertUnaryMathExpression({ type: 'ROUND', args: [3.14, 2.71] });  // Throws - must have exactly 1 argument
 * ```
 */
export function assertUnaryMathExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'ABS' | 'CEIL' | 'FLOOR' | 'ROUND' | 'SQRT' | 'SIGN';
  args: Array<string | number | bigint | object>;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid unary math expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  const validTypes = ['ABS', 'CEIL', 'FLOOR', 'ROUND', 'SQRT', 'SIGN'];
  if (!validTypes.includes(obj.type as string)) {
    throw new TypeError(
      customMessage ??
        `Invalid unary math expression: type must be one of ${
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

  // Must have exactly 1 argument
  if (obj.args.length !== 1) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: must have exactly 1 argument`,
    );
  }

  const arg = obj.args[0];

  if (arg === null || arg === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args[0] cannot be null or undefined`,
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
        `Invalid ${obj.type} expression: args[0] must be a number, bigint, ColumnIdentifier, or Expression object`,
    );
  }

  // If string, validate it's a ColumnIdentifier
  if (argType === 'string') {
    try {
      assertColumnIdentifier(arg as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args[0] - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }
}
