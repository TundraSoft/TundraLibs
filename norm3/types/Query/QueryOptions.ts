import { QueryTypes } from "./QueryTypes.ts";
import type { QueryType } from "./QueryTypes.ts";
import type { QueryFilter } from "./Filters.ts";

export type BaseQueryOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  type: QueryType;
  table: string;
  schema?: string;
  columns: Record<keyof T, string>;
};

export type Pagination = {
  limit: number;
  page: number;
};

export type Sorting<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [Property in keyof T]?: "ASC" | "DESC";
};

export type RawQuery = {
  type: QueryTypes.RAW;
  sql: string;
  params?: unknown[];
};

export type SelectQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // type: QueryTypes.RAW;
  filters?: QueryFilter<T>;
  project?: Array<keyof T>;
  pagination?: Pagination;
  sorting?: Sorting<T>;
} & BaseQueryOptions<T>;

export type CountQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  filters?: QueryFilter<T>;
} & BaseQueryOptions<T>;

export type InsertQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // type: QueryTypes.INSERT;
  data: NonNullable<T>[];
  project: Array<keyof T>;
  // returning: boolean;
} & BaseQueryOptions<T>;

export type UpdateQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // type: QueryTypes.UPDATE;
  filters?: QueryFilter<T>;
  data: Partial<T>;
  project: Array<keyof T>;
  // returning: boolean;
} & BaseQueryOptions<T>;

export type DeleteQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // type: QueryTypes.DELETE;
  filters?: QueryFilter<T>;
} & BaseQueryOptions<T>;

export type QueryOption<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  | RawQuery
  | SelectQuery<T>
  | CountQuery<T>
  | InsertQuery<T>
  | UpdateQuery<T>
  | DeleteQuery<T>;
