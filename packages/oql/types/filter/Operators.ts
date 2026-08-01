import type { FlattenEntity } from '@tundralibs/utils';
import type { ColumnTypes } from '../common/ColumnTypes.ts';
import type { TableType } from '../common/TableType.ts';
import type { Expressions } from '../expressions/Expressions.ts';

/**
 * Operators for filtering column values.
 *
 * Supports:
 * - Direct value comparison: `value` or `null`.
 * - Array comparison: `[value1, value2]` (implicit `$in`).
 * - Object operators (all column types):
 *   `{ $eq, $ne, $in, $nin, $null }`.
 * - String operators (only when `T extends string`):
 *   `{ $like, $nlike, $ilike, $nilike, $startsWith, $endsWith,
 *      $contains }`.
 * - Comparison operators (only when `T extends Date | number |
 *   bigint`): `{ $gt, $gte, $lt, $lte, $between }`.
 * - Expressions: comparison and pattern operators accept expression
 *   values for computed comparisons.
 *
 * **JSON / open-record columns** (`T extends Record<string,
 * unknown>`) resolve neither the string nor the numeric branch —
 * only the value-comparison object operators (`$eq`, `$ne`, `$in`,
 * `$nin`, `$null`) plus direct/array value matches are valid.
 * Because a JSON payload may itself contain `$`-prefixed keys, the
 * runtime treats any top-level `$`-prefixed key inside a filter
 * value as an operator; to exact-match a JSON document that
 * contains operator-shaped keys, wrap it explicitly in `$eq`.
 */
export type Operators<
  T extends ColumnTypes = ColumnTypes,
  PT extends TableType = TableType,
  FPT extends FlattenEntity<PT, '', '@'> = FlattenEntity<PT, '', '@'>,
> =
  | null
  | T
  | Array<NonNullable<T>>
  | {
    // `null` is intentionally excluded from $eq/$ne/$in/$nin values.
    // SQL `= NULL` and `<> NULL` are always unknown (never true);
    // for null comparisons use `$null: true` / `$null: false` instead.
    $eq?: NonNullable<T> | Expressions<PT, FPT>;
    $ne?: NonNullable<T> | Expressions<PT, FPT>;
    $in?: Array<NonNullable<T>>;
    $nin?: Array<NonNullable<T>>;
    $null?: boolean;
  }
    & (
      T extends string ? {
          $like?: string | Expressions<PT, FPT>;
          $nlike?: string | Expressions<PT, FPT>;
          $ilike?: string | Expressions<PT, FPT>;
          $nilike?: string | Expressions<PT, FPT>;
          $startsWith?: string;
          $endsWith?: string;
          $contains?: string;
        }
        : T extends Date | number | bigint ? {
            $gt?: T | Expressions<PT, FPT>;
            $gte?: T | Expressions<PT, FPT>;
            $lt?: T | Expressions<PT, FPT>;
            $lte?: T | Expressions<PT, FPT>;
            $between?: [T | Expressions<PT, FPT>, T | Expressions<PT, FPT>];
          }
        : never
    );
