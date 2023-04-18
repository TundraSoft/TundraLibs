import { ColumnDefinition } from './mod.ts';

export type ModelPermission = {
  select: boolean;
  insert: boolean;
  update: boolean;
  delete: boolean;
  truncate: boolean;
};

// export type LinkDefinition<
//   DM extends DataModel = Record<string, never>,
//   S extends keyof DM = string,
//   D extends keyof DM = string
// > = {
//   model: D;
//   condition: Partial<
//     Record<
//       keyof DM[S]['columns'],
//       keyof DM[D]['columns']
//     >
//   >;
//   hasMany?: boolean; // Does the other table have many records or just one?
//   define?: boolean;
// };

export type LinkDefinition<
  DM extends DataModel = Record<string, never>,
  D extends keyof DM = string,
> = {
  model: string;
  condition: Record<
    string,
    string
  >;
  hasMany?: boolean; // Does the other table have many records or just one?
  define?: boolean;
};

export type PartitionTypes = 'HASH' | 'RANGE' | 'LIST';

export type PartitionDefinition = {
  type: PartitionTypes;
  column: string;
};

export type SchardingDefinition = {
  type: Omit<PartitionTypes, 'LIST'>;
  column: string;
};

export type ModelDefinition<
  M extends DataModel = Record<string, never>,
  T extends keyof M = string,
> = {
  name: T;
  connection: string;
  schema?: string;
  table: string;
  isView?: boolean;
  columns: Record<string, ColumnDefinition>;
  links?: Record<string, LinkDefinition<M, keyof M>>;
  partition?: PartitionDefinition;
  sharding?: SchardingDefinition;
  permissions?: ModelPermission;
};

export type DataModel<T extends string = string> = {
  [Key in T]: ModelDefinition<DataModel, Key>;
};

// export interface DataModel {
//   [key: string]: ModelDefinition<keyof DataModel>
// }
