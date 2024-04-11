import type { ColumnDefinition, SchemaDefinition } from './types/mod.ts';
import {
  DataTypeNames,
  ExpressionNames,
  type Expressions,
} from '../dam/mod.ts';

const isValidModelName = (name: string) => {
  return /^[a-z][a-z0-9]*$/i.test(name);
};

const isValidDBObjectName = (name: string) => {
  return /^[a-z][a-z0-9\_\-]*$/i.test(name);
};

const validateColumn = (
  column: ColumnDefinition,
  columnName: string,
  model: string,
) => {
  const {
    name,
    type,
    nullable,
    length,
    defaults,
    lov,
    range,
    pattern,
  } = {
    ...{
      length: undefined,
      defaults: undefined,
      lov: undefined,
      range: undefined,
      pattern: undefined,
    },
    ...(column as ColumnDefinition),
  };
  if (name && !isValidDBObjectName(name)) {
    throw new Error(`Column "${columnName}" name "${name}" is invalid`);
  }
  if (!type) {
    throw new Error(`Column "${columnName}" does not have a type`);
  }
  if (!DataTypeNames.includes(type)) {
    throw new Error(`Column "${columnName}" type is invalid`);
  }
  // if(column.type === 'JSON' && column.structure) {
  //   Object.entries(column.structure).forEach(([subColumnName, subColumnType]) => {
  //     if(!isValidDBObjectName(subColumnName)) {
  //       throw new Error(`Column "${columnName}" structure name "${subColumnName}" is invalid`);
  //     }
  //     if(!['UUID', 'VARCHAR', 'TEXT', 'INTEGER', 'BOOLEAN', 'DATE', 'TIMESTAMPTZ'].includes(subColumnType)) {
  //       throw new Error(`Column "${columnName}" structure type "${subColumnType}" is invalid`);
  //     }
  //   });
  // }
  // Length validation
  if (length) {
    if (!Array.isArray(length)) {
      throw new Error(`Column "${columnName}" length is invalid`);
    }
    if (length.length !== 1 && length.length !== 2) {
      throw new Error(`Column "${columnName}" length is invalid`);
    }
    if (length.length === 2 && length[0] > length[1]) {
      throw new Error(`Column "${columnName}" length is invalid`);
    }
    if (length.length === 2) {
      if (
        !['NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'REAL'].includes(
          type,
        )
      ) {
        throw new Error(`Column "${columnName}" length is invalid`);
      }
    }
    // @TODO - Check if type is correct
  }
  // Defaults validation
  if (defaults) {
    if (defaults.insert) {
      // Can be value or expression. If expression, it cannot contain column names (Insert limitation)
    }
    if (defaults.update) {
      // Can be value or expression. Can contain column names but not of joins
    }
  }
  // LOV validation
  if (lov) {
    if (!Array.isArray(lov)) {
      throw new Error(`Column "${columnName}" LOV is invalid`);
    }
    if (lov.length === 0) {
      throw new Error(`Column "${columnName}" LOV is invalid`);
    }
    // @TODO - Check if type is correct
  }
  // Range validation
  if (range) {
    if (!Array.isArray(range)) {
      throw new Error(`Column "${columnName}" range is invalid`);
    }
    if (range.length !== 2) {
      throw new Error(`Column "${columnName}" range is invalid`);
    }
    if (range[0] > range[1]) {
      throw new Error(`Column "${columnName}" range is invalid`);
    }
    // @TODO - Check if type is correct
  }
  // Pattern validation
  if (pattern) {
    // Check if string is valid regex
    try {
      new RegExp(pattern);
    } catch {
      throw new Error(`Column "${columnName}" pattern is invalid`);
    }
  }
};

const validateTable = (schema: SchemaDefinition, modelName: string) => {
};

