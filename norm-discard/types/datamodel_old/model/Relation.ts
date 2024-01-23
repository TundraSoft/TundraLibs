type RelationType = 'SINGLE' | 'MULTIPLE';

export type RelationDefinition = {
  model: string;
  type: RelationType;
  relation: Record<string, string>;
  update?: 'CASCADE' | 'RESTRICT';
  delete?: 'CASCADE' | 'RESTRICT';
};
