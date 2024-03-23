import { ColumnDefinition } from './column/mod.ts';
import type { Expressions } from '../../../dam/mod.ts';
import type { ForeignKeyConstraint } from './Constraints.ts';

export type ViewDefinition =
  & {
    schema?: string;
    name: string;
    type: 'VIEW';
    create?: boolean;
    materialized?: boolean;
    columns: Record<string, ColumnDefinition | Expressions>;
    comment?: string;
    query?: string; // Change to select query
  }
  & ForeignKeyConstraint;

// export type QueryDefinition =
//   & {
//     schema?: string;
//     name: string;
//     type: 'QUERY';
//     columns: Record<string, ColumnDefinition | Expressions>;
//     comment?: string;
//     query?: string; // Change to select query
//   }
//   & ForeignKeyConstraint;
