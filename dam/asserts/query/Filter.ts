import type {
  BaseOperators,
  MathOperators,
  Operators,
  QueryFilters,
  StringOperators,
} from '../../types/mod.ts';
import { assertExpression } from './Expressions.ts';

// Assert operators
export const assertBaseOperators = <P>(x: unknown): x is BaseOperators<P> => {
  if (x === null || typeof x === 'undefined') return true;
  if (
    typeof x === 'string' || typeof x === 'bigint' ||
    typeof x === 'boolean' || typeof x === 'number' || x instanceof Date ||
    assertExpression(x)
  ) return true; // Value (eq operator)
  if (Array.isArray(x) && x.every((item) => typeof item === typeof x[0])) {
    return true; // Array ($in operator)
  }
  // Could be object
  if (typeof x === 'object') {
    // Ok this gets tricky, we need to only validate for $eq, $ne, $null, $in, $nin. Ignore others for now
    return Object.entries(x).filter(([key]) =>
      ['$eq', '$ne', '$null', '$in', '$nin'].includes(key)
    ).every(([key, val]) => {
      if (key === '$null') return typeof val === 'boolean';
      if (key === '$eq' || key === '$ne') {
        return typeof val === 'string' || typeof val === 'bigint' ||
          typeof val === 'boolean' || typeof val === 'number' ||
          val instanceof Date || assertExpression(x);
      }
      if (key === '$in' || key === '$nin') {
        return Array.isArray(val) &&
          val.every((v) =>
            typeof v === 'string' || typeof v === 'bigint' ||
            typeof v === 'boolean' || typeof v === 'number' ||
            v instanceof Date || assertExpression(x)
          );
      }
    });
  }
  return false;
};

export const assertMathOperators = <P extends number | bigint | Date>(
  x: unknown,
): x is MathOperators<P> => {
  return assertBaseOperators<P>(x) &&
    (typeof x === 'object' && x !== null &&
      Object.entries(x).filter(([key]) =>
        ['$lt', '$lte', '$gt', '$gte', '$between'].includes(key)
      ).every(([key, val]) => {
        if (key === '$between') {
          return Array.isArray(val) && val.length === 2 &&
            val.every((v) =>
              typeof v === 'number' || typeof v === 'bigint' ||
              v instanceof Date || assertExpression(x)
            );
        }
        return typeof val === 'number' || typeof val === 'bigint' ||
          val instanceof Date || assertExpression(x);
      }));
};

export const assertStringOperators = (x: unknown): x is StringOperators => {
  return assertBaseOperators<string>(x) &&
    (typeof x === 'object' && x !== null &&
      Object.entries(x).filter(([key]) =>
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
      ).every(([_key, val]) => {
        return typeof val === 'string';
      }));
};

export const assertOperators = <P>(x: unknown): x is Operators<P> => {
  return (assertStringOperators(x) || assertMathOperators(x));
};

// Assert Filters
export const assertQueryFilters = <R extends Record<string, unknown>>(
  x: unknown,
  columns?: string[],
): x is QueryFilters<R> => {
  if (typeof x !== 'object' || x === null) return false;
  return Object.entries(x).every(([key, val]) => {
    if (['$and', '$or'].includes(key)) {
      if (!Array.isArray(val)) return assertQueryFilters(val);
      return val.every((v) => assertQueryFilters(v));
    } else {
      // Check if col is valid
      return (columns !== undefined && columns.includes(key)) &&
        assertOperators(val);
    }
  });
};
