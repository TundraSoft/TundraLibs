export const DataModel = {
  'Users': {
    'name': 'Users',
    'schema': 'UserGroup',
    'type': 'TABLE',
    'columns': {
      'Id': {
        'name': 'id',
        'type': 'UUID',
      },
      'Name': {
        'type': 'VARCHAR',
      },
      'DOB': {
        'type': 'DATE',
      },
      'RollNo': {
        'type': 'INTEGER',
      },
      'Profile': {
        'type': 'JSON',
        'structure': {
          'FullName': 'VARCHAR',
          'Bio': 'VARCHAR',
        },
        'nullable': true,
      },
    },
    'primaryKeys': [
      'Id',
    ],
    'uniqueKeys': {
      'name': [
        'Name',
      ],
    },
  },
  'Groups': {
    'name': 'Groups',
    'schema': 'UserGroup',
    'type': 'TABLE',
    'columns': {
      'Id': {
        'name': 'id',
        'type': 'UUID',
      },
      'Name': {
        'type': 'VARCHAR',
      },
    },
    'primaryKeys': [
      'Id',
    ],
    'uniqueKeys': {
      'name': [
        'Name',
      ],
    },
  },
  'UserGroup': {
    'name': 'UserGroup',
    'schema': 'UserGroup',
    'type': 'TABLE',
    'columns': {
      'Id': {
        'name': 'id',
        'type': 'UUID',
      },
      'GroupId': {
        'type': 'UUID',
      },
      'UserId': {
        'type': 'UUID',
      },
    },
    'primaryKeys': [
      'Id',
    ],
    'uniqueKeys': {
      'UserGroup': [
        'GroupId',
        'UserId',
      ],
    },
    'foreignKeys': {
      'Group': {
        'model': 'Groups',
        'contains': 'SINGLE',
        'relation': {
          'GroupId': 'Id',
        },
        'update': 'RESTRICT',
        'delete': 'RESTRICT',
      },
      'User': {
        'model': 'Users',
        'contains': 'SINGLE',
        'relation': {
          'UserId': 'Id',
        },
        'update': 'RESTRICT',
        'delete': 'RESTRICT',
      },
    },
  },
  'Comments': {
    'name': 'Comments',
    'schema': 'Blog',
    'type': 'TABLE',
    'columns': {
      'Id': {
        'name': 'id',
        'type': 'UUID',
      },
      'Content': {
        'type': 'TEXT',
      },
      'CreatedAt': {
        'type': 'TIMESTAMPTZ',
      },
      'AuthorId': {
        'type': 'UUID',
      },
      'PostId': {
        'type': 'UUID',
      },
    },
    'primaryKeys': [
      'Id',
    ],
    'uniqueKeys': {
      'name': [
        'Content',
      ],
    },
    'foreignKeys': {
      'Author': {
        'model': 'Users',
        'contains': 'SINGLE',
        'relation': {
          'AuthorId': 'Id',
        },
        'update': 'RESTRICT',
        'delete': 'RESTRICT',
      },
      'Post': {
        'model': 'Posts',
        'contains': 'SINGLE',
        'relation': {
          'PostId': 'Id',
        },
        'update': 'CASCADE',
        'delete': 'CASCADE',
      },
    },
  },
  'Posts': {
    'name': 'Posts',
    'schema': 'Blog',
    'type': 'TABLE',
    'columns': {
      'Id': {
        'name': 'id',
        'type': 'UUID',
      },
      'Title': {
        'type': 'VARCHAR',
        'length': [
          100,
        ],
        'nullable': false,
      },
      'Slug': {
        'type': 'VARCHAR',
        'length': [
          100,
        ],
        'nullable': false,
      },
      'MetaData': {
        'type': 'JSON',
        'structure': {
          'keywords': 'VARCHAR',
          'description': 'VARCHAR',
        },
      },
      'Content': {
        'type': 'TEXT',
      },
      'Published': {
        'type': 'BOOLEAN',
        'defaults': {
          'insert': false,
        },
      },
      'CreatedAt': {
        'type': 'TIMESTAMPTZ',
      },
      'UpdatedAt': {
        'type': 'TIMESTAMPTZ',
      },
      'AuthorId': {
        'type': 'UUID',
      },
    },
    'primaryKeys': [
      'Id',
    ],
    'uniqueKeys': {
      'name': [
        'Title',
        'Slug',
      ],
    },
    'foreignKeys': {
      'Author': {
        'model': 'Users',
        'contains': 'SINGLE',
        'relation': {
          'AuthorId': 'Id',
        },
        'update': 'RESTRICT',
        'delete': 'RESTRICT',
      },
      'Comments': {
        'model': 'Comments',
        'contains': 'MULTIPLE',
        'relation': {
          'Id': 'PostId',
        },
        'update': 'CASCADE',
        'delete': 'CASCADE',
      },
    },
  },
} as const;
