import type { ModelDefinition, TableDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';
import type { QueryFilters } from './Filters.ts';

export type QueryPagination = {
  limit?: number;
  offset?: number;
};

export type QuerySorting<TD extends TableDefinition = TableDefinition> = {
  // orderBy?: {
  //   [C in keyof TD['columns']]?: 'ASC' | 'DESC';
  // }
  orderBy: [keyof TD['columns'], 'ASC' | 'DESC'][];
};

export type SelectQuery<
  DM extends ModelDefinition = ModelDefinition,
  TN extends keyof DM = keyof DM,
> = BaseQuery<DM, TN> & QueryPagination & QuerySorting<DM[TN]> & {
  filter?: QueryFilters<DM[TN]>;
};
