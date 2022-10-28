import { QueryPagination } from "./QueryPagination.ts";

export type QueryResult<T> = {
  type: string;
  sql: string;
  time: number;
  count: number;
  data: Array<T>;
};

// export type DataQueryResult<T> = {
//   data: Array<T>;
// } & QueryResult<T>;

export type SelectQueryResult<T> = {
  pagination: QueryPagination;
} & QueryResult<T>;
