import { QueryPagination } from "./QueryPagination.ts";
import { QuerySorting } from "./QuerySorting.ts";

export type QueryResult<T> = {
  type: string;
  sql?: string;
  time: number;
  count: number;
};

export type DataQueryResult<T> = {
  data: Array<T>;
  paging?: QueryPagination;
} & QueryResult<T>;

