import type { Filters, QueryFilters } from '../types/mod.ts';
import { assertExpression } from './Expression.ts';

// Helper type guards
const isScalarValue = (
  x: unknown,
): x is string | number | bigint | boolean | Date => {
  return typeof x === 'string' ||
    typeof x === 'number' ||
    typeof x === 'bigint' ||
    typeof x === 'boolean' ||
    x instanceof Date;
};

// List of valid filter operators
const FILTER_OPERATORS = [
  '$eq',
  '$ne',
  '$null',
  '$in',
  '$nin',
  '$like',
  '$ilike',
  '$nlike',
  '$nilike',
  '$contains',
  '$ncontains',
  '$startsWith',
  '$nstartsWith',
  '$endsWith',
  '$nendsWith',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$between',
];

// String-only operators
const STRING_OPERATORS = [
  '$like',
  '$ilike',
  '$nlike',
  '$nilike',
  '$contains',
  '$ncontains',
  '$startsWith',
  '$nstartsWith',
  '$endsWith',
  '$nendsWith',
];

// Comparison operators (for number/bigint/date)
const COMPARISON_OPERATORS = [
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$between',
];

/**
 * Asserts that the input is a valid $eq filter
 * @param value - The value to check
 */
export const assertEqFilter = (value: unknown): void => {
  // $eq accepts any scalar value
  if (value === undefined) {
    throw new TypeError('$eq filter value cannot be undefined');
  }
};

/**
 * Asserts that the input is a valid $ne filter
 * @param value - The value to check
 */
export const assertNeFilter = (value: unknown): void => {
  // $ne accepts any scalar value
  if (value === undefined) {
    throw new TypeError('$ne filter value cannot be undefined');
  }
};

/**
 * Asserts that the input is a valid $null filter
 * @param value - The value to check
 */
export const assertNullFilter = (value: unknown): void => {
  if (typeof value !== 'boolean') {
    throw new TypeError(`$null filter must be a boolean, got ${typeof value}`);
  }
};

/**
 * Asserts that the input is a valid $in filter
 * @param value - The value to check
 */
export const assertInFilter = (value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new TypeError(`$in filter must be an array, got ${typeof value}`);
  }
};

/**
 * Asserts that the input is a valid $nin filter
 * @param value - The value to check
 */
export const assertNinFilter = (value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new TypeError(`$nin filter must be an array, got ${typeof value}`);
  }
};

/**
 * Asserts that the input is a valid string pattern filter
 * @param value - The value to check
 * @param operator - The operator name
 */
export const assertStringPatternFilter = (
  value: unknown,
  operator: string,
): void => {
  if (typeof value !== 'string') {
    throw new TypeError(
      `${operator} filter must be a string, got ${typeof value}`,
    );
  }
};

/**
 * Asserts that the input is a valid comparison filter
 * @param value - The value to check
 * @param operator - The operator name
 */
export const assertComparisonFilter = (
  value: unknown,
  operator: string,
): void => {
  // Just verifying it's not undefined for basic operators
  if (value === undefined) {
    throw new TypeError(`${operator} filter value cannot be undefined`);
  }
};

/**
 * Asserts that the input is a valid $between filter
 * @param value - The value to check
 */
export const assertBetweenFilter = (value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new TypeError(
      `$between filter must be an array, got ${typeof value}`,
    );
  }

  if (value.length !== 2) {
    throw new TypeError(
      `$between filter must be an array with exactly 2 elements, got ${value.length}`,
    );
  }
  // Must be a number, bigint, or date
  value.forEach((item) => {
    if (
      typeof item !== 'number' &&
      typeof item !== 'bigint' &&
      !(item instanceof Date)
    ) {
      throw new TypeError(
        `$between filter elements must be number, bigint, or date, got ${typeof item}`,
      );
    }
  });
};

/**
 * Asserts that the input is a valid logical OR filter
 * @param value - The value to check
 */
export const assertOrFilter = (value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new TypeError(`$or filter must be an array, got ${typeof value}`);
  }

  for (const item of value) {
    assertQueryFilters(item);
  }
};

/**
 * Asserts that the input is a valid logical AND filter
 * @param value - The value to check
 */
export const assertAndFilter = (value: unknown): void => {
  if (!Array.isArray(value)) {
    throw new TypeError(`$and filter must be an array, got ${typeof value}`);
  }

  for (const item of value) {
    assertQueryFilters(item);
  }
};

/**
 * The main entry point for validating filters
 * @param x - The filter to validate
 */
export const assertFilter: (x: unknown) => asserts x is Filters = (
  x: unknown,
): asserts x is Filters => {
  // Case 1: null is a valid filter (means IS NULL)
  if (x === null) return;

  // Case 2: Direct scalar value (equals filter)
  if (isScalarValue(x)) return;

  // Case 3: Array with single value (shorthand for $in)
  if (Array.isArray(x)) {
    if (x.length !== 1) {
      throw new TypeError(
        'Array shorthand for $in filter must have exactly one element',
      );
    }
    return;
  }

  // Case 4: Expression
  try {
    assertExpression(x);
    return;
  } catch {
    // Not an expression, continue checking
  }

  // Case 5: Filter object with operators
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Filter must be a scalar value, array with one element, expression, or filter object, got ${typeof x}`,
    );
  }

  const filter = x as Record<string, unknown>;

  // Check each property is a valid operator
  for (const [key, value] of Object.entries(filter)) {
    // Special handling for logical operators
    if (key === '$or') {
      assertOrFilter(value);
      continue;
    }

    if (key === '$and') {
      assertAndFilter(value);
      continue;
    }

    // Check that the operator is valid
    if (!FILTER_OPERATORS.includes(key)) {
      throw new TypeError(`Unknown filter operator: ${key}`);
    }

    // Validate each operator type
    switch (key) {
      case '$eq':
        assertEqFilter(value);
        break;
      case '$ne':
        assertNeFilter(value);
        break;
      case '$null':
        assertNullFilter(value);
        break;
      case '$in':
        assertInFilter(value);
        break;
      case '$nin':
        assertNinFilter(value);
        break;
      case '$between':
        assertBetweenFilter(value);
        break;
      default:
        // String operators
        if (STRING_OPERATORS.includes(key)) {
          assertStringPatternFilter(value, key);
        } // Comparison operators
        else if (COMPARISON_OPERATORS.includes(key)) {
          assertComparisonFilter(value, key);
        }
    }
  }
};

/**
 * Validates a complex query filter with fields and logical operators
 * @param x - The query filter to validate
 */
export const assertQueryFilters: (x: unknown) => asserts x is QueryFilters = (
  x: unknown,
): asserts x is QueryFilters => {
  if (x === null || typeof x !== 'object') {
    throw new TypeError(`Query filter must be an object, got ${typeof x}`);
  }

  const filter = x as Record<string, unknown>;

  // Check logical operators
  if ('$or' in filter) {
    assertOrFilter(filter.$or);
  }

  if ('$and' in filter) {
    assertAndFilter(filter.$and);
  }

  // All other properties should be valid filters
  for (const [key, value] of Object.entries(filter)) {
    if (key !== '$or' && key !== '$and') {
      assertFilter(value);
    }
  }
};
