//#region Database
/**
 * Dialect
 * The dialects supported
 */
export type Dialect = "POSTGRES" | "MYSQL" | "MONGODB";

/**
 * ClientEvents
 * Events which are emited by Client class
 */
export type ClientEvents = {
  connect(): void;
  close(): void;
  query(sql: string): void;
  error(error: Error): void;
};

/**
 * TLSOption
 * TLS connection option for database
 */
export type TLSOption = {
  enforce: boolean;
  enabled: boolean;
  ca: string[];
};

/**
 * ClientConfig
 * The configuration for connecting to database
 */
export type ClientConfig = {
  // The dialect
  dialect: Dialect;
  // The host
  host: string;
  // The port number
  port: number;
  // The username
  username: string;
  // The password
  password: string;
  // The database
  database: string;
  // Max Connection in the pool, defaults to 1 (no pool)
  pool: number;
  // TLS options
  tls: Partial<TLSOption>;
};

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

/**
 * QueryOptions<T>
 * The standard options set passed to create Select, Insert, Update and Delete statements
 */
export type QueryOptions<T> = {
  // Table name
  table: string;
  // Schema name
  schema?: string;
  // Column names (for alias mapping)
  columns: Record<keyof T, string>;
  // PK
  primary?: Array<keyof T>;
  // Filters
  filters?: Filters<T>;
  // Paging
  paging?: QueryPagination;
  // Sort
  sort?: QuerySorting<T>;
  // Data used for insert or update
  data?: Array<Partial<T>>;
};

/**
 * QueryResult
 * Standard return data set
 */
export type QueryResult<T = Record<string, unknown>> = {
  type: QueryType;
  time: number;
  totalRows?: number;
  paging?: {
    size: number;
    page?: number;
  };
  sort?: QuerySorting<T>;
  rows?: Array<T>;
};

//#endregion Database

//#region Model
export const enum DataTypes {
  "VARCHAR" = "VARCHAR",
  "CHARACTER" = "CHARACTER",
  "NVARCHAR" = "NVARCHAR",
  "TEXT" = "TEXT",
  "STRING" = "STRING",
  "UUID" = "UUID",
  "GUID" = "GUID",
  "NUMERIC" = "NUMERIC",
  "NUMBER" = "NUMBER",
  "DECIMAL" = "DECIMAL",
  "INTEGER" = "INTEGER",
  "SMALLINT" = "SMALLINT",
  "TINYINT" = "TINYINT",
  "FLOAT" = "FLOAT",
  "SERIAL" = "SERIAL",
  "BIGINTEGER" = "BIGINTEGER",
  "BIGSERIAL" = "BIGSERIAL",
  "BOOLEAN" = "BOOLEAN",
  "BINARY" = "BINARY",
  "DATE" = "DATE",
  "DATETIME" = "DATETIME",
  "TIME" = "TIME",
  "TIMESTAMP" = "TIMESTAMP",
  "JSON" = "JSON",
}

export type DataType = keyof typeof DataTypes;

export type FieldDefinition = {
  dataType: DataType; // The data type
  name?: string; // The actual column name
  isPrimary?: boolean; // Is it a primary key
  isUnique?: boolean; // Is it a unique key
  isNullable?: boolean; // Is this nullable
  validation?: unknown;
  encrypt?: unknown;
};

export type ModelConfig<T> = {
  connection: string;
  schema: string;
  table: string;
  columns: {
    [Property in keyof T]: FieldDefinition;
  };
  pagesize?: number;
};

//#endregion Model
