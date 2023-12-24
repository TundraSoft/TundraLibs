import type { ModelDefinition, TableDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';
import type { QueryFilters } from './Filters.ts';

export type QueryPagination = {
  limit?: number;
  offset?: number;
};

export type QuerySorting<TD extends TableDefinition = TableDefinition> = {
  orderBy?: [keyof TD['columns'], 'ASC' | 'DESC'][];
};

type Relationship<DM extends ModelDefinition, TN extends keyof DM> = {
  [R in keyof DM[TN]['relationShips']]?: DM[TN]['relationShips'][R] extends
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
  with?: Relationship<DM, TN>;
};
