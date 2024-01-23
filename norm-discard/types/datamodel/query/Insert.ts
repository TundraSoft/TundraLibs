import type { BaseQuery } from './Base.ts';
import { ModelColumns, SchemaDefinition } from '../model/mod.ts';

export type InsertQuery<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = BaseQuery<S, MN> & {
  values: ModelColumns<S, MN> | Array<ModelColumns<S, MN>>;
};
