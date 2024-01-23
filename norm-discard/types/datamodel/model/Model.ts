import {
  ColumnDefinition,
  ExpressionColumnDefinition,
} from '../columns/mod.ts';
import {
  ForeignKeyConstraint,
  IndexConstraint,
  PrimaryKeyConstraint,
  UniqueKeyConstraint,
} from './Constraints.ts';

export type ModelDefinition =
  & {
    source?: string;
    schema?: string;
    columns: Record<string, ColumnDefinition | ExpressionColumnDefinition>;
    distribute?: string[]; // Only in citus and mongodb
    partition?: {
      type: 'RANGE' | 'LIST' | 'HASH';
      columns: string[];
    };
    comment?: string;
  }
  & ForeignKeyConstraint
  & PrimaryKeyConstraint
  & UniqueKeyConstraint
  & IndexConstraint;
