import type {
  BaseOperators,
  MathOperators,
  Operators,
  QueryFilters,
  StringOperators,
} from '../../types/mod.ts';
import { assertColumnIdentifier } from './ColumnIdentifier.ts';
import {
  assertDateExpression,
  assertExpression,
  assertNumberExpression,
  assertStringExpression,
} from './Expressions.ts';

export const assertBaseOperators = <P>(
  x: unknown,
  collumns?: string[],
): x is BaseOperators<P> => {
  // Straight up value
  if (
    typeof x === 'bigint' || typeof x === 'number' || typeof x === 'string' ||
    typeof x === 'boolean' || x instanceof Date || x === null ||
    assertExpression(x, collumns)
  ) {
    return true;
  }
  // In operator shorthand
  if (Array.isArray(x)) {
    return x.every((v) =>
      typeof v === 'string' || typeof v === 'bigint' ||
      typeof v === 'boolean' || typeof v === 'number' ||
      v instanceof Date || assertExpression(v, collumns)
    );
  }
  // Its an object and has $eq, $ne, $null, $in, $nin
  if (typeof x === 'object' && x !== null) {
    // Loop through each key
    return Object.entries(x).every(([key, value]) => {
      if (['$eq', '$ne'].includes(key)) {
        return typeof value === 'string' || typeof value === 'bigint' ||
          typeof value === 'boolean' || typeof value === 'number' ||
          value instanceof Date || assertExpression(value, collumns);
      }
      if (['$null'].includes(key)) {
        return typeof value === 'boolean';
      }
      if (['$in', '$nin'].includes(key)) {
        return Array.isArray(value) &&
          value.every((v) =>
            typeof v === 'string' || typeof v === 'bigint' ||
            typeof v === 'boolean' || typeof v === 'number' ||
            v instanceof Date || assertExpression(v, collumns)
          );
      }
      // It can also contain $or and $and, if that is the case we have to check each item
    });
  }
  // No match till here, so return false
  return false;
};

export const assertMathOperators = <P extends number | bigint | Date>(
  x: unknown,
  collumns?: string[],
): x is MathOperators<P> => {
  return assertBaseOperators<P>(x, collumns) ||
    (typeof x === 'object' && x !== null) &&
      Object.entries(x).every(([key, value]) => {
        if (['$gt', '$gte', '$lt', '$lte'].includes(key)) {
          return typeof value === 'bigint' || typeof value === 'number' ||
            value instanceof Date || assertDateExpression(value, collumns) ||
            assertNumberExpression(value, collumns) ||
            assertColumnIdentifier(value, collumns);
        }
        if (['$between'].includes(key)) {
          return Array.isArray(value) && value.length === 2 &&
            value.every((v) =>
              typeof v === 'bigint' || typeof v === 'number' ||
              v instanceof Date || assertDateExpression(v, collumns) ||
              assertNumberExpression(v, collumns) ||
              assertColumnIdentifier(v, collumns)
            );
        }
      });
};

export const assertStringOperators = (
  x: unknown,
  collumns?: string[],
): x is StringOperators => {
  return assertBaseOperators<string>(x, collumns) ||
    (typeof x === 'object' && x !== null) &&
      Object.entries(x).every(([key, value]) => {
        if (
          [
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
          ].includes(key)
        ) {
          return typeof value === 'string' ||
            assertStringExpression(value, collumns) ||
            assertColumnIdentifier(value, collumns);
        }
      });
};

export const assertOperators = <P>(
  x: unknown,
  collumns?: string[],
): x is Operators<P> => {
  return assertBaseOperators<P>(x, collumns) ||
    assertMathOperators(x, collumns) || assertStringOperators(x, collumns);
};

export const assertQueryFilters = <R extends Record<string, unknown>>(
  x: unknown,
  columns?: string[],
): x is QueryFilters<R> => {
  return typeof x === 'object' && x !== null &&
    Object.entries(x).every(([key, value]) => {
      if (['$and', '$or'].includes(key)) {
        return (Array.isArray(value) &&
          value.every((v) => assertQueryFilters(v, columns))) ||
          assertQueryFilters(value, columns);
      }
      // This will be column: Operator
      return (typeof key === 'string' &&
        (columns === undefined ? true : columns?.includes(key)) &&
        assertOperators(value, columns)); // || assertQueryFilters(value, columns);
    });
};
