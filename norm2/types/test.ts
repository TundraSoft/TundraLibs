import {
  ColumnDefinition,
  DataModel,
  DataModelType,
  LinkedModels,
  ModelDefinition,
  NonNullableColumns,
  NullableColumns,
  PrimaryKeys,
  QueryFilter
} from './mod.ts';

const models = {
  Users: {
    name: 'Users',
    connection: 'adsf',
    table: 'Users',
    columns: {
      id: {
        type: 'BIGSERIAL',
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
        type: 'BIGINT',
      },
    },
  },
} as const;

function validate<DM extends DataModel, M extends keyof DM>(
  model: ModelDefinition<DM, M>,
) {
}

validate(models.Posts);

type DM = DataModelType<typeof models, 'Users'>;
type DNC = NullableColumns<typeof models, 'Users'>;
type DNNC = NonNullableColumns<typeof models, 'Users'>;
type PK = PrimaryKeys<typeof models, 'Users'>;
type LM = LinkedModels<typeof models, 'Users', typeof models['Users']['links']>;
// type LM2 = LinkedModels<
//   typeof models,
//   'Posts',
//   typeof models['Posts']['links']
// >;

type checkArray<T extends Record<string, unknown>> = {
  [Property in keyof T]?: T[Property] extends Record<string, unknown> ? 'Y' : 'N'
}

const a: checkArray<DM> = {
  UserPosts: 'N'
}
const filter: QueryFilter<DM> = {
  id: 34234234n, 
  UserPosts: {
    'UserPosts.id': { $in: [1324234n]}
  }
}