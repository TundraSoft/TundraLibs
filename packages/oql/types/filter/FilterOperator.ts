import type { FlattenEntity } from '@tundralibs/utils';
import type { ColumnTypes } from '../common/ColumnTypes.ts';
import type { TableType } from '../common/TableType.ts';
import type { Operators } from './Operators.ts';

/**
 * Filter operator for table columns. Maps each column to its
 * allowed operators based on column type. Expressions and
 * aggregates are referenced by name (validated at runtime).
 */
export type FilterOperator<
  T extends TableType = TableType,
  FT extends FlattenEntity<T, '', '@'> = FlattenEntity<T, '', '@'>,
> = {
  [K in keyof FT]?: FT[K] extends ColumnTypes ? Operators<FT[K], T, FT> : never;
};
