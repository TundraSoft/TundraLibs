import {
  ColumnDefinition,
  DataModel,
  DataModelType,
  FilterOperators,
  LinkedModels,
  ModelDefinition,
  NonNullableColumns,
  NullableColumns,
  PrimaryKeys,
  QueryFilter,
} from './mod.ts';

const models = {
  Users: {
    name: 'Users',
    connection: 'adsf',
    table: 'Users',
    columns: {
      id: {
        type: 'INT',
        primaryKey: 1,
      },
      Name: {
        type: 'VARCHAR',
      },
      Description: {
        type: 'CHARACTER VARYING',
        isNullable: true,
      },
    },
    links: {
      UserPosts: {
        model: 'Posts',
        condition: {
          id: 'userId',
        },
        hasMany: true,
      },
    },
  },
  Posts: {
    name: 'Posts',
    connection: 'adsf',
    table: 'Posts',
    columns: {
      id: {
        type: 'SERIAL',
        primaryKey: 2,
      },
      Name: {
        type: 'VARCHAR',
        primaryKey: 1,
      },
      Description: {
        type: 'CHARACTER VARYING',
        isNullable: true,
      },
      userId: {
        type: 'INT',
      },
    },
    links: {
      Author: {
        model: 'Users',
        condition: {
          userId: 'id',
        },
        hasMany: false,
      }
    }
  },
} as const;

function validate<DM extends DataModel, M extends keyof DM>(
  model: ModelDefinition<DM, M>,
) {
}

validate(models.Posts);

type DM = DataModelType<typeof models, 'Users'>;
type DNC = NullableColumns<typeof models, 'Posts'>;
type DNNC = NonNullableColumns<typeof models, 'Posts'>;
type PK = PrimaryKeys<typeof models, 'Posts'>;
type LM = LinkedModels<typeof models, 'Posts', typeof models['Posts']['links']>;
// type LM2 = LinkedModels<
//   typeof models,
//   'Posts',
//   typeof models['Posts']['links']
// >;

type ads = QueryFilter<DM>;

const filter: QueryFilter<DM> = {
  $or: [
    { id: 1 },
    { Name: 'saddf' },
  ],
  $and: [
    { Description: { $in: ['123', 'asd'] } },
    { id: { $gt: 18 } },
    { UserPosts: { Name: 'asdf' } },
  ],
};

function generateWhereClause<T>(filter: QueryFilter<T> | undefined): string {
  const clauses: string[] = [];
  if (!filter) {
    return '';
  }
  for (const key in filter) {
    if (key === '$or') {
      const orClauses = (Array.isArray(filter.$or) ? filter.$or : [filter.$or])
        .map(generateWhereClause)
        .join(' OR ');
      if (orClauses.length > 0) {
        clauses.push(`(${orClauses})`);
      }
    } else if (key === '$and') {
      const andClauses =
        (Array.isArray(filter.$and) ? filter.$and : [filter.$and])
          .map(generateWhereClause)
          .join(' AND ');
      if (andClauses.length > 0) {
        clauses.push(`(${andClauses})`);
      }
    } else {
      const value = filter[key as keyof T];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        for (const subKey in value) {
          const subValue = value[subKey];
          if (typeof subValue === 'object' && !Array.isArray(subValue)) {
            const operator = Object.keys(subValue)[0];
            const condition = Object.values(subValue)[0];
            clauses.push(`${key}.${subKey} ${operator} ${JSON.stringify(condition)}`);
          } else {
            clauses.push(`${key}.${subKey} = ${JSON.stringify(subValue)}`);
          }
        }
      } else {
        clauses.push(`${key} = ${JSON.stringify(value)}`);
      }
    }
  }

  return clauses.join(' AND ');
}

console.log(generateWhereClause(filter));
