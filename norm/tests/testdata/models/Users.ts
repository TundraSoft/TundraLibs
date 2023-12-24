export const User = {
  name: 'users',
  schema: 'User2',
  columns: {
    Id: {
      name: 'id',
      type: 'INTEGER',
    },
    Name: {
      name: 'name',
      type: 'VARCHAR',
      length: 100,
      notNull: true,
    },
    Email: {
      name: 'email_address',
      type: 'VARCHAR',
      length: 255,
      nullable: false,
    },
    Password: {
      name: 'password',
      type: 'TEXT',
      nullable: true,
    },
    CreatedAt: {
      name: 'created_at',
      type: 'TIMESTAMP',
      nullable: false,
    },
  },
  primaryKeys: ['Id'],
} as const;
