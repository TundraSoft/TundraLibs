import { assertColumnIdentifier } from '../ColumnIdentifier.ts';

const VALID_TIME_UNITS = [
  'DAYS',
  'MONTHS',
  'YEARS',
  'HOURS',
  'MINUTES',
  'SECONDS',
];

/**
 * Asserts that a value is a valid DATE_ADD expression.
 */
export function assertDateAddExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'DATE_ADD';
  unit: string;
  args: {
    date: string | Date | object;
    amount: string | number | object;
  };
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid DATE_ADD expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'DATE_ADD') {
    throw new TypeError(
      customMessage ?? `Invalid DATE_ADD expression: type must be 'DATE_ADD'`,
    );
  }

  const validProps = ['type', 'unit', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: Unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }

  // Validate unit
  if (!('unit' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: Missing required property 'unit'`,
    );
  }

  if (typeof obj.unit !== 'string') {
    throw new TypeError(
      customMessage ?? `Invalid DATE_ADD expression: unit must be a string`,
    );
  }

  if (!VALID_TIME_UNITS.includes(obj.unit)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: unit must be one of ${
          VALID_TIME_UNITS.join(', ')
        }`,
    );
  }

  // Validate args
  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: Missing required property 'args'`,
    );
  }

  if (
    obj.args === null || obj.args === undefined ||
    typeof obj.args !== 'object' || Array.isArray(obj.args)
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: args must be a plain object`,
    );
  }

  const args = obj.args as Record<string, unknown>;

  // Validate date
  if (!('date' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: Missing required property 'args.date'`,
    );
  }

  if (args.date === null || args.date === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: args.date cannot be null or undefined`,
    );
  }

  const dateType = typeof args.date;
  if (
    dateType !== 'string' &&
    dateType !== 'object' &&
    !(args.date instanceof Date)
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: args.date must be a Date, ColumnIdentifier, or Expression object`,
    );
  }

  if (dateType === 'string' && (args.date as string).startsWith('@')) {
    try {
      assertColumnIdentifier(args.date as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid DATE_ADD expression: args.date - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  // Validate amount
  if (!('amount' in args)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: Missing required property 'args.amount'`,
    );
  }

  if (args.amount === null || args.amount === undefined) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: args.amount cannot be null or undefined`,
    );
  }

  const amountType = typeof args.amount;
  if (
    amountType !== 'number' && amountType !== 'string' &&
    amountType !== 'object'
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: args.amount must be a number, ColumnIdentifier, or Expression object`,
    );
  }

  if (amountType === 'string' && (args.amount as string).startsWith('@')) {
    try {
      assertColumnIdentifier(args.amount as string);
    } catch (error) {
      throw new TypeError(
        customMessage ??
          `Invalid DATE_ADD expression: args.amount - ${
            error instanceof Error ? error.message : String(error)
          }`,
      );
    }
  }

  const validArgProps = ['date', 'amount'];
  const invalidArgProps = Object.keys(args).filter((key) =>
    !validArgProps.includes(key)
  );

  if (invalidArgProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_ADD expression: Unknown properties in args: ${
          invalidArgProps.join(', ')
        }`,
    );
  }
}

/**
 * Asserts that a value is a valid DATE_DIFF expression.
 */
export function assertDateDiffExpression(
  value: unknown,
  customMessage?: string,
): asserts value is {
  type: 'DATE_DIFF';
  unit: string;
  args: {
    from: string | Date | object;
    to: string | Date | object;
  };
} {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError(
      customMessage ?? `Invalid DATE_DIFF expression: Expected an object`,
    );
  }

  const obj = value as Record<string, unknown>;

  if (obj.type !== 'DATE_DIFF') {
    throw new TypeError(
      customMessage ?? `Invalid DATE_DIFF expression: type must be 'DATE_DIFF'`,
    );
  }

  const validProps = ['type', 'unit', 'args'];
  const invalidProps = Object.keys(obj).filter((key) =>
    !validProps.includes(key)
  );

  if (invalidProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_DIFF expression: Unknown properties: ${
          invalidProps.join(', ')
        }`,
    );
  }

  // Validate unit
  if (!('unit' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_DIFF expression: Missing required property 'unit'`,
    );
  }

  if (typeof obj.unit !== 'string') {
    throw new TypeError(
      customMessage ?? `Invalid DATE_DIFF expression: unit must be a string`,
    );
  }

  if (!VALID_TIME_UNITS.includes(obj.unit)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_DIFF expression: unit must be one of ${
          VALID_TIME_UNITS.join(', ')
        }`,
    );
  }

  // Validate args
  if (!('args' in obj)) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_DIFF expression: Missing required property 'args'`,
    );
  }

  if (
    obj.args === null || obj.args === undefined ||
    typeof obj.args !== 'object' || Array.isArray(obj.args)
  ) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_DIFF expression: args must be a plain object`,
    );
  }

  const args = obj.args as Record<string, unknown>;

  // Validate from and to
  for (const prop of ['from', 'to']) {
    if (!(prop in args)) {
      throw new TypeError(
        customMessage ??
          `Invalid DATE_DIFF expression: Missing required property 'args.${prop}'`,
      );
    }

    if (args[prop] === null || args[prop] === undefined) {
      throw new TypeError(
        customMessage ??
          `Invalid DATE_DIFF expression: args.${prop} cannot be null or undefined`,
      );
    }

    const propType = typeof args[prop];
    if (
      propType !== 'string' &&
      propType !== 'object' &&
      !(args[prop] instanceof Date)
    ) {
      throw new TypeError(
        customMessage ??
          `Invalid DATE_DIFF expression: args.${prop} must be a Date, ColumnIdentifier, or Expression object`,
      );
    }

    if (propType === 'string' && (args[prop] as string).startsWith('@')) {
      try {
        assertColumnIdentifier(args[prop] as string);
      } catch (error) {
        throw new TypeError(
          customMessage ??
            `Invalid DATE_DIFF expression: args.${prop} - ${
              error instanceof Error ? error.message : String(error)
            }`,
        );
      }
    }
  }

  const validArgProps = ['from', 'to'];
  const invalidArgProps = Object.keys(args).filter((key) =>
    !validArgProps.includes(key)
  );

  if (invalidArgProps.length > 0) {
    throw new TypeError(
      customMessage ??
        `Invalid DATE_DIFF expression: Unknown properties in args: ${
          invalidArgProps.join(', ')
        }`,
    );
  }
}
