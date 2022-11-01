import { Filters } from "./Filters.ts";
import { QueryPagination } from "./QueryPagination.ts";
import { QuerySorting } from "./QuerySorting.ts";

export type QueryOptions<T extends Record<string, unknown> = Record<string, unknown>> = {
  // The table name
  table: string;
  // Schema name (not all database support this)
  schema?: string;
  // Column names - Used for alias
  columns: Record<keyof T, string>;
};

const c: SelectQueryOptions<{id: string, name: string, uid: number}> = {
  table: 'adf', 
  columns: {
    id: 'ID', 
    name: 'NAME',
    uid: 'UID',
  }, 
  project: ['id', 'name'],
}

export type SelectQueryOptions<T extends Record<string, unknown> = Record<string, unknown>> = {
  // Select only specific columns
  project?: (keyof T)[];
  filters?: Filters<T>;
  paging?: QueryPagination;
  sort?: QuerySorting<T>;
} & QueryOptions<T>;

export type InsertQueryOptions<T extends Record<string, unknown> = Record<string, unknown>> = {
  project?: (keyof T)[]; // Select only specific columns
  data: Array<NonNullable<T>>;
  upsert?: boolean;
} & QueryOptions<T>;

export type UpdateQueryOptions<T extends Record<string, unknown> = Record<string, unknown>> = {
  project?: (keyof T)[]; // Select only specific columns
  data: Partial<T>;
  filters?: Filters<T>;
} & QueryOptions<T>;

export type DeleteQueryOptions<T extends Record<string, unknown> = Record<string, unknown>> = {
  filters?: Filters<T>;
} & QueryOptions<T>;
