import type { Schema, TableDefinition } from '../schema/mod.ts';
import type { BaseQuery } from './BaseQuery.ts';
import { DataTypeMap } from '../../const/mod.ts';
import type { DataType } from '../../const/mod.ts';

export type InsertQuery<
  S extends Schema = Record<string, TableDefinition>,
  T extends keyof S = keyof S,
> = BaseQuery<S, T> & {
  values: {
    [C in keyof S[T]['columns']]?: S[T]['columns'][C] extends { type: DataType }
      ? ReturnType<typeof DataTypeMap[S[T]['columns'][C]['type']]>
      : unknown;
  }[];
};
