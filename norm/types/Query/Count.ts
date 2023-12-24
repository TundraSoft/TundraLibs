import type { ModelDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';
import type { QueryFilters } from './Filters.ts';
import type { QuerySorting } from './Sorting.ts';
import type { QueryPagination } from './Pagination.ts';

type CountRelationship<DM extends ModelDefinition, TN extends keyof DM> = {
  [R in keyof DM[TN]['relationShips']]?: DM[TN]['relationShips'][R] extends
    { model: infer M }
    ? M extends keyof DM
      ? CountQuery<DM, M> & { relation: Record<string, string> }
    : never
    : never;
};

export type CountQuery<
  DM extends ModelDefinition = ModelDefinition,
  TN extends keyof DM = keyof DM,
> = BaseQuery<DM, TN> & QueryPagination & QuerySorting<DM[TN]> & {
  filter?: QueryFilters<DM[TN]>;
  with?: CountRelationship<DM, TN>;
};
