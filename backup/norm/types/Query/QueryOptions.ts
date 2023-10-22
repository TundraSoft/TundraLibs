import type { QueryFilter } from './QueryFilter.ts';

// First define Columns
type ColumnSelection = {
  [alias: string]: string;
};

type JoinOperators = 'INNER' | 'LEFT' | 'RIGHT';

type JoinRelation = {
  [parent: string]: string;
};

type BaseQueryOptions = {
  table: string;
  schema?: string;
  columns: ColumnSelection;
};

type AggregationFilterOptions = {
  aggregation?: {
    sum?: string | string[];
    min?: string | string[];
    max?: string | string[];
    avg?: string | string[];
    count?: string | string[];
    distinct?: string | string[];
  };
  filter?: QueryFilter;
};

type SortOptions = {
  sort?: {
    [column: string]: 'ASC' | 'DESC';
  };
};

type PagingOptions = {
  page?: number;
  limit?: number;
};

type JoinOptions =
  & BaseQueryOptions
  & AggregationFilterOptions
  & SortOptions
  & {
    alias: string;
    type: JoinOperators;
    on: JoinRelation;
    orderBy?: string;
  };

export type SelectQueryOptions =
  & BaseQueryOptions
  & AggregationFilterOptions
  & SortOptions
  & PagingOptions
  & {
    join?: JoinOptions[];
  };

export type InsertQueryOptions = BaseQueryOptions & {
  values: Record<string, unknown>[] | Record<string, unknown>;
};

export type UpdateQueryOptions = BaseQueryOptions & {
  values: Record<string, unknown>;
  filter?: QueryFilter;
};

export type DeleteQueryOptions = BaseQueryOptions & {
  filter?: QueryFilter;
};
