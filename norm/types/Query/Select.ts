import type { TableDefinition } from '../Definitions/mod.ts';
import type { BaseQuery } from './Base.ts';
import type { QueryFilters } from './Filters.ts';

export type QueryPagination = {
  limit?: number;
  offset?: number;
}

export type QuerySorting<TD extends TableDefinition = TableDefinition> = {
  orderBy?: {
    [C in keyof TD['columns']]?: 'ASC' | 'DESC';
  }
}

export type SelectQuery<TD extends TableDefinition = TableDefinition> = BaseQuery<TD> & QueryPagination & QuerySorting<TD> & {
  where?: QueryFilters<TD>;
}