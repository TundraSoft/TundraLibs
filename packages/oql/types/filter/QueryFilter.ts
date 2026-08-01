import type { FlattenEntity } from '@tundralibs/utils';
import type { TableType } from '../common/TableType.ts';
import type { ExistsFilter } from './ExistsFilter.ts';
import type { FilterOperator } from './FilterOperator.ts';

/**
 * Top-level filter shape combining boolean composition (`$and` /
 * `$or`), correlated subquery predicates (`$exists` / `$nexists` —
 * see {@link ExistsFilter}), and per-column operators
 * ({@link FilterOperator}).
 */
export type QueryFilter<
  PT extends TableType = TableType,
  FPT extends FlattenEntity<PT, '', '@'> = FlattenEntity<PT, '', '@'>,
> = {
  $and?: Array<QueryFilter<PT, FPT>>;
  $or?: Array<QueryFilter<PT, FPT>>;
  /** Rows must have at least one matching row in the subquery table. */
  $exists?: ExistsFilter<PT, FPT>;
  /** Rows must have NO matching row in the subquery table. */
  $nexists?: ExistsFilter<PT, FPT>;
} & FilterOperator<PT, FPT>;
