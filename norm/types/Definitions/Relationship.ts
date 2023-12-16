export type ForeignKeyDefinition = {
  table: string;
  schema?: string;
  columnMap: Record<string, string>;
  onDelete?: 'RESTRICT' | 'CASCADE';
  onUpdate?: 'RESTRICT' | 'CASCADE';
  model: string;
  hasMany: boolean;
  limit?: number;
};
