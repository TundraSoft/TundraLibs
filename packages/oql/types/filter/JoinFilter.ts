import type { FlattenEntity } from '@tundralibs/utils';
import type { TableType } from '../common/TableType.ts';
import type { Expressions } from '../expressions/Expressions.ts';

/**
 * `ON` clause for table joins.
 *
 * Keys are from the linked table (`FLT`). Values can be:
 * - `null` for `NULL` checks.
 * - Direct value matching the key's type — constant values in joins.
 * - Reference to primary-table column (`keyof FPT`) with matching type.
 * - Reference to other linked-table columns (`keyof FLT`) with
 *   matching type.
 * - Expression — computed join condition.
 *
 * Type matching is enforced at compile time — only columns with the
 * same type can be joined.
 *
 * @template PT  - Primary table schema.
 * @template LT  - Linked tables schema (record of table name to
 *   table schema).
 * @template FPT - Flattened primary table with `'@'` prefix.
 * @template FLT - Flattened linked tables with `'@'` prefix.
 *
 * @example
 * ```ts
 * const joinFilter: JoinFilter<
 *   { id: number; name: string },
 *   { Profile: { custId: number; email: string } }
 * > = {
 *   '@Profile.@custId': '@id',     // Profile.custId (number) = PT.id (number)
 *   '@Profile.@email':  'admin@x', // constant string match
 * };
 * ```
 */
export type JoinFilter<
  PT extends TableType = TableType,
  LT extends Record<string, TableType> = Record<string, TableType>,
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
