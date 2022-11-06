import { BaseColumnDefinition } from './Query/mod.ts'
import { DataTypeMap } from './DataTypes.ts';
import type { GuardianProxy } from "../../guardian/mod.ts";

export type ModelColumnDefinition = {
  name: string;
  notNullOnce?: boolean;
  disableUpdate?: boolean;
  // deno-lint-ignore no-explicit-any
  validation?: GuardianProxy<any>;
  encryption?: {
    key: string;
    decryptOnSelect?: boolean;
  };
}  & BaseColumnDefinition;

export type ModelDefinition = {
  name: string; // Name of the model
  connection: string; // The connection config name
  schema?: string; // The schema name
  table: string; // The table name
  isView?: boolean; // Is this a view?
  columns: {
    [key: string]: ModelColumnDefinition;
  };
  primaryKey?: Set<string>;
  uniqueKeys?: Record<string, Set<string>>;
  foreignKeys?: Record<string, {
    table?: string;
    schema?: string;
    model?: string;
    columnMap: Record<string, string>;
  }>;
  permissions?: {
    select?: boolean;
    insert?: boolean;
    update?: boolean;
    delete?: boolean;
    truncate?: boolean;
  }
  pageSize?: number;
};

type PartialPartial<T, K extends keyof T> =
  Partial<Pick<T, K>> & Omit<T, K> extends infer O ? { [P in keyof O]: O[P] }
    : never;

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

//// deno-lint-ignore no-explicit-any
type ExtractTypes<T extends { [K in keyof T]: ModelColumnDefinition }> =
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
