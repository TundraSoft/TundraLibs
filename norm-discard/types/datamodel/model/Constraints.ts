export type PrimaryKeyConstraint = {
  primaryKey?: string[];
};

export type UniqueKeyConstraint = {
  uniqueKeys?: Record<string, string[]>;
};

type RelatedRows = 'SINGLE' | 'MULTIPLE';

type ForeignKeyDefinition = {
  model: string;
  contains: RelatedRows;
  relation: Record<string, string>;
  update?: 'CASCADE' | 'RESTRICT';
  delete?: 'CASCADE' | 'RESTRICT';
};

export type ForeignKeyConstraint = {
  foreignKeys?: Record<string, ForeignKeyDefinition>;
};

type IndexDefinition = {
  column: string;
  sort?: 'ASC' | 'DESC';
};

export type IndexConstraint = {
  indexes?: Record<string, IndexDefinition[]>;
};
