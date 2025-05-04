import type {
  Aggregates,
  AvgAggregate,
  BaseAggregate,
  CountAggregate,
  CountDistinctAggregate,
  DistinctAggregate,
  JSONRowAggregate,
  MaxAggregate,
  MinAggregate,
  SumAggregate,
} from '../types/mod.ts';
import { assertColumnIdentifier } from './Column.ts';
import { assertEntityName } from './EntityName.ts';
import { assertExpression } from './Expression.ts';

const aggregates = [
  'SUM',
  'AVG',
  'COUNT',
  'COUNT_DISTINCT',
  'DISTINCT',
  'MAX',
  'MIN',
  'JSON_ROW',
];

/**
 * Asserts that the input is a valid base aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid base aggregate
 */
const assertBaseAggregate: (x: unknown) => asserts x is BaseAggregate = (
  x: unknown,
) => {
  if (x === null || typeof x !== 'object') {
    throw new TypeError('Aggregate must be an object with $aggr property');
  }
  if (!('$aggr' in x) || typeof x.$aggr !== 'string') {
    throw new TypeError(
      'Expected an object with $aggr property of type string',
    );
  }
  if (!aggregates.includes(x.$aggr)) {
    throw new TypeError(
      `Expected $aggr to be one of ${
        aggregates.join(', ')
      }, but got ${x.$aggr}`,
    );
  }
};

/**
 * Asserts that the input is a valid SUM aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid SUM aggregate
 */
