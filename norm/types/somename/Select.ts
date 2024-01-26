import { BaseQuery } from './Base.ts';
import { QueryFilters } from './filters/mod.ts';

type RelatedSelectQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = {
  relation: Record<string, string>;
} & SelectQuery<M>;

export type SelectQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  type: 'SELECT';
  filters?: QueryFilters<M>;
  with?: Record<string, RelatedSelectQuery>;
};
