import type { Expressions, TimeUnit } from '../../types/mod.ts';

export const assertBaseExpression: (
  x: unknown,
  type?: string,
) => asserts x is Expressions = (
  x: unknown,
  type?: string,
): asserts x is Expressions => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid Expression definition: Expected object, got ${typeof x}`,
    );
  }
  if (!('type' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing 'type' property`,
    );
  }
  if (type && (x as Expressions).type !== type) {
    throw new TypeError(
      `Invalid Expression definition: Expected '${type}', got '${x.type}'`,
    );
  }
};

export const isBaseExpression = (
  x: unknown,
  type?: string,
): x is Expressions => {
  try {
    assertBaseExpression(x, type);
    return true;
  } catch {
    return false;
  }
};

export const validateTimeUnits: (
  x: unknown,
) => asserts x is TimeUnit = (
  x: unknown,
): asserts x is TimeUnit => {
  const validUnits = [
    'DAYS',
    'MONTHS',
    'YEARS',
    'HOURS',
    'MINUTES',
    'SECONDS',
  ];
  if (typeof x !== 'string' || !validUnits.includes(x)) {
    throw new TypeError(
      `Invalid time unit: Expected one of ${
        validUnits.join(
          ', ',
        )
      }, got ${typeof x === 'string' ? `'${x}'` : typeof x}`,
    );
  }
};
