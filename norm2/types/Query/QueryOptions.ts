import { QueryTypes } from "./QueryTypes.ts";
import type { QueryType } from "./QueryTypes.ts";
import type { QueryFilter } from "./Filters.ts";
import type { DataLength, DataType } from "../DataTypes.ts";
// import { DataTypes } from '../DataTypes.ts';
import type { GeneratorFunction, Generators } from "../Translator/mod.ts";
// import { Generator } from '../Translator/mod.ts'

export type BaseColumnDefinition = {
  type: DataType;
  length?: DataLength;
  isNullable?: boolean;
  defaults?: {
    insert?:
      | Generators
      | GeneratorFunction
      | string
      | number
      | bigint
      | boolean
      | Date;
    update?:
      | Generators
      | GeneratorFunction
      | string
      | number
      | bigint
      | boolean
      | Date;
  };
};

export type BaseQueryOptions = {
  type: QueryType;
  table: string;
  schema?: string;
};

export type BaseColumnQueryOptions<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  columns: Record<keyof T, string>;
} & BaseQueryOptions;

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
} & BaseColumnQueryOptions<T>;

export type CountQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  filters?: QueryFilter<T>;
} & BaseColumnQueryOptions<T>;

export type InsertQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // type: QueryTypes.INSERT;
  data: Partial<T>[];
  project?: Array<keyof T>;
  insertColumns?: Array<keyof T>;
  // returning: boolean;
} & BaseColumnQueryOptions<T>;

export type UpdateQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // type: QueryTypes.UPDATE;
  filters?: QueryFilter<T>;
  data: Partial<T>;
  project?: Array<keyof T>;
  // returning: boolean;
} & BaseColumnQueryOptions<T>;

export type DeleteQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // type: QueryTypes.DELETE;
  filters?: QueryFilter<T>;
} & BaseColumnQueryOptions<T>;

export type CreateSchemaQuery = {
  type: QueryTypes.CREATE_SCHEMA;
  schema: string;
};

export type DropSchemaQuery = {
  type: QueryType;
  schema: string;
  cascade?: boolean;
};

export type CreateTableQuery<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  // Column Definition
  columns: {
    [Property in keyof T]: BaseColumnDefinition;
  };
  // Constraints
  primaryKey?: Array<keyof T>;
  uniqueKeys?: Record<string, Array<keyof T>>;
  foreignKeys?: Record<string, {
    table: string;
    schema?: string;
    columnMap: Record<keyof T, string>;
  }>;
} & BaseQueryOptions;

export type DropTableQuery = {
  cascade?: boolean;
} & BaseQueryOptions;

export type TruncateTableQuery = BaseQueryOptions;

export type QueryOption<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  | RawQuery
  | SelectQuery<T>
  | CountQuery<T>
  | InsertQuery<T>
  | UpdateQuery<T>
  | DeleteQuery<T>
  | CreateSchemaQuery
  | DropSchemaQuery
  | CreateTableQuery<T>
  | DropTableQuery
  | TruncateTableQuery;
