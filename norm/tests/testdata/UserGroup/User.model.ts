export const Users = {
  name: 'Users',
  schema: 'UserGroup',
  type: 'TABLE',
  columns: {
    Id: { name: 'id', type: 'UUID' },
    Name: { type: 'VARCHAR' },
    DOB: { type: 'DATE' },
    RollNo: { type: 'INTEGER' },
    Profile: {
      type: 'JSON',
      structure: { FullName: 'VARCHAR', Bio: 'VARCHAR' },
      nullable: true,
    },
  },
  primaryKeys: ['Id'],
  uniqueKeys: {
    name: ['Name'],
  },
} as const;
