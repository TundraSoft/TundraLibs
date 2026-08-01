import type { FlattenEntity } from '@tundralibs/utils';
import type { ColumnTypes } from '../common/ColumnTypes.ts';
import type { TableType } from '../common/TableType.ts';
import type { QueryFilter } from './QueryFilter.ts';

/**
 * Correlated `EXISTS` / `NOT EXISTS` subquery filter — the value shape
 * of the `$exists` / `$nexists` keys on {@link QueryFilter}.
 *
 * Translates to
 * `EXISTS (SELECT 1 FROM <table> AS __exists__ WHERE <on> AND <where>)`
 * (or `NOT EXISTS (…)` for `$nexists`). The subquery table is always
 * aliased `__exists__` internally, so its columns never collide with
 * the outer query's tables.
 *
 * **`on` — the correlation map.** Follows the join `on` conventions:
 * each KEY is a column of the subquery `table` (single-segment
 * `@column` refs — no alias prefix, the `__exists__` alias is
 * implicit); each VALUE resolves against the OUTER query's scope with
 * the same rule join values use — a string `@x` is a column reference
 * iff `x` names a column in the outer scope (base column, or
 * `@Alias.@col` for a joined column); anything else is literal data
 * and is parameterised. Expression objects are NOT allowed as `on`
 * values: their embedded column refs cannot be qualified reliably
 * inside the subquery, so the validator rejects them.
 *
 * Outer refs stay correct in both outer shapes: when the outer query
 * has joins, base refs resolve through the `__base__` alias; without
 * joins they are qualified with the outer table's own name (a table's
 * bare name is its implicit SQL alias), so the subquery cannot capture
 * them.
 *
 * **`where` — subquery-local filter.** Keys reference columns of the
 * subquery `table` (they are qualified with the `__exists__` alias at
 * translate time). Values are literals or expressions — value-position
 * `@x` strings never resolve to outer columns here; correlation
 * happens exclusively through `on`.
 *
 * @template PT  - Primary (outer) table schema.
 * @template FPT - Flattened outer table with `'@'` prefix.
 *
 * @example Users that have at least one paid order
 * ```ts
 * const filter: QueryFilter<{ id: number; name: string }> = {
 *   $exists: {
 *     table: 'orders',
 *     on: { '@userId': '@id' },       // orders.userId = users.id
 *     where: { '@status': 'paid' },   // orders.status = 'paid'
 *   },
 * };
 * ```
 */
export type ExistsFilter<
  PT extends TableType = TableType,
  FPT extends FlattenEntity<PT, '', '@'> = FlattenEntity<PT, '', '@'>,
> = {
  /** Name of the table the subquery selects from. */
  table: string;
  /** Optional schema/namespace for the subquery table. */
  schema?: string;
  /**
   * Correlation map: subquery column (`@column`) → outer column ref
   * (`@baseCol` / `@Alias.@col`) or literal value. Emitted as
   * `__exists__.<key> = <value>` conditions, ANDed together.
   */
  on: Record<`@${string}`, null | ColumnTypes | (keyof FPT & string)>;
  /**
   * Optional filter on the subquery table's own columns. Keys are
   * `@column` refs into the subquery table.
   */
  where?: QueryFilter;
};
