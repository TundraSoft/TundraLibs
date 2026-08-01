/**
 * Base helpers shared across the Expression validators.
 *
 * @module asserts/Expressions/Base
 */

import type { Expressions, TimeUnit } from '../../types/mod.ts';

/**
 * Asserts that a value is a non-null object with a `$$_expression` field,
 * and (when an expected type is supplied) that the field matches.
 *
 * The narrowed value retains an `Expressions` type so callers can index
 * `x.$$_expression`, `x.args`, etc. without further casts.
 */
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
  // Arrays pass the typeof===object check but lack `$$_expression` — they
  // fall through to the missing-discriminator check below.
  if (!('$$_expression' in x)) {
    throw new TypeError(
      `Invalid Expression definition: Missing '$$_expression' property`,
    );
  }
  if (type !== undefined && (x as Expressions).$$_expression !== type) {
    throw new TypeError(
      `Invalid Expression definition: Expected '${type}', got '${
        (x as Expressions).$$_expression
      }'`,
    );
  }
};

/** Type guard companion to {@link assertBaseExpression}. */
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

/** Valid TimeUnit values for date arithmetic. @internal */
const VALID_TIME_UNITS: readonly TimeUnit[] = [
  'DAYS',
  'MONTHS',
  'YEARS',
  'HOURS',
  'MINUTES',
  'SECONDS',
] as const;

/** Asserts that a value is a valid {@link TimeUnit}. */
export const validateTimeUnits: (x: unknown) => asserts x is TimeUnit = (
  x: unknown,
): asserts x is TimeUnit => {
  if (
    typeof x !== 'string' ||
    !VALID_TIME_UNITS.includes(x as TimeUnit)
  ) {
    const got = typeof x === 'string' ? `'${x}'` : typeof x;
    throw new TypeError(
      `Invalid time unit: Expected one of ${
        VALID_TIME_UNITS.join(', ')
      }, got ${got}`,
    );
  }
};
