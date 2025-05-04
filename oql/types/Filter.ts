import type { FlattenEntity } from '@tundralibs/utils';
import type { ExpressionDefinition } from './Expressions.ts';

// PropVal defines the allowed property value types for filters
export type PropVal = string | number | bigint | boolean | Date | unknown;

/**
 * BaseFilter allows filtering by direct value, array (in), null, or filter operators.
 */
export type BaseFilter<P extends PropVal> =
  | P // Explicitly allow direct value as a filter
  | [P] // Becomes an in filter
  | null // is null
  | ExpressionDefinition<P>
  | {
    $eq?: P; // Equal to
    $ne?: P; // Not equal to
    $null?: boolean; // Is (not) null
    $in?: P[]; // In array
    $nin?: P[]; // Not in array
  };

/**
 * StringFilter extends BaseFilter with string-specific operators.
 */
export type StringFilter<P extends string = string> = BaseFilter<P> & {
  $like?: P; // SQL LIKE
  $ilike?: P; // Case-insensitive LIKE
  $nlike?: P; // NOT LIKE
  $nilike?: P; // NOT ILIKE
  $contains?: P; // Contains substring
  $ncontains?: P; // Does not contain substring
  $startsWith?: P; // Starts with substring
  $nstartsWith?: P; // Does not start with substring
  $endsWith?: P; // Ends with substring
  $nendsWith?: P; // Does not end with substring
};

/**
 * ComparisonFilters adds comparison operators for numbers, bigints, and dates.
 */
type ComparisonFilters<P extends number | bigint | Date = number> =
  & BaseFilter<P>
  & {
    $gt?: P; // Greater than
    $gte?: P; // Greater than or equal
    $lt?: P; // Less than
    $lte?: P; // Less than or equal
    $between?: [P, P]; // Between two values (inclusive)
  };

// NumberFilter for number properties
export type NumberFilter<P extends number = number> = ComparisonFilters<P>;

// BigIntFilter for bigint properties
export type BigIntFilter<P extends bigint = bigint> = ComparisonFilters<P>;

// BooleanFilter for boolean properties (no comparison operators)
export type BooleanFilter = BaseFilter<boolean>;

// DateFilter for date properties
export type DateFilter<P extends Date = Date> = ComparisonFilters<P>;

/**
 * Filters is a conditional type that selects the appropriate filter type
 * based on the property value type.
 */
export type Filters<P extends PropVal = PropVal> = P extends string
  ? StringFilter
  : P extends number ? NumberFilter
  : P extends bigint ? BigIntFilter
  : P extends boolean ? BooleanFilter
  : P extends Date ? DateFilter
  : BaseFilter<P>;

/**
 * QueryFilters builds a filter object for a flattened entity, supporting
 * logical $or and $and operators for combining filters.
 */
export type QueryFilters<
  T extends Record<string, unknown> = Record<string, unknown>,
  FP extends FlattenEntity<T> = FlattenEntity<T>,
> = (
  & {
    [Property in keyof FP]?: Filters<FP[Property]>; // Property filters
  }
  & {
    $or?: Array<QueryFilters<FP>>; // Logical OR
    $and?: Array<QueryFilters<FP>>; // Logical AND
  }
) extends infer O ? {
    [Property in keyof O]: O[Property];
  }
  : never;
