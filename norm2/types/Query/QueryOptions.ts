import { Filters } from "./Filters.ts";
import { QueryPagination } from "./QueryPagination.ts";
import { QuerySorting } from "./QuerySorting.ts";

export type QueryOptions<T> = {
  // The table name
  table: string;
  // Schema name (not all database support this)
  schema?: string;
  // Column names - Used for alias
  columns: Record<keyof T, string>;
};

export type InsertQueryOptions<T> = {
  data: Array<Partial<T>>;
  upsert?: boolean;
} & QueryOptions<T>;

export type SelectQueryOptions<T> = {
  filters?: Filters<T>;
  paging?: QueryPagination;
  sort?: QuerySorting<T>;
};

export type UpdateQueryOptions<T> = {
  data: Partial<T>;
  filters?: Filters<T>;
};

export type DeleteQueryOptions<T> = {
  filters?: Filters<T>;
};
