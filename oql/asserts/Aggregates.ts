import type { Aggregates, ColumnIdentifier } from '../types/mod.ts';
import { assertColumnIdentifier } from './ColumnIdentifier.ts';

const Aggregates = [
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
  'STRING_AGG',
  'ARRAY_AGG',
  'JSON_ROW',
] as const;

const baseAggregateValidation: (x: unknown) => asserts x is Aggregates = (
  x: unknown,
): asserts x is Aggregates => {
  if (typeof x !== 'object' || x === null) {
    throw new TypeError(
      `Invalid Aggregate definition: Expected object, got ${typeof x}`,
    );
  }
  if (!('type' in x)) {
    throw new TypeError(
      `Invalid Aggregate definition: Missing 'type' property`,
    );
  }
  if (!Aggregates.includes((x as Aggregates).type)) {
    throw new TypeError(
      `Invalid Aggregate type: Expected one of ${
        Aggregates.join(
          ', ',
        )
      }, got '${x.type}'`,
    );
  }
};

const validateDistinct: (x: unknown) => asserts x is boolean = (
  x: unknown,
): asserts x is boolean => {
  if (typeof x !== 'boolean') {
    throw new TypeError(
      `Invalid Aggregate definition: Distinct flag must be a boolean, got ${typeof x}`,
    );
  }
};

const validateColumnForAggregate: (
  column: unknown,
  columnList?: string[],
) => void = (
  column: unknown,
  columnList?: string[],
): void => {
  if (Array.isArray(column)) {
    for (const col of column) {
      validateColumnForAggregate(col, columnList);
    }
  } else if (typeof column === 'object' && column !== null) {
    // If object validate for Expression
  } else if (typeof column === 'string') {
    // Ok it can either be a value or a column identifier
    if (column.startsWith('@')) {
      try {
        assertColumnIdentifier(column, columnList);
      } catch {
        throw new TypeError(
          `Invalid aggregate definition: Invalid column identifier ${column}`,
        );
      }
    }
  } else {
    throw new TypeError(
      `Invalid aggregate definition: Invalid column ${column}`,
    );
  }
};

export const assertCountAggregate: (
  x: unknown,
  columnList?: string[],
) => asserts x is Extract<Aggregates, { type: 'COUNT' }> = (
  x: unknown,
  columnList?: string[],
): asserts x is Extract<Aggregates, { type: 'COUNT' }> => {
  // Validate basic structure
  baseAggregateValidation(x);
  // Now narrow to COUNT type
  // For COUNT, column is optional
  if ('column' in x) {
    // Validate column
  }

  if ('distinct' in x && x.distinct !== undefined) {
    // Validate distinct
  }
};

export const isCountAggregate: (
  x: unknown,
  columnList?: string[],
) => x is Extract<Aggregates, { type: 'SUM' }> = (
  x: unknown,
  columnList?: string[],
): x is Extract<Aggregates, { type: 'SUM' }> => {
  try {
    assertCountAggregate(x, columnList);
    return true;
  } catch {
    return false;
  }
};

const validateMathAggregate: (
  type: 'SUM' | 'AVG' | 'MIN' | 'MAX',
  x: unknown,
  columnList?: string[],
) => void = (
  type: 'SUM' | 'AVG' | 'MIN' | 'MAX',
  x: unknown,
  columnList?: string[],
): void => {
  baseAggregateValidation(x);
  if (x.type !== type) {
    throw new TypeError(
      `Invalid Aggregate definition: Expected '${type}', got '${x.type}'`,
    );
  }
  // Validate column
  if (!('column' in x)) {
    throw new TypeError(
      `Invalid ${type} aggregate: Missing 'column' property`,
    );
  }
};
