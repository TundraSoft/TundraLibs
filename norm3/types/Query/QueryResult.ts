import type { QueryType } from "./QueryTypes.ts";
import type { Pagination, Sorting } from "./QueryOptions.ts";

export type QueryResult<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: QueryType;
  time: number;
  count: number;
  pagination?: Pagination;
  sorting?: Sorting<T>;
  data?: T[];
};
