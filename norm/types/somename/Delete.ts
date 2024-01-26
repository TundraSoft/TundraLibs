import { BaseQuery } from './Base.ts';
import { QueryFilters } from './filters/mod.ts';

export type DeleteQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  type: 'DELETE';
  filters?: QueryFilters<M>;
};
