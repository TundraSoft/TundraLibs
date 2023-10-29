import type { Schema, TableDefinition } from '../schema/mod.ts';
import type { BaseQuery } from './BaseQuery.ts';
import type { FilterOperators } from './FilterOperators.ts';

export type DeleteQuery<
  S extends Schema = Record<string, TableDefinition>,
  T extends keyof S = keyof S,
> = BaseQuery<S, T> & {
  filter?: FilterOperators<S[T]>;
};
