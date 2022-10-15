import { DataTypeMap } from "./DataTypes.ts";
import type { DataType } from "./DataTypes.ts";
import type { DefaultValues } from "./Generators.ts";
// import { Generators } from './Generators.ts'
import type { GuardianProxy } from "../../guardian/mod.ts";

export type DecimalLengthSpec = {
  precision: number;
  scale: number;
};

export type ColumnDefinition = {
  // Actual column name
  name?: string;
  // The data type
  dataType: DataType;
  // Length of the column
  length?: DecimalLengthSpec | number;
  // isNullable - Is column nullable, if true then null is valid. Defaults to false
  isNullable?: boolean;
  // Not nullable - This will ensure if value is already present, it cannot be made into null.
  notNullOnce?: boolean;
  // Disable update on this column. If passed, value is ignored
  disableUpdate?: boolean;
  // Validations for the column
  // deno-lint-ignore no-explicit-any
  validator?: GuardianProxy<any>;
  isPrimary?: boolean;
  uniqueKey?: Set<string>;
  insertDefault?: DefaultValues;
  updateDefault?: DefaultValues;
  // relatesTo?: {
  //   // Model name: Column Name
  //   [key: string]: string;
  // };
};

export type ModelPermissions = {
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  truncate: boolean;
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

  relationships?: {
    [modelName: string]: Set<{
      [sourceColumn: string]: string;
    }>;
  };

  isView?: boolean;
  viewDefinition?: {
    [model: string]: {
      columns: string[]; // Columns to be selected
    };
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
  feature?: Partial<ModelPermissions>;
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

export type ModelValidation<
  T extends Record<string, unknown> = Record<never, never>,
> = {
  [X in keyof T]?: string[];
};
