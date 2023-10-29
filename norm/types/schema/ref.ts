const Users = {
  name: 'users',
  schema: 'UserGroupManagement',
  columns: {
    Id: {
      name: 'id',
      type: 'SERIAL',
      nullable: false,
    },
    Name: {
      name: 'name',
      type: 'VARCHAR',
      nullable: false,
      length: 255,
    },
    Email: {
      name: 'email',
      type: 'VARCHAR',
      nullable: false,
      length: 255,
    },
    Password: {
      name: 'password',
      type: 'VARCHAR',
      nullable: false,
      length: 255,
    },
    JoinDate: {
      name: 'JoinDate',
      type: 'TIMESTAMP',
      nullable: false,
      default: {
        insert: 'CURRENT_TIMESTAMP',
      },
    },
    LastUpdatedOn: {
      name: 'UpdatedDate',
      type: 'TIMESTAMP_Z',
      nullable: true,
      default: {
        update: 'CURRENT_TIMESTAMP',
      },
    },
    Active: {
      name: 'enabled',
      type: 'BOOLEAN',
      nullable: false,
      default: {
        insert: true,
      },
    },
  },
  primaryKeys: ['Id'],
  uniqueKeys: {
    'UserEmail': ['Email'],
    'Name': ['Name'],
  },
  relations: {
    Posts: {
      model: 'Posts',
      hasMany: true,
      limit: 10,
      relationShip: {
        Id: 'UserId',
      },
    },
  },
} as const;

const Posts = {
  name: 'users',
  schema: 'UserGroupManagement',
  columns: {
    Id: {
      name: 'id',
      type: 'SERIAL',
      nullable: false,
    },
    Title: {
      name: 'name',
      type: 'VARCHAR',
      nullable: false,
      length: 255,
    },
    Content: {
      name: 'email',
      type: 'VARCHAR',
      nullable: false,
      length: 255,
    },
    UserId: {
      name: 'UserId',
      type: 'INT',
      nullable: false,
    },
    CreatedDate: {
      name: 'CreatedDate',
      type: 'TIMESTAMP',
      nullable: false,
      default: {
        insert: 'CURRENT_TIMESTAMP',
      },
    },
    PostDate: {
      name: 'PostDate',
      type: 'TIMESTAMP_Z',
      nullable: true,
    },
  },
  primaryKeys: ['Id'],
  uniqueKeys: {
    'Title': ['Title'],
  },
  relations: {
    Author: {
      model: 'Users',
      hasMany: false,
      relationShip: {
        UserId: 'Id',
      },
    },
  },
} as const;

const Schema = {
  Users: Users,
  Posts: Posts,
} as const;

console.log(Schema);

// Ok now we can generate the types
import type { DataType } from '../../const/mod.ts';
import { DataTypeMap } from '../../const/mod.ts';

//#region Result & Schema
type DeepWriteable<T> = { -readonly [P in keyof T]: DeepWriteable<T[P]> };

type ColumnDefinition = {
  name: string;
  type: DataType;
  nullable: boolean;
  length?: number;
  default?: {
    insert?: string | number | boolean;
    update?: string | number | boolean;
  };
};

type ModelRelationship = {
  model: string;
  hasMany: boolean;
  limit?: number;
  relationShip: Record<string, string>;
};

type ModelDefinition = {
  name: string;
  schema?: string;
  columns: Record<string, ColumnDefinition>;
  primaryKeys: string[];
  uniqueKeys: Record<string, string[]>;
  relations: Record<string, ModelRelationship>;
};

type DataModels = Record<string, ModelDefinition>;

type ModelColumnType<DT extends DataType> = ReturnType<typeof DataTypeMap[DT]>;

type ModelPrimaryKey<M extends ModelDefinition> = Extract<
  keyof M['columns'],
  M['primaryKeys'][number]
>;
type ModelStringColumns<M extends ModelDefinition> = {
  [C in keyof M['columns']]: ModelColumnType<M['columns'][C]['type']> extends
    string ? C : never;
}[keyof M['columns']];
type ModelNumericColumns<M extends ModelDefinition> = {
  [C in keyof M['columns']]: ModelColumnType<M['columns'][C]['type']> extends
    number ? C : never;
}[keyof M['columns']];
type ModelDateColumns<M extends ModelDefinition> = {
  [C in keyof M['columns']]: ModelColumnType<M['columns'][C]['type']> extends
    Date ? C : never;
}[keyof M['columns']];
type ModelBooleanColumns<M extends ModelDefinition> = {
  [C in keyof M['columns']]: ModelColumnType<M['columns'][C]['type']> extends
    boolean ? C : never;
}[keyof M['columns']];
type ModelNullableColumns<M extends ModelDefinition> = {
  [C in keyof M['columns']]: M['columns'][C] extends { nullable: true } ? C
    : never;
}[keyof M['columns']];
type ModelRequiredColumns<M extends ModelDefinition> = {
  [C in keyof M['columns']]: M['columns'][C] extends { nullable: false } ? C
    : never;
}[keyof M['columns']];

