import { ColumnDefinition } from '../columns/mod.ts';
import { RelationDefinition } from './Relation.ts';
import { IndexDefinition } from './Index.ts';

export type TableDefinition = {
  source: string[];
  columns: Record<string, ColumnDefinition>;
  primaryKey?: string[];
  uniqueKeys?: Record<string, string[]>;
  foreignKeys?: Record<string, RelationDefinition>;
  indexes?: Record<string, IndexDefinition[]>;
  distribute?: string[]; // Only in citus and mongodb
  partition?: {
    type: 'RANGE' | 'LIST' | 'HASH';
    columns: string[];
  };
  comment?: string;
};
