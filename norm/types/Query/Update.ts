import { BaseQuery } from './Base.ts';
import { QueryFilters } from './filters/mod.ts';

export type UpdateQuery<
  M extends Record<string, unknown> = Record<string, unknown>,
> = BaseQuery<M> & {
  values: Record<string, unknown>;
  filters?: QueryFilters<M>;
};
