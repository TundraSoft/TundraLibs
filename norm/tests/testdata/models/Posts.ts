export const Post = {
  name: 'posts',
  columns: {
    Id: {
      name: 'id',
      type: 'INTEGER',
      nullable: false,
    },
    Title: {
      name: 'title',
      type: 'VARCHAR',
      length: 100,
      nullable: false,
    },
    Content: {
      name: 'content',
      type: 'TEXT',
      nullable: false,
    },
    CreatedBy: {
      name: 'created_by',
      type: 'INTEGER',
      nullable: false,
    },
    ReviewdBy: {
      name: 'reviewed_by',
      type: 'INTEGER',
      nullable: true,
    },
    CreatedAt: {
      name: 'created_at',
      type: 'TIMESTAMP',
      nullable: false,
    },
  },
  primaryKeys: ['Id'],
  relationShips: {
    Author: {
      model: 'User',
      hasMany: false,
      relation: {
        'created_by': 'Id',
      },
    },
    Reviewer: {
      model: 'User',
      hasMany: false,
      relation: {
        'reviewed_by': 'Id',
      },
    },
  },
} as const;
