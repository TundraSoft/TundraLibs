import { UnArray } from '@tundralibs/utils';
import type { ColumnIdentifier } from './column/mod.ts';
import type { Expressions } from './Expressions.ts';

/**
 * All supported aggregate function types that can be used in database queries.
 * These represent SQL aggregate functions like SUM, AVG, COUNT, etc.
 */
export type Aggregate =
  | 'SUM'
  | 'AVG'
  | 'COUNT'
  | 'COUNT_DISTINCT'
  | 'DISTINCT'
  | 'MAX'
  | 'MIN'
  | 'JSON_ROW';

/**
 * Base interface for all aggregate types
 * @template T - The specific aggregate function type
 */
export type BaseAggregate<T extends Aggregate = Aggregate> = {
  $aggr: T;
};

/**
 * SUM aggregate function.
 * Calculates the sum of all values in a column.
 */
export type SumAggregate = BaseAggregate<'SUM'> & {
  $args: ColumnIdentifier;
};

/**
 * AVG aggregate function.
 * Calculates the average (mean) of all values in a column.
 */
export type AvgAggregate = BaseAggregate<'AVG'> & {
  $args: ColumnIdentifier;
};

/**
 * COUNT aggregate function.
 * Counts the number of rows or non-null values.
 */
export type CountAggregate = BaseAggregate<'COUNT'> & {
  $args: '1' | '*';
};

/**
 * COUNT DISTINCT aggregate function.
 * Counts the number of distinct values in a column or columns.
 */
export type CountDistinctAggregate = BaseAggregate<'COUNT_DISTINCT'> & {
  $args: Array<ColumnIdentifier>;
};

/**
 * DISTINCT aggregate function.
 * Returns only distinct (different) values.
 */
export type DistinctAggregate = BaseAggregate<'DISTINCT'> & {
  $args: Array<ColumnIdentifier>;
};

/**
 * MAX aggregate function.
 * Finds the maximum value in a column.
 */
export type MaxAggregate = BaseAggregate<'MAX'> & {
  $args: ColumnIdentifier;
};

/**
 * MIN aggregate function.
 * Finds the minimum value in a column.
 */
export type MinAggregate = BaseAggregate<'MIN'> & {
  $args: ColumnIdentifier;
};

/**
 * JSON_ROW aggregate function.
 * Aggregates multiple columns or expressions into a single JSON object.
 * Used for creating nested or structured results.
 */
export type JSONRowAggregate<
  T extends Record<string, unknown> = Record<string, unknown>,
> = BaseAggregate<'JSON_ROW'> & {
  $args: Record<keyof T, ColumnIdentifier | Expressions | Aggregates>;
};

/**
 * Union of all aggregate types that can be used in queries.
 * Uses a mapped type to ensure consistency of property shapes.
 */
export type Aggregates = (
  | SumAggregate
  | AvgAggregate
  | CountAggregate
  | CountDistinctAggregate
  | DistinctAggregate
  | MaxAggregate
  | MinAggregate
  | JSONRowAggregate
) extends infer R ? {
    [K in keyof R]: R[K];
  }
  : never;

/**
 * Type inference utility that maps TypeScript types to appropriate aggregate functions.
 * Helps with type checking when defining aggregates in queries.
 *
 * @template P - The property type that determines which aggregate functions are applicable
 * @returns Union of valid aggregate types for the given property type
 *
 * @example
 * ```typescript
 * // For a numeric column
 * const sumAggregate: AggregateDefinition<number> = {
 *   $aggr: 'SUM',
 *   $args: '$amount'
 * };
 *
 * // For an object column
 * const jsonRowAggregate: AggregateDefinition<Record<string, unknown>> = {
 *   $aggr: 'JSON_ROW',
 *   $args: { id: '$id', name: '$name' }
 * };
 * ```
 */
export type AggregateDefinition<
  P extends
    | number
    | bigint
    | Date
    | Record<string, unknown>
    | Array<Record<string, unknown>> = number,
> = P extends (number | bigint | Date) ?
    | SumAggregate
    | AvgAggregate
    | MinAggregate
    | MaxAggregate
    | CountAggregate
    | CountDistinctAggregate
  : P extends (Array<Record<string, unknown>> | Record<string, unknown>)
    ? JSONRowAggregate<UnArray<P>>
  : P extends (string | ColumnIdentifier) ? DistinctAggregate
  : Aggregates;
