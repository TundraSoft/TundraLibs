import {
  ColumnDefinition,
  DataModel,
  DataModelType,
  LinkedModels,
  ModelDefinition,
  NonNullableColumns,
  NullableColumns,
  PrimaryKeys,
  QueryFilter, 
  FilterOperators
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
      },
      Name: {
        type: 'VARCHAR',
      },
      Description: {
        type: 'CHARACTER VARYING',
        isNullable: true,
      },
      userId: {
        type: 'INT',
      },
    },
    // links: {}
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
    { Description: { $in: ['123', 'asd']} },
    { id: { $gt: 18 } }
  ]
};

function generateWhereClause<T>(filter: QueryFilter<T>): string {
  const clauses: string[] = [];

  for (const key in filter) {
    if (key === '$or') {
      const orClauses = (Array.isArray(filter.$or) ? filter.$or : [filter.$or])
        .map(generateWhereClause)
        .join(' OR ');
      if (orClauses.length > 0) {
        clauses.push(`(${orClauses})`);
      }
    } else if (key === '$and') {
      const andClauses = (Array.isArray(filter.$and) ? filter.$and : [filter.$and])
        .map(generateWhereClause)
        .join(' AND ');
      if (andClauses.length > 0) {
        clauses.push(`(${andClauses})`);
      }
    } else {
      const value = filter[key as keyof T];
      if (value !== null && typeof value === 'object') {
        const operator = Object.keys(value)[0];
        const condition = Object.values(value)[0];
        if (operator === '$in' || operator === '$nin') {
          clauses.push(`${key} ${operator} (${condition.map((c: any) => JSON.stringify(c)).join(', ')})`);
        } else if (operator === '$gt' || operator === '$gte' || operator === '$lt' || operator === '$lte') {
          clauses.push(`${key} ${operator} ${JSON.stringify(condition)}`);
        } else {
          clauses.push(`${key} = ${JSON.stringify(condition)}`);
        }
      } else {
        clauses.push(`${key} = ${JSON.stringify(value)}`);
      }
    }
  }

  return clauses.join(' AND ');
}

console.log(generateWhereClause(filter))