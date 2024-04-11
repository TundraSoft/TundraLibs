import type {
  InsertModelType,
  ModelType,
  SchemaDefinition,
  TableDefinition,
  UpdateModelType,
  ViewDefinition,
} from './types/mod.ts';
import type { QueryFilters } from '../../dam/mod.ts';

import type { DeepReadOnly, DeepWritable } from '../utils/mod.ts';

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

const transposeModels = <S extends SchemaDefinition>(schema: S) => {
};

export const buildModel = <S extends SchemaDefinition>(
  config: S,
) => {
  const objectModel: ModelActions<S> = {} as ModelActions<S>;
  for (const name in config) {
    if (config[name].type === 'TABLE') {
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
