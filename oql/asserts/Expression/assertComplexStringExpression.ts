import { assertColumnIdentifier } from '../ColumnIdentifier.ts';

/**
 * Asserts that a value is a valid SUBSTR expression.
 */
export function assertSubstrExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'SUBSTR';
  args: {
    string: string | object;
    start: string | number | object;
    length?: string | number | object;
  };
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid SUBSTR expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'SUBSTR') {
    throw new TypeError(
      customMessage ?? `Invalid SUBSTR expression: type must be 'SUBSTR'`,
    );
  }

  const validProps = ['type', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: Unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }

  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: Missing required property 'args'`,
    );
  }

  if (
    obj.args === null || obj.args === undefined ||
    typeof obj.args !== 'object' || Array.isArray(obj.args)
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: args must be a plain object with 'string' and 'start' properties`,
    );
  }

  const args = obj.args as Record<string, unknown>;

  // Validate string
  if (!('string' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: Missing required property 'args.string'`,
    );
  }

  if (args.string === null || args.string === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: args.string cannot be null or undefined`,
    );
  }

  const stringType = typeof args.string;
  if (stringType !== 'string' && stringType !== 'object') {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: args.string must be a string, ColumnIdentifier, or Expression object`,
    );
  }

  if (stringType === 'string' && (args.string as string).startsWith('@')) {
    try {
      assertColumnIdentifier(args.string as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid SUBSTR expression: args.string - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate start
  if (!('start' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: Missing required property 'args.start'`,
    );
  }

  if (args.start === null || args.start === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: args.start cannot be null or undefined`,
    );
  }

  const startType = typeof args.start;
  if (
    startType !== 'number' && startType !== 'string' && startType !== 'object'
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: args.start must be a number, ColumnIdentifier, or Expression object`,
    );
  }

  if (startType === 'string' && (args.start as string).startsWith('@')) {
    try {
      assertColumnIdentifier(args.start as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid SUBSTR expression: args.start - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate length (optional)
  if ('length' in args && args.length !== undefined && args.length !== null) {
    const lengthType = typeof args.length;
    if (
      lengthType !== 'number' && lengthType !== 'string' &&
      lengthType !== 'object'
    ) {
      throw new TypeError(
        customMessage ??
          `Invalid SUBSTR expression: args.length must be a number, ColumnIdentifier, or Expression object`,
      );
    }

    if (lengthType === 'string' && (args.length as string).startsWith('@')) {
      try {
        assertColumnIdentifier(args.length as string);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid SUBSTR expression: args.length - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }

  // Check for unknown properties
  const validArgProps = ['string', 'start', 'length'];
  const invalidArgProps = Object.keys(args).filter((key) =>
    !validArgProps.includes(key)
  );

  if (invalidArgProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid SUBSTR expression: Unknown properties in args: ${
          invalidArgProps.join(', ')
        }`,
    );
  }
}

/**
 * Asserts that a value is a valid REPLACE expression.
 */
export function assertReplaceExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'REPLACE';
  args: {
    string: string | object;
    search: string | object;
    replace: string | object;
  };
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid REPLACE expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'REPLACE') {
    throw new TypeError(
      customMessage ?? `Invalid REPLACE expression: type must be 'REPLACE'`,
    );
  }

  const validProps = ['type', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid REPLACE expression: Unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }

  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid REPLACE expression: Missing required property 'args'`,
    );
  }

  if (
    obj.args === null || obj.args === undefined ||
    typeof obj.args !== 'object' || Array.isArray(obj.args)
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid REPLACE expression: args must be a plain object`,
    );
  }

  const args = obj.args as Record<string, unknown>;
  const requiredProps = ['string', 'search', 'replace'];

  for (const prop of requiredProps) {
    if (!(prop in args)) {
      throw new TypeError(
        customMessage ??
          `Invalid REPLACE expression: Missing required property 'args.${prop}'`,
      );
    }

    if (args[prop] === null || args[prop] === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid REPLACE expression: args.${prop} cannot be null or undefined`,
      );
    }

    const propType = typeof args[prop];
    if (propType !== 'string' && propType !== 'object') {
      throw new TypeError(
        customMessage ??
          `Invalid REPLACE expression: args.${prop} must be a string, ColumnIdentifier, or Expression object`,
      );
    }

    if (propType === 'string' && (args[prop] as string).startsWith('@')) {
      try {
        assertColumnIdentifier(args[prop] as string);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid REPLACE expression: args.${prop} - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }

  const invalidArgProps = Object.keys(args).filter((key) =>
    !requiredProps.includes(key)
  );

  if (invalidArgProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid REPLACE expression: Unknown properties in args: ${
          invalidArgProps.join(', ')
        }`,
    );
  }
}

/**
 * Asserts that a value is a valid LPAD or RPAD expression.
 */
export function assertPadExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'LPAD' | 'RPAD';
  args: {
    string: string | object;
    length: string | number | object;
    fill?: string | object;
  };
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid PAD expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'LPAD' && obj.type !== 'RPAD') {
    throw new TypeError(
      customMessage ?? `Invalid PAD expression: type must be 'LPAD' or 'RPAD'`,
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
        }`,
    );
  }

  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Missing required property 'args'`,
    );
  }

  if (
    obj.args === null || obj.args === undefined ||
    typeof obj.args !== 'object' || Array.isArray(obj.args)
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args must be a plain object`,
    );
  }

  const args = obj.args as Record<string, unknown>;

  // Validate string
  if (!('string' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Missing required property 'args.string'`,
    );
  }

  if (args.string === null || args.string === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args.string cannot be null or undefined`,
    );
  }

  const stringType = typeof args.string;
  if (stringType !== 'string' && stringType !== 'object') {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args.string must be a string, ColumnIdentifier, or Expression object`,
    );
  }

  if (stringType === 'string' && (args.string as string).startsWith('@')) {
    try {
      assertColumnIdentifier(args.string as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args.string - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate length
  if (!('length' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Missing required property 'args.length'`,
    );
  }

  if (args.length === null || args.length === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args.length cannot be null or undefined`,
    );
  }

  const lengthType = typeof args.length;
  if (
    lengthType !== 'number' && lengthType !== 'string' &&
    lengthType !== 'object'
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args.length must be a number, ColumnIdentifier, or Expression object`,
    );
  }

  if (lengthType === 'string' && (args.length as string).startsWith('@')) {
    try {
      assertColumnIdentifier(args.length as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args.length - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate fill (optional)
  if ('fill' in args && args.fill !== undefined && args.fill !== null) {
    const fillType = typeof args.fill;
    if (fillType !== 'string' && fillType !== 'object') {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args.fill must be a string, ColumnIdentifier, or Expression object`,
      );
    }

    if (fillType === 'string' && (args.fill as string).startsWith('@')) {
      try {
        assertColumnIdentifier(args.fill as string);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid ${obj.type} expression: args.fill - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }

  const validArgProps = ['string', 'length', 'fill'];
  const invalidArgProps = Object.keys(args).filter((key) =>
    !validArgProps.includes(key)
  );

  if (invalidArgProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Unknown properties in args: ${
          invalidArgProps.join(', ')
        }`,
    );
  }
}
