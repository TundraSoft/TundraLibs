import type { DataType } from '../DataTypes.ts';

export type ColumnLengthDefinition = {
  precision?: number;
  scale?: number;
};

export type ColumnSecurity = 'ENCRYPT' | 'HASH';

export type KeyDefinition = {
  name: string;
  position: number;
};

export type ColumnDefinition = {
  name?: string;
  type: DataType;
  length?: ColumnLengthDefinition;
  position?: number;
  primaryKey?: number;
  uniqueKey?: KeyDefinition;
  validation?: string;
  defaults?: {
    insert?: string;
    update?: string;
  };
  isNullable?: boolean;
  notNullOnce?: boolean;
  security?: ColumnSecurity;
  disableUpdate?: boolean;
  project?: boolean;
  comment?: string;
};
