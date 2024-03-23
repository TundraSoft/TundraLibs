export const Posts = {
  name: 'Posts',
  schema: 'Blog',
  type: 'TABLE',
  columns: {
    Id: { name: 'id', type: 'UUID' },
    Title: { type: 'VARCHAR', length: [100], nullable: false },
    Slug: { type: 'VARCHAR', length: [100], nullable: false },
    MetaData: {
      type: 'JSON',
      structure: { keywords: 'VARCHAR', description: 'VARCHAR' },
    },
    Content: { type: 'TEXT' },
    Published: { type: 'BOOLEAN', defaults: { insert: false } },
    CreatedAt: { type: 'TIMESTAMPTZ' },
    UpdatedAt: { type: 'TIMESTAMPTZ' },
    AuthorId: { type: 'UUID' },
  },
  primaryKeys: ['Id'],
  uniqueKeys: {
    name: ['Title', 'Slug'],
  },
  foreignKeys: {
    Author: {
      model: 'Users',
      contains: 'SINGLE',
      relation: { AuthorId: 'Id' },
      update: 'RESTRICT',
      delete: 'RESTRICT',
    },
    Comments: {
      model: 'Comments',
      contains: 'MULTIPLE',
      relation: { Id: 'PostId' },
      update: 'CASCADE',
      delete: 'CASCADE',
    },
  },
} as const;
