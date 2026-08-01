import type { DateExpressions } from './DateExpressions.ts';
import type { NumericExpressions } from './NumericExpressions.ts';
import type { StringExpressions } from './StringExpressions.ts';

/**
 * Map a TypeScript value type to the expression names that produce it.
 *
 * @template V - The value type to filter by.
 *
 * @example
 * ```ts
 * type NumericOnly = GetExpressionByType<number | bigint>; // NumericExpressions
 * type StringOnly  = GetExpressionByType<string>;          // StringExpressions
 * type DateOnly    = GetExpressionByType<Date>;            // DateExpressions
 * ```
 */
export type GetExpressionByType<V> = V extends number | bigint
  ? NumericExpressions
  : V extends string ? StringExpressions
  : V extends Date ? DateExpressions
  : never;
