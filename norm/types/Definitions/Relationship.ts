import type { QueryFilters } from '../mod.ts';

export type ForeignKeyDefinition = {
  table: string;
  schema?: string;
  columnMap: QueryFilters;
  onDelete?: 'RESTRICT' | 'CASCADE';
  onUpdate?: 'RESTRICT' | 'CASCADE';
  model: string;
  hasMany: boolean;
  limit?: number;
};
