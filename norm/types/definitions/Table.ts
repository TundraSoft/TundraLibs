import type { ColumnDefinition } from './column/mod.ts';
import type { ConstraintDefinition } from './Constraints.ts';
import type { Expressions, ExpressionsType } from '../../../dam/mod.ts';

export type TableDefinition = {
  schema?: string;
  name: string;
  type: 'TABLE';
  columns: Record<string, ColumnDefinition | Expressions>;
  comment?: string;
} & ConstraintDefinition;

export type ExtractColumnType<C extends ColumnDefinition | Expressions> =
  C extends ColumnDefinition ? C['type']
    : C extends Expressions ? ExpressionsType<C>
    : never;
