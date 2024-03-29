import { BaseColumnDefinition } from './Query/mod.ts';
import { DataTypeMap } from './DataTypes.ts';
import type { DataType } from './DataTypes.ts';
import type { GuardianProxy } from '../../guardian/mod.ts';
// import { StringGuardian } from "../../guardian/Guardians/StringGuardian.ts";

export type ModelColumnDefinition = {
  name?: string;
  notNullOnce?: boolean;
  disableUpdate?: boolean;
  // deno-lint-ignore no-explicit-any
  validation?: GuardianProxy<any>;
  // computed?: (row: Record<string, unknown>) => typeof DataTypeMap[BaseColumnDefinition['type']] | Promise<typeof DataTypeMap[BaseColumnDefinition['type']]>;
  security?: 'ENCRYPT' | 'HASH'; // encrypt will encrypt the value while hash will perform a SHA-256 on the value. NOTE, hash is one way, i.e cannot decrypt
  // decryptOnRead?: boolean; // Decrypt data on read?
  project?: boolean; // Select this column? (on select, insert and update)
} & BaseColumnDefinition;

export type ModelDefinition = {
  name: string; // Name of the model
  connection: string; // The connection config name
  schema?: string; // The schema name. This will be used as "Database" in mongodb
  table: string; // The table name
  isView?: boolean; // Is this a view? TODO - Query definition for generating views
  columns: {
    [key: string]: ModelColumnDefinition;
  };
  // TODO(@abhinav) - Not implemented
  audit?: {
    schema?: string;
    table: string;
  };
  encryptionKey?: string; // The encryption key
  primaryKeys?: Set<string>;
  uniqueKeys?: Record<string, Set<string>>;
  // Foreign keys are only used for validation. Maybe add support to fetch result from related table?
  foreignKeys?: Record<string, {
    model: string;
    relationship: Record<string, string>; // The join condition
    columns?: Set<string> | Record<string, DataType>; // The columns that are part of the foreign table (if blank, it will fetch from model)
  }>;
  permissions?: {
    select?: boolean;
    insert?: boolean;
    update?: boolean;
    delete?: boolean;
    truncate?: boolean;
  };
  pageSize?: number;
  // seedFile?: string; // When "installing" or "creating" this data will be injected into the table
};

type PartialPartial<T, K extends keyof T> =
  Partial<Pick<T, K>> & Omit<T, K> extends infer O ? { [P in keyof O]: O[P] }
    : never;

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

//// deno-lint-ignore no-explicit-any
type ExtractTypes2<T extends { [K in keyof T]: ModelColumnDefinition }> =
  PartialPartial<
    {
      -readonly [K in keyof T]: ReturnType<
        typeof DataTypeMap[T[K]['type']]
      >;
    },
    KeysMatching<T, { isNullable: true }>
  >;

type ExtractNullable<
  T extends { [K in keyof T]: ModelColumnDefinition },
  K extends keyof T,
> = Pick<
  {
    -readonly [
      // -readonly [P in keyof T]?: P extends K
      //   ? ReturnType<typeof DataTypeMap[T[P]['type']]> | null
      //   : never;
      P in keyof T
    ]?: ReturnType<typeof DataTypeMap[T[P]['type']]> | null;
  },
  K
>;

type ExtractNotNullable<
  T extends { [K in keyof T]: ModelColumnDefinition },
  K extends keyof T,
> = Omit<
  {
    -readonly [P in keyof T]: ReturnType<typeof DataTypeMap[T[P]['type']]>;
  },
  K
>;

type ExtractTypes<T extends { [K in keyof T]: ModelColumnDefinition }> =
  & ExtractNotNullable<T, KeysMatching<T, { isNullable: true }>>
  & ExtractNullable<T, KeysMatching<T, { isNullable: true }>> extends infer O
  ? { [P in keyof O]: O[P] }
  : never;

// Joins
export type ModelType<P extends ModelDefinition> = ExtractTypes<P['columns']>;

// export type ModelType<P extends ModelDefinition> = ExtractTypes<
//   {
//     [X in keyof P['columns']]: P['columns'][X];
//   }
//> //  & {
//; //   [X in keyof P['foreignKeys']]?: string
// }

export type ModelValidation<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [X in keyof T]?: string[];
};
