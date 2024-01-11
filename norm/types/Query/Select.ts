import type { ModelDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';
import type { QueryFilters } from './Filters.ts';
import type { QuerySorting } from './Sorting.ts';
import type { QueryPagination } from './Pagination.ts';

type SelectRelationship<DM extends ModelDefinition, TN extends keyof DM> = {
  [R in keyof DM[TN]['foreignKeys']]?: DM[TN]['foreignKeys'][R] extends
    { model: infer M }
    ? M extends keyof DM
      ? SelectQuery<DM, M> & { relation: Record<string, string> }
    : never
    : never;
};

export type SelectQuery<
  DM extends ModelDefinition = ModelDefinition,
  TN extends keyof DM = keyof DM,
> = BaseQuery<DM, TN> & QueryPagination & QuerySorting<DM[TN]> & {
  filter?: QueryFilters<DM[TN]>;
  with?: SelectRelationship<DM, TN>;
};



type DateDiff = {
  from: string; 
  num?: number;
  to?: string;
}

type Age = {
  source: string;
}
