import { assertColumnIdentifier } from '../ColumnIdentifier.ts';

/**
 * Asserts that a value is a valid variadic string expression (CONCAT, LOWER, UPPER, TRIM, LTRIM, RTRIM, LENGTH).
 *
 * These expressions accept one or more string arguments.
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid variadic string expression
 */
export function assertVariadicStringExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'CONCAT' | 'LOWER' | 'UPPER' | 'TRIM' | 'LTRIM' | 'RTRIM' | 'LENGTH';
  args: Array<string | object>;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid string expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  const validTypes = [
    'CONCAT',
    'LOWER',
    'UPPER',
    'TRIM',
    'LTRIM',
    'RTRIM',
    'LENGTH',
  ];
  if (!validTypes.includes(obj.type as string)) {
    throw new TypeError(
      customMessage ??
        `Invalid string expression: type must be one of ${
          validTypes.join(', ')
        }`,
    );
  }

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

  if (!Array.isArray(obj.args)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args must be an array`,
    );
  }

  if (obj.args.length === 0) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args cannot be empty (at least one argument required)`,
    );
  }

  // For unary operations (LOWER, UPPER, TRIM, LTRIM, RTRIM, LENGTH), must have exactly 1 argument
  const unaryTypes = ['LOWER', 'UPPER', 'TRIM', 'LTRIM', 'RTRIM', 'LENGTH'];
  if (unaryTypes.includes(obj.type as string) && obj.args.length !== 1) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: must have exactly 1 argument`,
    );
  }

  for (let i = 0; i < obj.args.length; i++) {
    const arg = obj.args[i];

    if (arg === null || arg === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args[${i}] cannot be null or undefined`,
      );
    }

    const argType = typeof arg;

    if (argType !== 'string' && argType !== 'object') {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args[${i}] must be a string, ColumnIdentifier, or Expression object`,
      );
    }

    if (argType === 'string') {
      // Check if it's a ColumnIdentifier or a literal string
      if ((arg as string).startsWith('@')) {
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
      // Literal strings are also valid
    }
  }
}
