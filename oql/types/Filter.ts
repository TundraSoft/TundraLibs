import { FlattenEntity } from '@tundralibs/utils';
import { ColumnTypes, TableType } from './Common.ts';
import type { Expressions, GetExpressionByType } from './Expressions.ts';

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

export type FilterOperator<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> = {
  [K in keyof FT]?: FT[K] extends ColumnTypes ? (
      | Operators<FT[K]>
      | Extract<Expressions<T, FT>, { type: GetExpressionByType<FT[K]> }>
    )
    : never;
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
> = {
  table: keyof LT;
  schema?: string;
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
  [k in keyof LT]?: JoinDetails<PT, LT>;
};
