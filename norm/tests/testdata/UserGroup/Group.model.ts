export const Groups = {
  name: 'Groups',
  schema: 'UserGroup',
  type: 'TABLE',
  columns: {
    Id: { name: 'id', type: 'UUID' },
    Name: { type: 'VARCHAR' },
  },
  primaryKeys: ['Id'],
  uniqueKeys: {
    name: ['Name'],
  },
} as const;
