import {
  ColumnDefinition,
  ExpressionColumnDefinition,
} from '../columns/mod.ts';

import type {
  ForeignKeyConstraint,
  PrimaryKeyConstraint,
} from './Constraints.ts';

export type ViewDefinition =
  & {
    source?: string;
    schema?: string;
    columns: Record<string, ColumnDefinition | ExpressionColumnDefinition>;
    comment?: string;
    query?: string; // Change to select query
  }
  & ForeignKeyConstraint
  & PrimaryKeyConstraint;
