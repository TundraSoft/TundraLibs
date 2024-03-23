export const UserGroup = {
  name: 'UserGroup',
  schema: 'UserGroup',
  type: 'TABLE',
  columns: {
    Id: { name: 'id', type: 'UUID' },
    GroupId: { type: 'UUID' },
    UserId: { type: 'UUID' },
  },
  primaryKeys: ['Id'],
  uniqueKeys: {
    UserGroup: ['GroupId', 'UserId'],
  },
  foreignKeys: {
    Group: {
      model: 'Groups',
      contains: 'SINGLE',
      relation: { GroupId: 'Id' },
      update: 'RESTRICT',
      delete: 'RESTRICT',
    },
    User: {
      model: 'Users',
      contains: 'SINGLE',
      relation: { UserId: 'Id' },
      update: 'RESTRICT',
      delete: 'RESTRICT',
    },
  },
} as const;
