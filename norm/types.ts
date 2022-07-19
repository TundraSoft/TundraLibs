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
  // Project - The actual columns to select
  project?: Array<string>;
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
  totalRows: number;
  paging?: {
    size: number;
    page?: number;
  };
  sort?: QuerySorting<T>;
  rows?: Array<T>;
};

//#endregion Database

//#region Model
export type Typeof = {
  'string': string;
  'number': number;
  'object': object; // eslint-disable-line @typescript-eslint/ban-types
  'boolean': boolean;
  'symbol': symbol;
  'bigint': bigint;
  'date': Date;
  'undefined': undefined;
};

type FunctionParameter = unknown;
function typeCast<T extends keyof Typeof, P extends FunctionParameter = Typeof[T]> (type: T) {
  return (arg: P): Typeof[T] => {
    if(typeof arg !== type || arg === null) {
      throw TypeError(`Expected ${type} got ${typeof arg}`)
    }
    return arg as Typeof[T];
  }
}

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

export const DataTypeMap = {
  "VARCHAR": typeCast('string'),
  "CHARACTER": typeCast('string'),
  "NVARCHAR": typeCast('string'),
  "TEXT": typeCast('string'),
  "STRING": typeCast('string'),
  "UUID": typeCast('string'),
  "GUID": typeCast('string'),
  "NUMERIC": typeCast('number'),
  "NUMBER": typeCast('number'),
  "DECIMAL": typeCast('number'),
  "INTEGER": typeCast('number'),
  "SMALLINT": typeCast('number'),
  "TINYINT": typeCast('number'),
  "FLOAT": typeCast('number'),
  "SERIAL": typeCast('number'),
  "BIGINTEGER": typeCast('number'),
  "BIGSERIAL": typeCast('number'),
  "BOOLEAN": typeCast('boolean'),
  "BINARY": typeCast('boolean'),
  "DATE": typeCast('date'),
  "DATETIME": typeCast('date'),
  "TIME": typeCast('date'),
  "TIMESTAMP": typeCast('date'),
  "JSON": typeCast('object'),
}

export type DataType = keyof typeof DataTypes;

export type ValidatorFunction<T> = (value?: T, ...args: unknown[]) => boolean;

export type SchemaColumnDefinition<T> = {
  name?: string;
  dataType: keyof typeof DataTypes; 
  isNullable: boolean;
  validators?: Array<ValidatorFunction<T>>, 
}

export type SchemaDefinition = {
  connection?: string;
  schema?: string;
  table: string;
  columns: {
    [key: string]: SchemaColumnDefinition<unknown>
  };
  primaryKeys?: Array<keyof SchemaDefinition['columns']>;
  uniqueKeys?: Record<string, Array<keyof SchemaDefinition['columns']>>;
}


type PartialPartial<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K> extends
  infer O ? { [P in keyof O]: O[P] } : never;

type KeysMatching<T, V> = { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T];

export type ExtractType<T extends { [K in keyof T]: SchemaColumnDefinition<any> }> = PartialPartial<{
  [K in keyof T]: ReturnType<typeof DataTypeMap[T[K]['dataType']]>
}, KeysMatching<T, { isNullable: true }>>

// type ExtractColumns<T, K extends keyof T> = Pick<T, K>;

export type Schema = <S extends SchemaDefinition>(s:S) => S;

// const Schema = <S extends SchemaDefinition<unknown>>(
//   s: S
// ) => {
//   // Validate definition here
//   return s as S;
// };

//#region Old

export type Validator = (...args: unknown[]) => boolean | Promise<boolean>;

export type FieldValidator = {
  cb: Function;
  args?: Array<unknown>;
  msg?: string;
};

export type FieldDefinition = {
  dataType: DataType; // The data type
  name?: string; // The actual column name
  isPrimary?: boolean; // Is it a primary key. String for compound
  isUnique?: boolean; // Is it a unique key. String here for compound
  isNullable?: boolean; // Is this nullable
  validators?: Array<FieldValidator>; // Validation functions for each field
  default?: unknown;
  encrypt?: unknown;
};

export type ModelSchema<T> = {
  // DB Connection name
  connection: string;
  // Schema if present
  schema: string;
  // Table name
  table: string;
  // Column definition
  columns: {
    [Property in keyof T]: FieldDefinition;
  };
  // Page size (defaults to 10)
  pagesize?: number;
  // Enabled functionalities - By default all are enabled, SELECT can never be disabled
  enabled?: {
    // Insert allowed
    insert: boolean;
    // Update allowed
    update: boolean;
    // Delete allowed
    delete: boolean;
    // Truncate allowed
    truncate: boolean;
  };
};
//#endregion Old

//#endregion Model
