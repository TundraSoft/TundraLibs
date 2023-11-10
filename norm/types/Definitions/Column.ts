import type { DataType } from '../../const/mod.ts';
import { DataTypeMap } from '../../const/mod.ts';

export type ColumnLengthDefinition = number | {
  precision: number;
  scale: number;
};

export type ColumnDefinition = {
  name: string;
  type: DataType;
  length?: ColumnLengthDefinition;
  nullable?: boolean;
  defaults?: {
    insert: unknown;
    update: unknown;
  };
  comments?: string;
  security?: 'ENCRYPT' | 'HASH';
};

export type ColumnType<DT extends DataType> = ReturnType<
  typeof DataTypeMap[DT]
>;