// Validates a model and ensures that it is correct
export const validateModel = (schema: SchemaDefinition) => {
  Object.entries(schema).forEach(([modelName, model]) => {
    if (!isValidModelName(modelName)) {
      throw new Error(`Model name "${modelName}" is invalid`);
    }
    if (!model.name) {
      throw new Error(`Model "${modelName}" does not have a name`);
    }
    if (!isValidDBObjectName(model.name)) {
      throw new Error(`Model name "${model.name}" is invalid`);
    }
    if (model.schema && !isValidDBObjectName(model.schema)) {
      throw new Error(`Schema name "${model.schema}" is invalid`);
    }
    if (!model.type) {
      throw new Error(`Model "${modelName}" does not have a type`);
    }
    if (!['TABLE', 'VIEW'].includes(model.type)) {
      throw new Error(`Model "${modelName}" type is invalid`);
    }
    if (model.type === 'TABLE') {
      if (!model.columns) {
        throw new Error(`Model "${modelName}" does not have columns`);
      }
      Object.entries(model.columns).forEach(([columnName, column]) => {
        if (!isValidModelName(columnName)) {
          throw new Error(`Column name "${columnName}" is invalid`);
        }
        // Expression & Normal column
        if (Object.keys(column).includes('$expr')) {
          // Expression

          const { $expr, $args } = {
            ...{ $args: undefined },
            ...(column as Expressions),
          };
          if (!$expr) {
            throw new Error(
              `Column "${columnName}" does not have an expression`,
            );
          }
          if (!ExpressionNames.includes($expr)) {
            throw new Error(`Column "${columnName}" expression is invalid`);
          }
          if ($args) {
          }
        } else {
          const {
            name,
            type,
            nullable,
            length,
            defaults,
            lov,
            range,
            pattern,
          } = {
            ...{
              length: undefined,
              defaults: undefined,
              lov: undefined,
              range: undefined,
              pattern: undefined,
            },
            ...(column as ColumnDefinition),
          };
          if (name && !isValidDBObjectName(name)) {
            throw new Error(`Column "${columnName}" name "${name}" is invalid`);
          }
          if (!type) {
            throw new Error(`Column "${columnName}" does not have a type`);
          }
          if (!DataTypeNames.includes(type)) {
            throw new Error(`Column "${columnName}" type is invalid`);
          }
          // if(column.type === 'JSON' && column.structure) {
          //   Object.entries(column.structure).forEach(([subColumnName, subColumnType]) => {
          //     if(!isValidDBObjectName(subColumnName)) {
          //       throw new Error(`Column "${columnName}" structure name "${subColumnName}" is invalid`);
          //     }
          //     if(!['UUID', 'VARCHAR', 'TEXT', 'INTEGER', 'BOOLEAN', 'DATE', 'TIMESTAMPTZ'].includes(subColumnType)) {
          //       throw new Error(`Column "${columnName}" structure type "${subColumnType}" is invalid`);
          //     }
          //   });
          // }
          // Length validation
          if (length) {
            if (!Array.isArray(length)) {
              throw new Error(`Column "${columnName}" length is invalid`);
            }
            if (length.length !== 1 && length.length !== 2) {
              throw new Error(`Column "${columnName}" length is invalid`);
            }
            if (length.length === 2 && length[0] > length[1]) {
              throw new Error(`Column "${columnName}" length is invalid`);
            }
            if (length.length === 2) {
              if (
                !['NUMERIC', 'DECIMAL', 'FLOAT', 'DOUBLE', 'REAL'].includes(
                  type,
                )
              ) {
                throw new Error(`Column "${columnName}" length is invalid`);
              }
            }
            // @TODO - Check if type is correct
          }
          // Defaults validation
          if (defaults) {
            if (defaults.insert) {
              // Can be value or expression. If expression, it cannot contain column names (Insert limitation)
            }
            if (defaults.update) {
              // Can be value or expression. Can contain column names but not of joins
            }
          }
          // LOV validation
          if (lov) {
            if (!Array.isArray(lov)) {
              throw new Error(`Column "${columnName}" LOV is invalid`);
            }
            if (lov.length === 0) {
              throw new Error(`Column "${columnName}" LOV is invalid`);
            }
            // @TODO - Check if type is correct
          }
          // Range validation
          if (range) {
            if (!Array.isArray(range)) {
              throw new Error(`Column "${columnName}" range is invalid`);
            }
            if (range.length !== 2) {
              throw new Error(`Column "${columnName}" range is invalid`);
            }
            if (range[0] > range[1]) {
              throw new Error(`Column "${columnName}" range is invalid`);
            }
            // @TODO - Check if type is correct
          }
          // Pattern validation
          if (pattern) {
            // Check if string is valid regex
            try {
              new RegExp(pattern);
            } catch {
              throw new Error(`Column "${columnName}" pattern is invalid`);
            }
          }

          // Misc validations
          if (nullable) {
            // Check if it is part of PK, if so throw error
            if (model.primaryKeys && model.primaryKeys.includes(columnName)) {
              throw new Error(
                `Column "${columnName}" is part of primary key and cannot be nullable`,
              );
            }
          }
        }
      });
    }

    //#region Constraints
    //#region Relationships
    if (model.foreignKeys) {
      Object.entries(model.foreignKeys).forEach(
        ([foreignKeyName, foreignKeyRelation]) => {
          if (!isValidModelName(foreignKeyName)) {
            throw new Error(`Foreign key name "${foreignKeyName}" is invalid`);
          }
          if (!foreignKeyRelation.model) {
            throw new Error(
              `Foreign key "${foreignKeyName}" does not have a model`,
            );
          }
          if (!schema[foreignKeyRelation.model]) {
            throw new Error(
              `Foreign key "${foreignKeyName}" model "${foreignKeyRelation.model}" does not exist`,
            );
          }
          if (!foreignKeyRelation.contains) {
            throw new Error(
              `Foreign key "${foreignKeyName}" does not have a contains`,
            );
          }
          if (!['SINGLE', 'MULTIPLE'].includes(foreignKeyRelation.contains)) {
            throw new Error(
              `Foreign key "${foreignKeyName}" contains is invalid`,
            );
          }
          if (!foreignKeyRelation.relation) {
            throw new Error(
              `Foreign key "${foreignKeyName}" does not have a relation`,
            );
          }
          Object.entries(foreignKeyRelation.relation).forEach(
            ([localColumn, foreignColumn]) => {
              if (!model.columns[localColumn]) {
                throw new Error(
                  `Foreign key "${foreignKeyName}" local column "${localColumn}" does not exist`,
                );
              }
              if (!schema[foreignKeyRelation.model].columns[foreignColumn]) {
                throw new Error(
                  `Foreign key "${foreignKeyName}" foreign column "${foreignColumn}" does not exist`,
                );
              }
            },
          );
        },
      );
    }
    //#endregion Relationships
    //#endregion Constraints
  });
};

validateModel({
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
        'lov': ['ADMIN', 'USER', 'GUEST'],
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
        'pattern': '/^[a-zA-Z0-9 ]*$/i',
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
});
