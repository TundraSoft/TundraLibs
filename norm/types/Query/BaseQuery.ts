import type { Schema, TableDefinition } from '../schema/mod.ts';

export type BaseQuery<
  S extends Schema = Record<string, TableDefinition>,
  T extends keyof S = keyof S,
> = {
  schema?: S[T]['schema'];
  table: S[T]['name'];
  // Column will be record of alias: column name. From Schema[K]['columns']
  columns: {
    [C in keyof S[T]['columns']]: S[T]['columns'][C]['name'];
  };
  project?: {
    [alias: string]: boolean; // Add support for computed columns
  };
};
