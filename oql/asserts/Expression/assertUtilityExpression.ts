import { assertColumnIdentifier } from '../ColumnIdentifier.ts';

/**
 * Asserts that a value is a valid COALESCE expression.
 */
export function assertCoalesceExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'COALESCE';
  args: Array<string | number | bigint | Date | boolean | null | object>;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid COALESCE expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'COALESCE') {
    throw new TypeError(
      customMessage ?? `Invalid COALESCE expression: type must be 'COALESCE'`,
    );
  }

  const validProps = ['type', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid COALESCE expression: Unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }

  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid COALESCE expression: Missing required property 'args'`,
    );
  }

  if (!Array.isArray(obj.args)) {
    throw new TypeError(
      customMessage ?? `Invalid COALESCE expression: args must be an array`,
    );
  }

  if (obj.args.length === 0) {
    throw new TypeError(
      customMessage ??
        `Invalid COALESCE expression: args cannot be empty (at least one argument required)`,
    );
  }

  for (let i = 0; i < obj.args.length; i++) {
    const arg = obj.args[i];

    // null is allowed in COALESCE (that's the whole point)
    if (arg === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid COALESCE expression: args[${i}] cannot be undefined`,
      );
    }

    const argType = typeof arg;

    if (
      argType !== 'string' &&
      argType !== 'number' &&
      argType !== 'bigint' &&
      argType !== 'boolean' &&
      argType !== 'object' &&
      arg !== null
    ) {
      throw new TypeError(
        customMessage ??
          `Invalid COALESCE expression: args[${i}] must be a valid value, ColumnIdentifier, or Expression object`,
      );
    }

    if (argType === 'string' && (arg as string).startsWith('@')) {
      try {
        assertColumnIdentifier(arg as string);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid COALESCE expression: args[${i}] - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }
}

/**
 * Asserts that a value is a valid NULLIF expression.
 */
export function assertNullIfExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'NULLIF';
  args: [
    string | number | bigint | Date | boolean | object,
    string | number | bigint | Date | boolean | object,
  ];
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid NULLIF expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'NULLIF') {
    throw new TypeError(
      customMessage ?? `Invalid NULLIF expression: type must be 'NULLIF'`,
    );
  }

  const validProps = ['type', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid NULLIF expression: Unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }

  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid NULLIF expression: Missing required property 'args'`,
    );
  }

  if (!Array.isArray(obj.args)) {
    throw new TypeError(
      customMessage ?? `Invalid NULLIF expression: args must be an array`,
    );
  }

  if (obj.args.length !== 2) {
    throw new TypeError(
      customMessage ??
        `Invalid NULLIF expression: must have exactly 2 arguments`,
    );
  }

  for (let i = 0; i < 2; i++) {
    const arg = obj.args[i];

    if (arg === null || arg === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid NULLIF expression: args[${i}] cannot be null or undefined`,
      );
    }

    const argType = typeof arg;

    if (
      argType !== 'string' &&
      argType !== 'number' &&
      argType !== 'bigint' &&
      argType !== 'boolean' &&
      argType !== 'object'
    ) {
      throw new TypeError(
        customMessage ??
          `Invalid NULLIF expression: args[${i}] must be a valid value, ColumnIdentifier, or Expression object`,
      );
    }

    if (argType === 'string' && (arg as string).startsWith('@')) {
      try {
        assertColumnIdentifier(arg as string);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid NULLIF expression: args[${i}] - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }
}

/**
 * Asserts that a value is a valid CAST expression.
 */
export function assertCastExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'CAST';
  args: {
    value: string | number | bigint | Date | boolean | object;
    targetType: 'STRING' | 'NUMBER' | 'BIGINT' | 'DATE' | 'BOOLEAN';
  };
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid CAST expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'CAST') {
    throw new TypeError(
      customMessage ?? `Invalid CAST expression: type must be 'CAST'`,
    );
  }

  const validProps = ['type', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: Unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }

  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: Missing required property 'args'`,
    );
  }

  if (
    obj.args === null || obj.args === undefined ||
    typeof obj.args !== 'object' || Array.isArray(obj.args)
  ) {
    throw new TypeError(
      customMessage ?? `Invalid CAST expression: args must be a plain object`,
    );
  }

  const args = obj.args as Record<string, unknown>;

  // Validate value
  if (!('value' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: Missing required property 'args.value'`,
    );
  }

  if (args.value === null || args.value === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: args.value cannot be null or undefined`,
    );
  }

  const valueType = typeof args.value;
  if (
    valueType !== 'string' &&
    valueType !== 'number' &&
    valueType !== 'bigint' &&
    valueType !== 'boolean' &&
    valueType !== 'object'
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: args.value must be a valid value, ColumnIdentifier, or Expression object`,
    );
  }

  if (valueType === 'string' && (args.value as string).startsWith('@')) {
    try {
      assertColumnIdentifier(args.value as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid CAST expression: args.value - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate targetType
  if (!('targetType' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: Missing required property 'args.targetType'`,
    );
  }

  if (typeof args.targetType !== 'string') {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: args.targetType must be a string`,
    );
  }

  const validTargetTypes = ['STRING', 'NUMBER', 'BIGINT', 'DATE', 'BOOLEAN'];
  if (!validTargetTypes.includes(args.targetType)) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: args.targetType must be one of ${
          validTargetTypes.join(', ')
        }`,
    );
  }

  const validArgProps = ['value', 'targetType'];
  const invalidArgProps = Object.keys(args).filter((key) =>
    !validArgProps.includes(key)
  );

  if (invalidArgProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid CAST expression: Unknown properties in args: ${
          invalidArgProps.join(', ')
        }`,
    );
  }
}

/**
 * Asserts that a value is a valid variadic mixed-type expression (ENCRYPT, DECRYPT, HASH).
 */
export function assertCryptoExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'ENCRYPT' | 'DECRYPT' | 'HASH';
  args: Array<string | number | bigint | Date | boolean | object>;
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid crypto expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  const validTypes = ['ENCRYPT', 'DECRYPT', 'HASH'];
  if (!validTypes.includes(obj.type as string)) {
    throw new TypeError(
      customMessage ??
        `Invalid crypto expression: type must be one of ${
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
        }`,
    );
  }

  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: Missing required property 'args'`,
    );
  }

  if (!Array.isArray(obj.args)) {
    throw new TypeError(
      customMessage ?? `Invalid ${obj.type} expression: args must be an array`,
    );
  }

  if (obj.args.length === 0) {
    throw new TypeError(
      customMessage ??
        `Invalid ${obj.type} expression: args cannot be empty (at least one argument required)`,
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

    if (
      argType !== 'string' &&
      argType !== 'number' &&
      argType !== 'bigint' &&
      argType !== 'boolean' &&
      argType !== 'object'
    ) {
      throw new TypeError(
        customMessage ??
          `Invalid ${obj.type} expression: args[${i}] must be a valid value, ColumnIdentifier, or Expression object`,
      );
    }

    if (argType === 'string' && (arg as string).startsWith('@')) {
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