export const assertSumAggregate: (x: unknown) => asserts x is SumAggregate = (
  x: unknown,
) => {
  assertBaseAggregate(x);
  if (x.$aggr !== 'SUM') {
    throw new TypeError(`Expected $aggr to be 'SUM', but got ${x.$aggr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(
      `Expected $args property to be defined in SUM aggregate`,
    );
  }

  try {
    assertColumnIdentifier(x.$args);
  } catch {
    throw new TypeError(
      `Expected $args property to be a column identifier in SUM aggregate`,
    );
  }
};

/**
 * Asserts that the input is a valid AVG aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid AVG aggregate
 */
export const assertAvgAggregate: (x: unknown) => asserts x is AvgAggregate = (
  x: unknown,
) => {
  assertBaseAggregate(x);
  if (x.$aggr !== 'AVG') {
    throw new TypeError(`Expected $aggr to be 'AVG', but got ${x.$aggr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(
      `Expected $args property to be defined in AVG aggregate`,
    );
  }

  try {
    assertColumnIdentifier(x.$args);
  } catch {
    throw new TypeError(
      `Expected $args property to be a column identifier in AVG aggregate`,
    );
  }
};

/**
 * Asserts that the input is a valid MIN aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid MIN aggregate
 */
export const assertMinAggregate: (x: unknown) => asserts x is MinAggregate = (
  x: unknown,
) => {
  assertBaseAggregate(x);
  if (x.$aggr !== 'MIN') {
    throw new TypeError(`Expected $aggr to be 'MIN', but got ${x.$aggr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(
      `Expected $args property to be defined in MIN aggregate`,
    );
  }

  try {
    assertColumnIdentifier(x.$args);
  } catch {
    throw new TypeError(
      `Expected $args property to be a column identifier in MIN aggregate`,
    );
  }
};

/**
 * Asserts that the input is a valid MAX aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid MAX aggregate
 */
export const assertMaxAggregate: (x: unknown) => asserts x is MaxAggregate = (
  x: unknown,
) => {
  assertBaseAggregate(x);
  if (x.$aggr !== 'MAX') {
    throw new TypeError(`Expected $aggr to be 'MAX', but got ${x.$aggr}`);
  }
  if (!('$args' in x)) {
    throw new TypeError(
      `Expected $args property to be defined in MAX aggregate`,
    );
  }

  try {
    assertColumnIdentifier(x.$args);
  } catch {
    throw new TypeError(
      `Expected $args property to be a column identifier in MAX aggregate`,
    );
  }
};

/**
 * Asserts that the input is a valid COUNT aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid COUNT aggregate
 */
export const assertCountAggregate: (x: unknown) => asserts x is CountAggregate =
  (
    x: unknown,
  ) => {
    assertBaseAggregate(x);
    if (x.$aggr !== 'COUNT') {
      throw new TypeError(`Expected $aggr to be 'COUNT', but got ${x.$aggr}`);
    }
    if (!('$args' in x) || (x.$args !== '1' && x.$args !== '*')) {
      throw new TypeError(
        `Expected $args property to be "1" or "*" for COUNT aggregate`,
      );
    }
  };

/**
 * Asserts that the input is a valid COUNT_DISTINCT aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid COUNT_DISTINCT aggregate
 */
export const assertCountDistinctAggregate: (
  x: unknown,
) => asserts x is CountDistinctAggregate = (x: unknown) => {
  assertBaseAggregate(x);
  if (x.$aggr !== 'COUNT_DISTINCT') {
    throw new TypeError(
      `Expected $aggr to be 'COUNT_DISTINCT', but got ${x.$aggr}`,
    );
  }
  if (!('$args' in x) || !Array.isArray(x.$args)) {
    throw new TypeError(
      `Expected $args property to be an array for COUNT_DISTINCT aggregate`,
    );
  }
  for (const arg of x.$args) {
    try {
      assertColumnIdentifier(arg);
    } catch {
      throw new TypeError(
        `Expected $args property to be an array of column identifiers for COUNT_DISTINCT aggregate`,
      );
    }
  }
};

/**
 * Asserts that the input is a valid DISTINCT aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid DISTINCT aggregate
 */
export const assertDistinctAggregate: (
  x: unknown,
) => asserts x is DistinctAggregate = (x: unknown) => {
  assertBaseAggregate(x);
  if (x.$aggr !== 'DISTINCT') {
    throw new TypeError(`Expected $aggr to be 'DISTINCT', but got ${x.$aggr}`);
  }
  if (!('$args' in x) || !Array.isArray(x.$args)) {
    throw new TypeError(
      `Expected $args property to be an array for DISTINCT aggregate`,
    );
  }
  for (const arg of x.$args) {
    try {
      assertColumnIdentifier(arg);
    } catch {
      throw new TypeError(
        `Expected $args property to be an array of column identifiers for DISTINCT aggregate`,
      );
    }
  }
};

/**
 * Asserts that the input is a valid JSON_ROW aggregate
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid JSON_ROW aggregate
 */
export const assertJSONRowAggregate: (
  x: unknown,
) => asserts x is JSONRowAggregate = (x: unknown) => {
  assertBaseAggregate(x);
  if (x.$aggr !== 'JSON_ROW') {
    throw new TypeError(`Expected $aggr to be 'JSON_ROW', but got ${x.$aggr}`);
  }
  if (!('$args' in x) || typeof x.$args !== 'object' || x.$args === null) {
    throw new TypeError(
      `Expected $args property to be a JSON Object for JSON_ROW aggregate`,
    );
  }

  Object.entries(x.$args).forEach(([key, value]) => {
    try {
      assertEntityName(key);
    } catch {
      throw new TypeError(
        `Expected key "${key}" in $args property to be a valid entity name for JSON_ROW aggregate`,
      );
    }

    // Check if value is either a column identifier, aggregate, or expression
    try {
      assertColumnIdentifier(value);
    } catch {
      try {
        assertAggregate(value);
      } catch {
        try {
          assertExpression(value);
        } catch {
          throw new TypeError(
            `Expected value for key "${key}" in $args property to be a column identifier, aggregate, or expression for JSON_ROW aggregate`,
          );
        }
      }
    }
  });
};

/**
 * Asserts that the input is a valid aggregate of any type
 * @param x - The value to check
 * @throws {TypeError} If the value is not a valid aggregate
 */
export const assertAggregate: (x: unknown) => asserts x is Aggregates = (
  x: unknown,
) => {
  assertBaseAggregate(x);

  switch (x.$aggr) {
    case 'SUM':
      assertSumAggregate(x);
      break;
    case 'AVG':
      assertAvgAggregate(x);
      break;
    case 'MIN':
      assertMinAggregate(x);
      break;
    case 'MAX':
      assertMaxAggregate(x);
      break;
    case 'COUNT':
      assertCountAggregate(x);
      break;
    case 'COUNT_DISTINCT':
      assertCountDistinctAggregate(x);
      break;
    case 'DISTINCT':
      assertDistinctAggregate(x);
      break;
    case 'JSON_ROW':
      assertJSONRowAggregate(x);
      break;
    default:
      throw new TypeError(`Unknown aggregate type: ${x.$aggr}`);
  }
};
