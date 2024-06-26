import type {
  BaseExpression,
  DateExpressions,
  Expressions,
  JSONExpressions,
  NumberExpressions,
  StringExpressions,
} from '../../types/mod.ts';

import { assertColumnIdentifier } from './ColumnIdentifier.ts';

const assertBaseExpression = (x: unknown): x is BaseExpression => {
  return typeof x === 'object' && x !== null && '$expr' in x;
};

export const assertDateExpression = (
  x: unknown,
  columns?: string[],
): x is DateExpressions => {
  return assertBaseExpression(x) &&
    [
      'NOW',
      'CURRENT_DATE',
      'CURRENT_TIME',
      'CURRENT_TIMESTAMP',
      'DATE_ADD',
      'DATE',
      'DATETIME',
    ]
      .includes(x.$expr) &&
    (x.$expr === 'DATE_ADD'
      ? Array.isArray(x.$args) && // Handle Date Add
        (x.$args.length === 3 &&
            ['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'].includes(
              x.$args[0],
            ) && // Check if it is valid date part
            (x.$args[1] instanceof Date ||
              assertDateExpression(x.$args[1], columns) ||
              assertColumnIdentifier(x.$args[1], columns)) && // Check if it is valid date expression
            typeof x.$args[2] === 'number' ||
          assertColumnIdentifier(x.$args[2], columns)) // Check if it is valid number
      : true);
};

export const assertNumberExpression = (
  x: unknown,
  columns?: string[],
): x is NumberExpressions => {
  return assertBaseExpression(x) &&
    [
      'ADD',
      'SUB',
      'MUL',
      'DIV',
      'MOD',
      'ABS',
      'CEIL',
      'FLOOR',
      'DATE_DIFF',
      'LENGTH',
    ].includes(x.$expr) &&
    (
      (['ADD', 'SUB', 'MUL', 'DIV', 'MOD'].includes(x.$expr) &&
        Array.isArray(x.$args) && x.$args.length > 1 &&
        (x.$args.every((a) =>
          typeof a === 'number' || typeof a === 'bigint' ||
          assertColumnIdentifier(a, columns) ||
          assertNumberExpression(a, columns)
        ))) || // ADD, SUB, MUL, DIV, MOD
      (['ABS', 'CEIL', 'FLOOR'].includes(x.$expr) &&
        (typeof x.$args === 'number' || typeof x.$args === 'bigint' ||
          assertColumnIdentifier(x.$args, columns) ||
          assertNumberExpression(x.$args, columns))) || // ABS, CEIL, FLOOR
      (x.$expr === 'LENGTH' &&
        (typeof x.$args === 'string' ||
          assertColumnIdentifier(x.$args, columns) ||
          assertStringExpression(x.$args, columns))) || // LENGTH
      (x.$expr === 'DATE_DIFF' && Array.isArray(x.$args) &&
        x.$args.length === 3 &&
        (['YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND'].includes(
          x.$args[0],
        ) &&
          (x.$args[1] instanceof Date ||
            assertDateExpression(x.$args[1], columns) ||
            assertColumnIdentifier(x.$args[1], columns)) &&
          (x.$args[2] instanceof Date ||
            assertDateExpression(x.$args[2], columns) ||
            assertColumnIdentifier(x.$args[2], columns)))) // Check if it is valid date part)) // DATE_DIFF
    ); // End
};

export const assertStringExpression = (
  x: unknown,
  columns?: string[],
): x is StringExpressions => {
  return assertBaseExpression(x) &&
    ['UUID', 'CONCAT', 'LOWER', 'UPPER', 'TRIM', 'REPLACE', 'SUBSTRING']
      .includes(x.$expr) &&
    (
      (x.$expr === 'UUID' && !('$args' in x)) || // UUID
      (['LOWER', 'UPPER', 'TRIM'].includes(x.$expr) &&
        (typeof x.$args === 'string' ||
          assertColumnIdentifier(x.$args, columns))) || // LOWER, UPPER, TRIM, LENGTH
      (x.$expr === 'CONCAT' && Array.isArray(x.$args) &&
        x.$args.every((arg) =>
          typeof arg === 'string' || assertColumnIdentifier(arg, columns)
        )) || // CONCAT
      (x.$expr === 'REPLACE' && Array.isArray(x.$args) &&
        x.$args.length === 3 &&
        x.$args.every((arg) =>
          typeof arg === 'string' || assertColumnIdentifier(arg, columns)
        )) || // REPLACE
      (x.$expr === 'SUBSTRING' && Array.isArray(x.$args) &&
        x.$args.length === 3 &&
        (typeof x.$args[0] === 'string' ||
          assertColumnIdentifier(x.$args[0], columns)) &&
        (typeof x.$args[1] === 'number' ||
          assertNumberExpression(x.$args[1], columns)) &&
        (typeof x.$args[2] === 'number' ||
          assertNumberExpression(x.$args[2], columns))) // SUBSTRING
    ); // End
};

export const assertJSONExpression = (
  x: unknown,
  columns?: string[],
): x is JSONExpressions => {
  return assertBaseExpression(x) &&
    ['JSON_VALUE'].includes(x.$expr) &&
    typeof x.$args && Array.isArray(x.$args) && x.$args.length === 2 &&
    (typeof x.$args[0] === 'object' ||
      assertColumnIdentifier(x.$args[0], columns) &&
        (Array.isArray(x.$args[1])));
};

export const assertExpression = (
  x: unknown,
  columns?: string[],
): x is Expressions => {
  return assertDateExpression(x, columns) ||
    assertNumberExpression(x, columns) ||
    assertStringExpression(x, columns) || assertJSONExpression(x, columns);
};
