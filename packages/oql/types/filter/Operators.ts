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
 *
 * **Column references.** A direct value, `$eq`, `$ne` and the
 * comparison operators also accept another column of the SAME value
 * type, as `'@col'` — `{ '@updatedAt': { $gt: '@createdAt' } }`. The
 * translators render an `@` string naming an in-scope column as that
 * column on every dialect (a `$expr` on MongoDB). `$in` / `$nin` lists
 * take literals only: MongoDB cannot express a column inside a list.
 */
export type Operators<
  T extends ColumnTypes = ColumnTypes,
  PT extends TableType = TableType,
  FPT extends FlattenEntity<PT, '', '@'> = FlattenEntity<PT, '', '@'>,
> =
  | null
  | T
  | ColumnRefOf<FPT, T>
  | Array<NonNullable<T>>
  | {
    // `null` is intentionally excluded from $eq/$ne/$in/$nin values.
    // SQL `= NULL` and `<> NULL` are always unknown (never true);
    // for null comparisons use `$null: true` / `$null: false` instead.
    $eq?: NonNullable<T> | Expressions<PT, FPT> | ColumnRefOf<FPT, T>;
    $ne?: NonNullable<T> | Expressions<PT, FPT> | ColumnRefOf<FPT, T>;
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
            $gt?: T | Expressions<PT, FPT> | ColumnRefOf<FPT, T>;
            $gte?: T | Expressions<PT, FPT> | ColumnRefOf<FPT, T>;
            $lt?: T | Expressions<PT, FPT> | ColumnRefOf<FPT, T>;
            $lte?: T | Expressions<PT, FPT> | ColumnRefOf<FPT, T>;
            $between?: [
              T | Expressions<PT, FPT> | ColumnRefOf<FPT, T>,
              T | Expressions<PT, FPT> | ColumnRefOf<FPT, T>,
            ];
          }
        : never
    );

/**
 * The `'@col'` keys of a flattened table whose value type is `T` —
 * the columns a filter on a `T` column may compare against. Strict:
 * no fallback to every key when none match (unlike
 * `GetColumnByType`), and catch-all index signatures never qualify.
 * Keys are collected by remapping (`as`) rather than `{…}[keyof FPT]`:
 * `keyof` of a type carrying a `` `@${string}` `` index signature
 * collapses every declared key into it (see `ConcreteColumnKeys`).
 *
 * @internal
 */
type ColumnRefOf<FPT, T> = keyof {
  [
    K in keyof FPT as K extends `@${string}` ? `@${string}` extends K ? never
      : [NonNullable<FPT[K]>] extends [NonNullable<T>] ? K
      : never
      : never
  ]: unknown;
};
