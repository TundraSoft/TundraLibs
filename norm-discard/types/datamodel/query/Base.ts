import { ExpressionColumnDefinition } from '../columns/mod.ts';
import { SchemaDefinition } from '../model/mod.ts';

export type BaseQuery<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  source: S[MN] extends { schema: string } ? [S[MN]['schema'], S[MN]['source']]
    : [S[MN]['source']];
  columns: {
    [C in keyof S[MN]['columns']]: S[MN]['columns'] extends
      ExpressionColumnDefinition ? S[MN]['columns']
      : S[MN]['columns'][C] extends { name: string }
        ? S[MN]['columns'][C]['name']
      : C;
  };
};
