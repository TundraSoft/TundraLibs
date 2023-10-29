import type { Schema, TableDefinition } from '../schema/mod.ts';
import type { BaseQuery } from './BaseQuery.ts';
import { DataTypeMap } from '../../const/mod.ts';
import type { DataType } from '../../const/mod.ts';

export type SelectQuery<
  S extends Schema = Record<string, TableDefinition>,
  T extends keyof S = keyof S,
> = BaseQuery<S, T> & {
  filter?: Record<string, unknown>;
};
