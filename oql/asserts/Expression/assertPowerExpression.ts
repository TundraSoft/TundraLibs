import { assertColumnIdentifier } from '../ColumnIdentifier.ts';

/**
 * Asserts that a value is a valid POWER expression.
 *
 * POWER expression requires:
 * - `type`: 'POWER'
 * - `args`: Object with `base` and `exponent` properties
 *
 * @param value - The object to validate
 * @param customMessage - Optional custom error message
 * @throws {TypeError} If value is not a valid POWER expression
 *
 * @example
 * ```typescript
 * assertPowerExpression({ type: 'POWER', args: { base: 2, exponent: 3 } });  // OK
 * assertPowerExpression({ type: 'POWER', args: { base: '@value', exponent: 2 } });  // OK
 * assertPowerExpression({ type: 'POWER', args: [2, 3] });  // Throws - args must be object
 * ```
 */
export function assertPowerExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'POWER';
  args: {
    base: string | number | bigint | object;
    exponent: string | number | bigint | object;
  };
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid POWER expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  // Validate type
  if (obj.type !== 'POWER') {
    throw new TypeError(
      customMessage ?? `Invalid POWER expression: type must be 'POWER'`,
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
        `Invalid POWER expression: Unknown properties: ${
          invalidProps.join(', ')
        }. Valid properties are: ${validProps.join(', ')}`,
    );
  }

  // args is required
  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: Missing required property 'args'`,
    );
  }

  if (obj.args === null || obj.args === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: args cannot be null or undefined`,
    );
  }

  // args must be an object (not array)
  if (
    typeof obj.args !== 'object' || Array.isArray(obj.args)
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: args must be a plain object with 'base' and 'exponent' properties`,
    );
  }

  const args = obj.args as Record<string, unknown>;

  // Validate base
  if (!('base' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: Missing required property 'args.base'`,
    );
  }

  if (args.base === null || args.base === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: args.base cannot be null or undefined`,
    );
  }

  const baseType = typeof args.base;
  if (
    baseType !== 'number' &&
    baseType !== 'bigint' &&
    baseType !== 'string' &&
    baseType !== 'object'
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: args.base must be a number, bigint, ColumnIdentifier, or Expression object`,
    );
  }

  if (baseType === 'string') {
    try {
      assertColumnIdentifier(args.base as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid POWER expression: args.base - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate exponent
  if (!('exponent' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: Missing required property 'args.exponent'`,
    );
  }

  if (args.exponent === null || args.exponent === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: args.exponent cannot be null or undefined`,
    );
  }

  const exponentType = typeof args.exponent;
  if (
    exponentType !== 'number' &&
    exponentType !== 'bigint' &&
    exponentType !== 'string' &&
    exponentType !== 'object'
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: args.exponent must be a number, bigint, ColumnIdentifier, or Expression object`,
    );
  }

  if (exponentType === 'string') {
    try {
      assertColumnIdentifier(args.exponent as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid POWER expression: args.exponent - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Check for unknown properties in args
  const validArgProps = ['base', 'exponent'];
  const invalidArgProps = Object.keys(args).filter((key) =>
    !validArgProps.includes(key)
  );

  if (invalidArgProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid POWER expression: Unknown properties in args: ${
          invalidArgProps.join(', ')
        }. Valid properties are: ${validArgProps.join(', ')}`,
    );
  }
}