type NullableResults<M extends ModelDefinition> = {
  [C in keyof M['columns']]?: M['columns'][C] extends { nullable: true }
    ? M['columns'][C]['type']
    : never;
};

type NonNullabeResults<M extends ModelDefinition> = {
  [C in keyof M['columns']]: M['columns'][C] extends { nullable: false }
    ? M['columns'][C]['type']
    : never;
};

type ModelResult<M extends ModelDefinition> =
  & Omit<
    {
      [C in keyof M['columns']]: ModelColumnType<M['columns'][C]['type']>;
    },
    ModelNullableColumns<M>
  >
  & Omit<
    {
      [C in keyof M['columns']]?: ModelColumnType<M['columns'][C]['type']>;
    },
    ModelRequiredColumns<M>
  > extends infer O ? { [P in keyof O]: O[P] } : never;

export type LinkedModels<
  DM extends DataModels,
  M extends keyof DataModels,
  R extends Record<string, ModelRelationship> = DM[M]['relations'],
> = {
  -readonly [K in keyof R]?: R[K] extends { hasMany: true }
    ? ModelResult<DM[R[K]['model']]>[]
    : ModelResult<DM[R[K]['model']]>;
};

type DataModelResult<DM extends DataModels, M extends keyof DataModels> =
  ModelResult<DM[M]> & LinkedModels<DM, M> extends infer O
    ? { [P in keyof O]: O[P] }
    : never;

type DataModelFilter<DM extends DataModels, M extends keyof DataModels> = {
  [C in keyof DM[M]['columns']]?: DM[M]['columns'][C]['type'];
};

// Tests
type d = DeepWriteable<typeof Users>;

const pk: ModelPrimaryKey<DeepWriteable<typeof Users>> = 'Id';
const stringColumns: ModelStringColumns<DeepWriteable<typeof Users>> = 'Name';
type nc = ModelRequiredColumns<DeepWriteable<typeof Users>>;
type resultType = DataModelResult<DeepWriteable<typeof Schema>, 'Users'>;
type dmResult = DataModelResult<DeepWriteable<typeof Schema>, 'Posts'>;

//#endregion Result & Schema

//#region Querying
type BaseQuery<
  DM extends DataModels = DataModels,
  M extends keyof DataModels = keyof DataModels,
> = {
  model: M;
  columns: (keyof DM[M]['columns'])[];
  where?: Record<string, any>;
  limit?: number;
  offset?: number;
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  groupBy?: (keyof DM[M]['columns'])[];
  having?: Record<string, any>;
  joins?: Record<string, JoinQuery<DM, M>>;
  distinct?: boolean;
  lock?: 'FOR UPDATE' | 'FOR SHARE';
};
//#endregion Querying

// Basically in query, we do not rely on the "Type" definition in model, but rather depend on the input (Select, Insert etc).
// RTOld works fine with columns and computed passed. Need to work on project option as columns will contain items
// not part of select (in some cases, i.e used for filtering.).
// For joined tables we can pass the "flattened" items in columns and project, and then use the "project" to filter out

type RTOld<
  DM extends {
    columns: Record<string, string | number>;
    computed: Record<string, string>;
    project?: string[];
  },
> =
  & {
    [K in keyof DM['columns']]: DM['columns'][K];
  }
  & {
    [K in keyof DM['computed']]: DM['computed'][K];
  } extends infer O ? { [P in keyof O]: O[P] } : never;

type RT<
  DM extends {
    columns: Record<string, string | number>;
    computed: Record<string, string>;
    project?: string[];
  },
  PR extends DM['project'] | (keyof DM['columns'] & keyof DM['computed']) =
    | DM['project']
    | (keyof DM['columns'] & keyof DM['computed']),
> = {
  [PK in keyof PR]: PR[PK] extends keyof DM['columns'] ? DM['columns'][PR[PK]]
    : PR[PK] extends keyof DM['computed'] ? DM['computed'][PR[PK]]
    : never;
} extends infer O ? { [P in keyof O]: O[P] } : never;

const insert = <
  DM extends {
    columns: Record<string, string | number>;
    computed: Record<string, string>;
    project?: string[];
  },
>(query: DM): RT<DM> => {
  return {} as RT<DM>;
};

const nest = () => {
  return insert<
    { columns: { a: number }; computed: { b: string }; project: ['a'] }
  >({ columns: { a: 1 }, computed: { b: 'b' }, project: ['a'] });
};

const a = insert<
  { columns: { a: number }; computed: { b: string }; project: ['a'] }
>({ columns: { a: 1 }, computed: { b: 'b' }, project: ['a'] });
const d = nest();
