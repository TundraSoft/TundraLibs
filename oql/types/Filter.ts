import { FlattenEntity } from '@tundralibs/utils';
import { ColumnTypes, TableType } from './Common.ts';
import type { Expressions } from './Expressions.ts';

/**
 * Operators for filtering column values.
 *
 * Supports:
 * - Direct value comparison: `value` or `null`
 * - Array comparison: `[value1, value2]` (implicit $in)
 * - Object operators: `{ $eq, $ne, $in, $nin, $null }`
 * - String operators: `{ $like, $ilike, $startsWith, $endsWith, $contains }`
 * - Comparison operators: `{ $gt, $gte, $lt, $lte }` (for numbers, dates)
 */
export type Operators<T extends ColumnTypes = ColumnTypes> =
  | null
  | T
  | Array<T>
  | {
    $eq?: T;
    $ne?: T;
    $in?: Array<T>;
    $nin?: Array<T>;
    $null?: boolean;
  }
    & (
      T extends string ? {
          $like?: string;
          $nlike?: string;
          $ilike?: string;
          $nilike?: string;
          $startsWith?: string;
          $endsWith?: string;
          $contains?: string;
        }
        : T extends Date | number | bigint ? {
            $gt?: T;
            $gte?: T;
            $lt?: T;
            $lte?: T;
          }
        : never
    );

/**
 * Filter operator for table columns.
 *
 * Maps each column to its allowed operators based on column type.
 * Expressions and aggregates are referenced by name (validated at runtime).
 */
export type FilterOperator<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> = {
  [K in keyof FT]?: FT[K] extends ColumnTypes ? Operators<FT[K]> : never;
};

export type QueryFilter<
  PT extends TableType = TableType,
  FPT extends FlattenEntity<PT, '', '@'> = FlattenEntity<PT, '', '@'>,
> = {
  $and?: Array<QueryFilter<PT, FPT>>;
  $or?: Array<QueryFilter<PT, FPT>>;
} & FilterOperator<PT, FPT>;

/**
 * JoinFilter defines the ON clause for table joins.
 *
 * @template PT - Primary table schema
 * @template LT - Linked tables schema (record of table name to table schema)
 * @template FPT - Flattened primary table with '@' prefix
 * @template FLT - Flattened linked tables with '@' prefix
 *
 * Keys are from the linked table (FLT).
 * Values can be:
 * - null: for NULL checks
 * - Direct value matching the key's type: for constant values in joins
 * - Reference to primary table column (keyof FPT) with matching type
 * - Reference to other linked table columns (keyof FLT) with matching type
 * - Expression: for computed join conditions
 *
 * Type matching is enforced at compile time - only columns with the same type can be joined.
 *
 * @example
 * ```typescript
 * const joinFilter: JoinFilter<
 *   { id: number; name: string },
 *   { Profile: { custId: number; email: string } }
 * > = {
 *   '@Profile.@custId': '@id',     // Valid: Profile.custId (number) = PT.id (number)
 *   '@Profile.@email': 'admin@x',   // Valid: Profile.email = constant string
 * };
 * ```
 */
export type JoinFilter<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<
    string,
    TableType
  >,
  FPT extends FlattenEntity<PT, '', '@'> = FlattenEntity<PT, '', '@'>,
  FLT extends FlattenEntity<LT, '', '@'> = FlattenEntity<LT, '', '@'>,
> = {
  [K in keyof FLT]?:
    | null
    | FLT[K]
    | Expressions<PT, FPT>
    | {
      [P in keyof FPT]: FPT[P] extends FLT[K] ? P & string : never;
    }[keyof FPT]
    | {
      [L in keyof FLT]: FLT[L] extends FLT[K] ? L & string : never;
    }[keyof FLT];
};

export type JoinDetails<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<
    string,
    TableType
  >,
  JT extends TableType = TableType,
> = {
  table: keyof LT;
  schema?: string;
  /**
   * List of columns available from the joined table.
   * Required for validation in WHERE, HAVING, expressions, and aggregates.
   * Must explicitly list all columns that will be referenced.
   *
   * @example
   * ```typescript
   * Profile: {
   *   table: 'profiles',
   *   columns: ['userId', 'bio', 'email'],  // userId must be listed for join condition
   *   on: { '@Profile.@userId': '@id' }     // References userId from columns array
   * }
   * ```
   */
  columns: Array<keyof JT>;
  on: JoinFilter<PT, LT>;
  type?: 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
};

export type Joins<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<
    string,
    TableType
  >,
> = {
  [K in keyof LT]?: JoinDetails<PT, LT, LT[K]>;
};
