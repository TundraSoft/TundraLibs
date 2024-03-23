export const Comments = {
  name: 'Comments',
  schema: 'Blog',
  type: 'TABLE',
  columns: {
    Id: { name: 'id', type: 'UUID' },
    Content: { type: 'TEXT' },
    CreatedAt: { type: 'TIMESTAMPTZ' },
    AuthorId: { type: 'UUID' },
    PostId: { type: 'UUID' },
  },
  primaryKeys: ['Id'],
  uniqueKeys: {
    name: ['Content'],
  },
  foreignKeys: {
    Author: {
      model: 'Users',
      contains: 'SINGLE',
      relation: { AuthorId: 'Id' },
      update: 'RESTRICT',
      delete: 'RESTRICT',
    },
    Post: {
      model: 'Posts',
      contains: 'SINGLE',
      relation: { PostId: 'Id' },
      update: 'CASCADE',
      delete: 'CASCADE',
    },
  },
} as const;
