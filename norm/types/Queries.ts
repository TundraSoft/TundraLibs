import { DataType } from "./DataTypes.ts";

/**
 * QueryTypes
 */
export const enum QueryTypes {
  "CREATE" = "CREATE",
  "ALTER" = "ALTER",
  "DROP" = "DROP",
  "TRUNCATE" = "TRUNCATE",
  "SHOW" = "SHOW",
  "SELECT" = "SELECT",
  "COUNT" = "COUNT",
  "INSERT" = "INSERT",
  "UPDATE" = "UPDATE",
  "DELETE" = "DELETE",
  "MERGE" = "MERGE",
  "DESC" = "DESCRIBE",
  "DESCRIBE" = "DESCRIBE",
  "EXPLAIN" = "EXPLAIN",
  "BEGIN" = "BEGIN",
  "COMMIT" = "COMMIT",
  "ROLLBACK" = "ROLLBACK",
  "UNKNOWN" = "UNKNWON",
}

export type QueryType = keyof typeof QueryTypes;

/**
 * FilterOperators<T>
 * The filtering options allowed. This helps map a "column" to a certain filter condition
 */
export type FilterOperators<T> = T | {
  $eq?: T;
  $neq?: T;
  $in?: Array<T>;
  $nin?: Array<T>;
  $lt?: T;
  $lte?: T;
  $gt?: T;
  $gte?: T;
  $between?: {
    from: T;
    to: T;
  };
  $null?: boolean;
  $like?: T;
  $nlike?: T;
  $ilike?: T;
  $nilike?: T;
};

/**
 * QueryPagination
 * Pagination of data. Used in Select only
 */
export type QueryPagination = {
  size: number;
  page: number;
};

/**
 * QuerySorting<T>
 * Sorting of data, used in Select only
 */
export type QuerySorting<T> = {
  [Property in keyof T]?: "ASC" | "DESC";
};

/**
 * Filters<T>
 * Helps building complex filter condition sets without writing SQL statements
 */
export type Filters<T> =
  | {
    [Property in keyof T]?: FilterOperators<T[Property]>;
  }
    & {
      $or?: Filters<T>;
      $and?: Filters<T>;
    }
  | Array<
    {
      [Property in keyof T]?: FilterOperators<T[Property]>;
    }
  >;

export type QueryOptions<T> = {
  // The table name
  table: string;
  // Schema name (not all database support this)
  schema?: string;
  // Column names - Used for alias
  columns: Record<keyof T, string>;
};

export type SelectQueryOptions<T> = QueryOptions<T> & {
  // Columns which needs to be selected
  project?: Array<string>;
  // Filtering conditions
  filters?: Filters<T>;
  // Pagination options
  paging?: QueryPagination;
  // Sorting options
  sort?: QuerySorting<T>;
};

export type CountQueryOptions<T> = QueryOptions<T> & {
  filters?: Filters<T>;
};

export type UpdateQueryOptions<T> = QueryOptions<T> & {
  filters?: Filters<T>;
  data: Partial<T>;
};

export type InsertQueryOptions<T> = QueryOptions<T> & {
  insertColumns: Array<keyof T>;
  data: Array<Partial<T>>;
  merge?: boolean;
};

export type DeleteQueryOptions<T> = QueryOptions<T> & {
  filters?: Filters<T>;
};

/**
 * QueryResult
 * Standard return data set
 */
export type QueryResult<T = Record<string, unknown>> = {
  type: QueryType;
  time: number;
  totalRows: number;
  paging?: {
    size: number;
    page?: number;
  };
  sort?: QuerySorting<T>;
  rows?: Array<T>;
};

export type CreateTableOptions = {
  schema?: string;
  table: string;
  dropCreate: boolean;
  backup?: string;
  columns: {
    [key: string]: {
      type: DataType;
      length?: {
        precision: number;
        scale: number;
      } | number;
      isNullable?: boolean;
    };
  };
  primaryKeys?: Array<string>;
  uniqueKeys?: {
    [key: string]: Array<string>;
  };
};
