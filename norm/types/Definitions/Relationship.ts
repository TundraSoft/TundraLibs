export type ForeignKeyDefinition = {
    table: string;
    schema?: string;
    columnMap: Record<string, string>;
    onDelete?: 'RESTRICT' | 'CASCADE';
    onUpdate?: 'RESTRICT' | 'CASCADE';
};

export type RelationshipDefinition = {
  model: string;
  hasMany: boolean;
  limit?: number;
  relation: Record<string, string>;
};
