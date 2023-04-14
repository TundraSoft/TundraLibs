import type { BaseColumnDefinition } from './Query/mod.ts';
import { DataTypeMap } from './DataTypes.ts';
import type { GuardianProxy } from '../../guardian/mod.ts';

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

export type ForeignKeyDefinition<T extends string = string> = {
  model: T;
  relationship: Record<string, string>;
  hasMany: boolean;
};

export type PermissionDefinition = {
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  truncate: boolean;
};

export type ModelDefinition<T extends string = string> = {
  name: string; // Name of the model ! NOT REQUIRED. Model name will be Schema.Table
  connection: string; // The connection config name
  schema?: string; // The schema name. This will be used as "Database" in mongodb
  table: string; // The table name
  isView?: boolean; // Is this a view? TODO - Query definition for generating views
  columns: Record<string, ModelColumnDefinition>;
  // Audit table will simply insert data in a seperate table when data is inserted, updated or deleted in main
  // TODO(@abhinav) - Not implemented
  audit?: {
    schema?: string;
    table: string;
  };
  primaryKeys?: Set<string>;
  uniqueKeys?: Record<string, Set<string>>;
  // Foreign keys are only used for validation. Maybe add support to fetch result from related table?
  foreignKeys?: Record<string, ForeignKeyDefinition<T>>;
  permissions?: PermissionDefinition;
  partition?: Set<string>;
  sharding?: Set<string>;
  pageSize?: number;
};

//#region Type extraction
type PartialPartial<T, K extends keyof T> =
  Partial<Pick<T, K>> & Omit<T, K> extends infer O ? { [P in keyof O]: O[P] }
    : never;

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

type ExtractNullable<
  T extends { [K in keyof T]: ModelColumnDefinition },
  K extends keyof T,
> = Pick<
  {
    -readonly [
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

//#endregion Type Extraction
type Models<T extends string = string> = {
  [Key in T]: ModelDefinition<T>;
};

export type ColumnTypes<M extends Models, P extends ModelDefinition> =
  ExtractTypes<P['columns']>;

// export type TypedModels<M extends Models> = {
//   -readonly [K in keyof M]: ColumnTypes<M[K]> & Related<M, M[K]['foreignKeys']>
// }

export type Related<
  M extends Models,
  K extends Record<string, ForeignKeyDefinition> | unknown,
> = K extends undefined ? never
  : {
    -readonly [FK in keyof K]?: 'model' extends keyof K[FK]
      ? K[FK] extends { hasMany: true } ? ColumnTypes<M, M[K[FK]['model']]>[]
      : ColumnTypes<M, M[K[FK]['model']]>
      : never;
  };

// export type Related<M extends Models, K extends Record<string, ForeignKeyDefinition> | undefined> = K extends undefined
//   ? never
//   : {
//       -readonly [FK in keyof K]?: 'model' extends keyof K[FK]
//         ? K[FK]['relationship'] extends {[key: string]: infer R}
//           ? keyof R extends never
//             ? ColumnTypes<M, M[K[FK]['model']]>
//             : ColumnTypes<M, M[K[FK]['model']][R[keyof R]]>[]
//           : never
//         : never;
//     };

export type TypedModels<M extends Models> = {
  -readonly [K in keyof M]:
    & ColumnTypes<M, M[K]>
    & Related<M, M[K]['foreignKeys']>;
};

export type ModelType<P extends ModelDefinition> = ExtractTypes<P['columns']>;

export type ModelValidation<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [X in keyof T]?: string[];
};
