
export type RelationshipDefinition = {
  model: string;
  hasMany: boolean;
  limit?: number;
  relation: Record<string, string>;
};