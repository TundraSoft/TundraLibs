import { DataTypeMap } from "./DataTypes.ts";
import type { DataType } from "./DataTypes.ts";
import type { GuardianProxy } from "../../guardian/mod.ts";

export type ColumnDefinition = {
  // Actual column name
  name?: string;
  // The data type
  dataType: DataType;
  length?: {
    precision: number;
    scale: number;
  } | number;
  // isNullable - Is column nullable, if true then null is valid. Defaults to false
  isNullable?: boolean;
  // defaultValue: DBGenerators | GeneratorFunction<T>
  // Validations for the column
  // deno-lint-ignore no-explicit-any
  validator?: GuardianProxy<any>;
  isPrimary?: boolean;
  uniqueKey?: Set<string>;
  relatesTo?: {
    // Model name: Column Name
    [key: string]: string;
  };
};

export type ModelFeatures = {
  insert: boolean;
  bulkInsert: boolean;
  update: boolean;
  bulkUpdate: boolean;
  delete: boolean;
  bulkDelete: boolean;
  create: boolean;
  drop: boolean;
};

export type SchemaDefinition = {
  // Schema name. If blank will resolve to Client's default ex public in postgres
  schema?: string;
  // The table name
  table: string;
  // Column definition
  columns: {
    [key: string]: ColumnDefinition;
  };
};

export type ModelDefinition = SchemaDefinition & {
  // The model name - Friendly identifier. Used for Relationship etc
  name: string;
  // Connection to use, defaults to 'default'
  connection: string;
  // Paging
  pageSize?: number;
  // Features to be enabled
  feature?: {
    insert?: boolean;
    bulkInsert?: boolean;
    update?: boolean;
    bulkUpdate?: boolean;
    delete?: boolean;
    bulkDelete?: boolean;
    truncate?: boolean;
  };
};

type PartialPartial<T, K extends keyof T> =
  Partial<Pick<T, K>> & Omit<T, K> extends infer O ? { [P in keyof O]: O[P] }
    : never;

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

//// deno-lint-ignore no-explicit-any
type ExtractTypes<T extends { [K in keyof T]: ColumnDefinition }> =
  PartialPartial<
    {
      -readonly [K in keyof T]: ReturnType<
        typeof DataTypeMap[T[K]["dataType"]]
      >;
    },
    KeysMatching<T, { isNullable: true }>
  >;

// type Picker<P extends ModelDefinition> = ExtractTypes<
//   {
//     [X in keyof P["columns"]]: P["columns"][X];
//   }
// >;

export type ModelType<P extends ModelDefinition> = ExtractTypes<
  {
    [X in keyof P["columns"]]: P["columns"][X];
  }
>;
