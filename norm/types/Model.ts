import { DataTypeMap } from "./DataTypes.ts";
import type { DataType } from "./DataTypes.ts";
import type { DataLength } from "./DataLength.ts";
import type { DefaultValues } from "./Generators.ts";
// import { Generators } from './Generators.ts'
import type { GuardianProxy } from "../../guardian/mod.ts";

export type ColumnDefinition = {
  // Actual column name
  name?: string;
  // The Data Type
  type: DataType;
  // The data legth
  length?: DataLength;
  // Is the column nullable
  isNullable?: boolean;
  // Can the column be updated to null once value is present
  notNullOnce?: boolean;
  // Disable column from being updated
  disableUpdate?: boolean;
  // Validation on the column
  // deno-lint-ignore no-explicit-any
  validator?: GuardianProxy<any>;
  // Default value on insert
  insertDefault?: DefaultValues;
  // Default value on update
  updateDefault?: DefaultValues;
  // Encrypt column
  encryptKey?: string; // NOTE - this will force data type to string. Will encrypt only if key is present
  // Hooks
  // onSelect: Array<Function>;
  // onInsert: Array<Function>;
  // onUpdate: Array<Function>;
  // onDelete: Array<Function>;
};

export type ModelPermissions = {
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  truncate: boolean;
};

export type ModelDefinition = {
  // The Model name
  name: string;
  // Connection to use
  connection: string;
  // Schema name
  schema?: string;
  // Table name
  table: string;
  // Is this a view
  isView?: boolean;
  // Column definitions
  columns: {
    [name: string]: ColumnDefinition;
  };
  // Primary keys
  primaryKeys?: Set<string>;
  // Unique keys
  uniqueKeys?: {
    [name: string]: Set<string>;
  };
  // Foreign keys
  foreignKeys?: {
    [name: string]: {
      model: string;
      columns: Record<string, string>;
    };
  };
  // Indexes
  indexes?: {
    [name: string]: Array<string>;
  };
  // Permissions
  permissions?: ModelPermissions;
  // Page Size
  pageSize?: number;
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
        typeof DataTypeMap[T[K]["type"]]
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
