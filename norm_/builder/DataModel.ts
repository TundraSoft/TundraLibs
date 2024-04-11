import type { DeepReadOnly, DeepWritable } from '../../utils/mod.ts';

import type {
  ColumnDefinition,
  InsertModelType,
  ModelColumnType,
  ModelType,
  SchemaDefinition,
  SerialColumnDefinition,
  TableDefinition,
  UpdateModelType,
} from '../types/mod.ts';
import type { QueryFilters } from '../../dam/mod.ts';

import { DataModel } from '../tests/testdata/DataModel.ts';

type d = DeepWritable<typeof DataModel>;

type ViewActions<S extends SchemaDefinition, TN extends keyof S = keyof S> = {
  select: () => void;
};

type TableActions<S extends SchemaDefinition, TN extends keyof S = keyof S> = {
  select: () => void;
  insert: (
    row: Array<InsertModelType<S, TN>>,
  ) => QueryFilters<ModelType<S, TN>>;
  update: (
    data: UpdateModelType<S, TN>,
    filter?: QueryFilters<ModelType<S, TN>>,
  ) => void;
  delete: () => void;
  truncate: () => void;
};

type ModelActions<S extends SchemaDefinition> = {
  [K in keyof S]: S[K]['type'] extends 'TABLE' ? TableActions<S, K>
    : ViewActions<S, K>;
};

const validateModel = <S extends SchemaDefinition>(models: S) => {
  Object.entries(models).forEach(([name, model]) => {
    console.log(model);
  });
};

const processModel = (model: TableDefinition | ViewDefinition) => {
  const columns: string[] = [],
    expressions: Record<string, Expressions> = {},
    defaultProject: Record<string, string | Expressions> = {},
    rowValidators: Record<string, Array<(value: unknown) => boolean>> = {};
  Object.entries(model.columns).forEach(([name, column]) => {
    if (Object.keys(column).includes('type')) {
      const c = column as ColumnDefinition;
      columns.push(c.name || name);
      defaultProject[name] = `$${c.name || name}`;
      const { type, lov, range, length, pattern } = { ...c } as {
        type: string;
        lov?: Array<string | bigint | Date>;
        range?: [number, number] | [bigint, bigint] | [Date, Date];
        length?: [number, number?];
        pattern?: RegExp;
      };
      if (!rowValidators[name]) {
        rowValidators[name] = [];
      }
      // Infer the type to JavaScript native type and validate input against the type
      switch (type) {
        case 'VARCHAR':
        case 'TEXT':
          rowValidators[name].push((value: unknown) =>
            typeof value === 'string'
          );
          if (length) {
            rowValidators[name].push((value: unknown) =>
              (value as string).length <= length[0]
            );
          }
          break;
        case 'SERIAL':
        case 'INTEGER':
          rowValidators[name].push((value: unknown) =>
            typeof value === 'number' && Number.isInteger(value)
          );
          break;
          // Add other data types as needed
      }
      // Check if range, lov or pattern is available. If so, add validation for that
      if (lov) {
        rowValidators[name].push((value: unknown) =>
          lov.includes(value as string | bigint | Date)
        );
      }
      if (range) {
        rowValidators[name].push((value: unknown) =>
          (value as number | bigint | Date) >= range[0] &&
          (value as number | bigint | Date) <= range[1]
        );
      }
      if (pattern) {
        const regex = new RegExp(pattern);
        rowValidators[name].push((value: unknown) =>
          regex.test(value as string)
        );
      }
    } else {
      expressions[name] = column as Expressions;
      defaultProject[name] = `$${name}`;
    }
  });
};

const processModel2 = (model: TableDefinition | ViewDefinition) => {
  const columns: string[] = [],
    expressions: Record<string, Expressions> = {},
    defaultProject: Record<string, string | Expressions> = {},
    rowValidators: Record<string, Array<(value: unknown) => boolean>> = {};
  Object.entries(model.columns).forEach(([name, column]) => {
    if (Object.keys(column).includes('type')) {
      const c = column as ColumnDefinition;
      columns.push(c.name || name);
      defaultProject[name] = `$${c.name || name}`;
      const { lov, range } = { lov: undefined, range: undefined, ...c } as {
        lov?: Array<string | bigint | Date>;
        range?: [number, number] | [bigint, bigint] | [Date, Date];
      };
      if (!rowValidators[name]) {
        rowValidators[name] = [];
      }
      if (lov) {
        rowValidators[name].push((value: unknown) =>
          lov.includes(value as string | bigint | Date)
        );
      }
      if (range) {
        rowValidators[name].push((value: unknown) =>
          (value as number | bigint | Date) >= range[0] &&
          (value as number | bigint | Date) <= range[1]
        );
      }
    } else {
      expressions[name] = column as Expressions;
      defaultProject[name] = `$${name}`;
    }
  });
  return {
    columns,
    expressions,
    defaultProject,
    rowValidators,
  };
};

const buildModel = <
  F extends SchemaDefinition,
  S extends SchemaDefinition = DeepWritable<F>,
>(models: F) => {
  const objectModel: ModelActions<S> = {} as ModelActions<S>;
  for (const name in models) {
    if (models[name].type === 'TABLE') {
      objectModel[name] = {
        select: () => {},
        insert: () => {
          console.log(`Inserting into ${name}`);
          return {} as QueryFilters<ModelType<S, typeof name>>;
        },
        update: () => {},
        delete: () => {},
        truncate: () => {},
      } as ModelActions<S>[keyof S];
    } else {
      objectModel[name] = {
        select: () => {},
      } as ModelActions<S>[keyof S];
    }
  }
  return objectModel;
};

const loadModel = <TConfig extends SchemaDefinition>(config: TConfig) => {
  // validate model
  validateModel(config);

  return buildModel(config);
};

const tablesConfig = {
  Users: {
    name: 'Users',
    type: 'TABLE',
    columns: {
      id: { type: 'UUID' },
      name: { type: 'VARCHAR', nullable: true },
      age: { type: 'INTEGER' },
      profile: {
        type: 'JSON',
        structure: { fullName: 'VARCHAR', bio: 'VARCHAR' },
        nullable: true,
      },
    },
  },
  VUsers: {
    name: 'UserView',
    type: 'VIEW',
    columns: {
      id: { type: 'UUID' },
      name: { type: 'VARCHAR', nullable: true },
      age: { type: 'INTEGER' },
    },
  },
  // more table configurations...
} as const;

const a = loadModel(DataModel as d);

let ad = a.Users.insert([{
  Id: '123',
  Name: 'John Doe',
  DOB: new Date(),
  RollNo: 123,
}]);
ad['$Profile.Bio'] = { $contains: 'Doe' };

// const dd = objectModel(DataModel as d);
