import type { BooleanColumnDefinition } from './Boolean.ts';
import type { DateColumnDefinition } from './Date.ts';
import type { NumericColumnDefinition } from './Numeric.ts';
import type { StringColumnDefinition } from './String.ts';

export type ColumnDefinition =
  | BooleanColumnDefinition
  | DateColumnDefinition
  | NumericColumnDefinition
  | StringColumnDefinition;

// Few inferred types
