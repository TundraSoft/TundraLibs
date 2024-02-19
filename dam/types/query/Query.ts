export type Query = {
  type?: 'RAW';
  sql: string;
  params?: Record<string, unknown>;
};

import type { QueryResult } from './Result.ts';
import type { QueryFilters } from './filter/mod.ts';

type QueryFunction = (res: QueryResult) => Query | QuerySet;
export type QuerySet = Array<
  Query & {
    finalReturn?: boolean;
  }
>;

import type { DefineExpression } from '../expressions/mod.ts';

export type ProjectColumns<
  R extends Record<
    string,
    string | number | bigint | Date | boolean | unknown
  > = Record<string, unknown>,
> = {
  [K in keyof R]: DefineExpression<R[K]> | string | boolean;
};

export type JoinQuery<
  R extends Record<string, unknown> = Record<string, unknown>,
  J extends Record<string, Record<string, unknown>> = Record<
    string,
    Record<string, unknown>
  >,
> = {
  [RC in keyof J]: {
    source: string;
    schema?: string;
    project: ProjectColumns<J[RC]>;
    relation: {
      [K in keyof J[RC]]?: keyof R;
    };
  };
};

export type InsertQuery<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'INSERT';
  source: string;
  schema?: string;
  data: Array<Partial<R>>;
  project: ProjectColumns<R>;
};

export type UpdateQuery<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'UPDATE';
  source: string;
  schema?: string;
  data: R;
  filters?: QueryFilters<R>;
};

export type DeleteQuery<
  R extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: 'DELETE';
  source: string;
  schema?: string;
  filters?: QueryFilters<R>;
};

export type CountQuery<
  R extends Record<string, unknown> = Record<string, unknown>,
  J extends Record<string, Record<string, unknown>> = Record<
    string,
    Record<string, unknown>
  >,
> = {
  type: 'COUNT';
  source: string;
  schema?: string;
  filters?: QueryFilters<R> & QueryFilters<J>;
  join?: JoinQuery<R, J>;
};

export type SelectQuery<
  R extends Record<string, unknown> = Record<string, unknown>,
  J extends Record<string, Record<string, unknown>> = Record<
    string,
    Record<string, unknown>
  >,
> = {
  type: 'SELECT';
  source: string;
  schema?: string;
  project: ProjectColumns<R>;
  filters?: QueryFilters<R> & QueryFilters<J>;
  join?: JoinQuery<R, J>;
  limit?: number;
  offset?: number;
};

export type DMLQueries<
  R extends Record<string, unknown> = Record<string, unknown>,
> =
  | InsertQuery<R>
  | UpdateQuery<R>
  | DeleteQuery<R>
  | CountQuery<R>
  | SelectQuery<R>;

export type TruncateQuery = {
  type: 'TRUNCATE';
  source: string;
  schema?: string;
};

export type DDLQueries = TruncateQuery;
