import type { ColumnDefinition } from './Column.ts';
import type { DataModel, LinkDefinition, ModelDefinition } from './Model.ts';
import { DataTypeMap } from '../DataTypes.ts';

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

export type ColumnType<K extends keyof typeof DataTypeMap> = ReturnType<
  typeof DataTypeMap[K]
>;

// Few infered types basis definition
export type PrimaryKeys<
  DM extends DataModel,
  M extends keyof DataModel,
  C extends Record<string, ColumnDefinition> = DM[M]['columns'],
> = {
  -readonly [K in keyof C as 'primaryKey' extends keyof C[K] ? K : never]:
    ColumnType<C[K]['type']>;
};

export type NonNullableColumns<
  DM extends DataModel,
  M extends keyof DataModel,
  C extends Record<string, ColumnDefinition> = DM[M]['columns'],
> = Omit<
  {
    -readonly [K in keyof C]: ColumnType<C[K]['type']>;
  },
  KeysMatching<C, { isNullable: true }>
>;

export type NullableColumns<
  DM extends DataModel,
  M extends keyof DataModel,
  C extends Record<string, ColumnDefinition> = DM[M]['columns'],
> = Pick<
  {
    -readonly [K in keyof C]?: ColumnType<C[K]['type']> | null;
  },
  KeysMatching<C, { isNullable: true }>
>;

// Relationships
export type LinkedModels<
  DM extends DataModel,
  M extends keyof DataModel,
  L extends Record<string, LinkDefinition<DM, M>>,
> = {
  -readonly [K in keyof L]?: L[K] extends { hasMany: true }
    ? BaseDataModelType<DM, L[K]['model']>[]
    : BaseDataModelType<DM, L[K]['model']>;
};

// The final Data Model
export type BaseDataModelType<DM extends DataModel, M extends keyof DataModel> =
  & NonNullableColumns<DM, M>
  & NullableColumns<DM, M> extends infer O ? { [P in keyof O]: O[P] }
  : never;

export type DataModelType<
  DM extends DataModel,
  M extends keyof DataModel,
> =
  & BaseDataModelType<DM, M>
  & LinkedModels<
    DM,
    M,
    DM[M]['links'] extends Record<string, LinkDefinition> ? DM[M]['links']
      : Record<never, never>
  > extends infer O ? { [P in keyof O]: O[P] }
  : never;
