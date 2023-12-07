import type { TableDefinition, ModelDefinition } from '../Definitions/mod.ts';
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
  MD extends ModelDefinition = ModelDefinition,
  TN extends keyof MD = keyof MD
> =
  & BaseQuery<MD>
  & QueryPagination
  & QuerySorting<MD[TN]>
  & {
    where?: QueryFilters<MD[TN]>;
    project?: {
      [CN in keyof MD[TN]['columns']]?: boolean;
    };
  };
