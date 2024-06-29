import type {
  BaseDMLQueryBuilder,
  BaseQueryBuilder,
  // ColumnIdentifier,
  CountQueryBuilder,
  DeleteQueryBuilder,
  InsertQueryBuilder,
  SelectQueryBuilder,
  UpdateQueryBuilder,
} from '../../types/mod.ts';
import { assertQueryFilters } from './Filter.ts';
import { assertExpression } from './Expressions.ts';

export const assertBaseQueryBuilder = (x: unknown): x is BaseQueryBuilder => {
  return (typeof x === 'object' && x !== null && 'type' in x && 'source' in x &&
    typeof x.source === 'string' && x.source.length > 0 &&
    (!('schema' in x) ||
      (typeof x.schema === 'string' && x.schema.length > 0)));
};

export const assertBaseDMLQueryBuilder = (
  x: unknown,
): x is BaseDMLQueryBuilder => {
  return assertBaseQueryBuilder(x) &&
    (['INSERT', 'UPDATE', 'DELETE', 'SELECT', 'COUNT'].includes(x.type) && // Check type
      'columns' in x && Array.isArray(x.columns) && x.columns.length > 0 && // Column definition
      (!('expressions' in x) ||
        (typeof x.expressions === 'object' && x.expressions !== null && (
          Object.entries(x.expressions).every(([col, expr]) =>
            !(x.columns as Array<string>).includes(col) &&
            assertExpression(expr)
          )
        )))); // Expression definition
};

export const assertInsertQueryBuilder = (
  x: unknown,
): x is InsertQueryBuilder => {
  return assertBaseDMLQueryBuilder(x) && x.type === 'INSERT' && // Basic type check
    'values' in x && // Value must be array of json
    Array.isArray(x.values) && // Array
    x.values.every((row) =>
      typeof row === 'object' && row !== null &&
      Object.entries(row).every(([col, _val]) =>
        typeof col === 'string' && x.columns.includes(col)
      )
    ); // Validate row;
};

export const assertUpdateQueryBuilder = (
  x: unknown,
): x is UpdateQueryBuilder => {
  return assertBaseDMLQueryBuilder(x) && x.type === 'UPDATE' && // Basic type check
    'values' in x && // Value must be object
    typeof x.values === 'object' && x.values !== null &&
    Object.entries(x.values).every(([col, _val]) => x.columns.includes(col)) && // Values
    (!('where' in x) ||
      (typeof x.where === 'object' && x.where !== null &&
        assertQueryFilters(x.where, [
          ...x.columns,
          ...Object.keys(x.expressions || {}),
        ]))); // Where
};

export const assertDeleteQueryBuilder = (
  x: unknown,
): x is DeleteQueryBuilder => {
  return assertBaseDMLQueryBuilder(x) && x.type === 'DELETE' && // Basic type check
    (!('where' in x) ||
      (typeof x.where === 'object' && x.where !== null &&
        assertQueryFilters(x.where, [
          ...x.columns,
          ...Object.keys(x.expressions || {}),
        ]))); // Where
};

export const assertCountQueryBuilder = (x: unknown): x is CountQueryBuilder => {
  return assertBaseDMLQueryBuilder(x) && x.type === 'COUNT' && // Basic type check
    (!('where' in x) ||
      (typeof x.where === 'object' && x.where !== null &&
        assertQueryFilters(x.where))); // Where
};

export const assertSelectQueryBuilder = (
  x: unknown,
): x is SelectQueryBuilder => {
  return assertBaseDMLQueryBuilder(x) && x.type === 'SELECT' && // Basic type check
    (!('where' in x) ||
      (typeof x.where === 'object' && x.where !== null &&
        assertQueryFilters(x.where))) && // Where
    (!('limit' in x) || (typeof x.limit === 'number' && x.limit > 0)) && // Limit
    (!('offset' in x) || (typeof x.offset === 'number' && x.offset >= 0)) && // Offset
    (!('order' in x) ||
      (typeof x.order === 'object' && x.order !== null &&
        Object.entries(x.order).every(([col, order]) =>
          x.columns.includes(col) && ['ASC', 'DESC'].includes(order)
        ))) && // Order
    (!('groupBy' in x) ||
      (Array.isArray(x.groupBy) &&
        x.groupBy.every((col) => x.columns.includes(col)))); // GroupBy
};
