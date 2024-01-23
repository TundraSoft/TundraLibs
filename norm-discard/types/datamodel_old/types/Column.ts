import type {
  BigIntDataType,
  BooleanDataType,
  DateDataType,
  NumericDataType,
  SerialDataType,
  StringDataType,
} from '../../datatypes/mod.ts';

import type { ColumnDefinition } from '../columns/mod.ts';
import type { SchemaDefinition } from '../model/mod.ts';
import type { ExcludeNever } from '../../utils/mod.ts';

export type ExtractColumnType<CD extends ColumnDefinition> = CD extends
  { lov: Array<infer U> } ? U
  : CD['type'] extends BigIntDataType ? bigint
  : CD['type'] extends SerialDataType | NumericDataType ? number
  : CD['type'] extends BooleanDataType ? boolean
  : CD['type'] extends DateDataType ? Date
  : CD['type'] extends StringDataType ? string
  : never;

export type RequiredColumns<S extends SchemaDefinition, TN extends keyof S> =
  ExcludeNever<
    {
      [C in keyof S[TN]['columns']]: S[TN]['columns'][C] extends
        { nullable: true } ? never
        : ExtractColumnType<S[TN]['columns'][C]>;
    }
  >;

export type OptionalColumns<S extends SchemaDefinition, TN extends keyof S> =
  ExcludeNever<
    {
      [C in keyof S[TN]['columns']]: S[TN]['columns'][C] extends
        { nullable: true } ? ExtractColumnType<S[TN]['columns'][C]>
        : never;
    }
  > extends infer O ? { [P in keyof O]?: O[P] } : never;

export type InsertRequiredColumns<
  S extends SchemaDefinition,
  TN extends keyof S,
> = ExcludeNever<
  {
    [C in keyof S[TN]['columns']]: S[TN]['columns'][C] extends
      { nullable: true } | { type: SerialDataType } | { defaults: infer D }
      ? never
      : ExtractColumnType<S[TN]['columns'][C]>;
  }
>;

export type InsertOptionalColumns<
  S extends SchemaDefinition,
  TN extends keyof S,
> = ExcludeNever<
  {
    [C in keyof S[TN]['columns']]: S[TN]['columns'][C] extends
      { nullable: true } | { type: SerialDataType } | { defaults: infer D }
      ? ExtractColumnType<S[TN]['columns'][C]>
      : never;
  }
> extends infer O ? { [P in keyof O]?: O[P] } : never;

export type ModelType<S extends SchemaDefinition, TN extends keyof S> =
  RequiredColumns<S, TN> & OptionalColumns<S, TN> extends infer O
    ? { [P in keyof O]: O[P] }
    : never;

export type InsertModelType<S extends SchemaDefinition, TN extends keyof S> =
  InsertRequiredColumns<S, TN> & InsertOptionalColumns<S, TN> extends infer O
    ? { [P in keyof O]: O[P] }
    : never;

export type SchemaType<S extends SchemaDefinition> = {
  [TN in keyof S]: ModelType<S, TN>;
};

export type SelectQuery<
  S extends SchemaDefinition = SchemaDefinition,
  TN extends keyof S = keyof S,
> = {
  source: S[TN]['source'];
  columns: {
    [C in keyof S[TN]['columns']]?: S[TN]['columns'][C] extends { name: string }
      ? S[TN]['columns'][C]['name']
      : C;
  };
  where?: {
    [C in keyof S[TN]['columns']]?: S[TN]['columns'][C] extends { name: string }
      ? S[TN]['columns'][C]['name']
      : C;
  };
  orderBy?: {
    [C in keyof S[TN]['columns']]?: S[TN]['columns'][C] extends { name: string }
      ? S[TN]['columns'][C]['name']
      : C;
  };
  limit?: number;
  offset?: number;
  join?: S[TN]['foreignKeys'] extends Record<string, RelationDefinition> ? {
      [RN in keyof S[TN]['foreignKeys']]?:
        S[TN]['foreignKeys'][RN]['model'] extends keyof S
          ? SelectQuery<S, S[TN]['foreignKeys'][RN]['model']> extends infer O
            ? { [P in keyof O]: O[P] }
          : never
          : never;
    }
    : never;
} extends infer O ? { [P in keyof O]: O[P] } : never;

export type InsertQuery<
  S extends SchemaDefinition = SchemaDefinition,
  TN extends keyof S = keyof S,
> = {
  source: S[TN]['source'];
  columns: {
    [C in keyof S[TN]['columns']]?: S[TN]['columns'][C] extends { name: string }
      ? S[TN]['columns'][C]['name']
      : C;
  };
  values: InsertModelType<S, TN>[];
};

const tableDefinition = {
  'Users2': {
    source: ['u', 'Users'],
    columns: {
      id: {
        type: 'BIGSERIAL',
      },
      name: {
        name: 'Name',
        type: 'VARCHAR',
        length: 255,
        lov: ['John', 'Doe', 'Jane', 'Doe'],
      },
    },
  },
  'Users': {
    source: ['u', 'Users'],
    columns: {
      id: {
        type: 'BIGSERIAL',
      },
      name: {
        name: 'Name',
        type: 'VARCHAR',
        length: 255,
        lov: ['John', 'Doe', 'Jane', 'Doe'],
      },
      age: {
        type: 'INTEGER',
        lov: [18, 19, 20, 21, 22, 23, 24, 25],
        defaults: {
          insert: 18,
        },
      },
      u2id: {
        type: 'BIGINT',
      },
    },
    foreignKeys: {
      'Users2': {
        model: 'Users2',
        type: 'SINGLE',
        relation: {
          u2id: 'id',
        },
      },
    },
  },
  'Posts': {
    source: ['u', 'Posts'],
    columns: {
      id: {
        type: 'BIGSERIAL',
      },
      title: {
        name: 'Title',
        type: 'VARCHAR',
        length: 255,
      },
      content: {
        name: 'Content',
        type: 'TEXT',
      },
      authorId: {
        name: 'AuthorId',
        type: 'BIGINT',
      },
    },
    foreignKeys: {
      'Author': {
        model: 'Users',
        type: 'SINGLE',
        relation: {
          authorId: 'id',
        },
      },
    },
  },
} as const;

import { DeepWritable } from '../../utils/mod.ts';
import { RelationDefinition } from '../mod.ts';
type r = RequiredColumns<DeepWritable<typeof tableDefinition>, 'Users'>;
type o = OptionalColumns<DeepWritable<typeof tableDefinition>, 'Users'>;
type s = SchemaType<DeepWritable<typeof tableDefinition>>;
const m: ModelType<DeepWritable<typeof tableDefinition>, 'Users'> = {
  id: 1n,
  name: 'John',
  age: 18,
  u2id: 1n,
};

const i: InsertQuery<DeepWritable<typeof tableDefinition>, 'Users'> = {
  source: ['u', 'Users'],
  columns: {
    id: 'id',
    name: 'Name',
    age: 'age',
  },
  values: [
    {
      id: 1n,
      name: 'John',
      age: 18,
      u2id: 1n,
    },
  ],
};

const _sdf: SelectQuery<DeepWritable<typeof tableDefinition>, 'Posts'> = {
  source: ['u', 'Posts'],
  columns: {
    id: 'id',
    title: 'Title',
    content: 'Content',
    authorId: 'AuthorId',
  },
  join: {
    'Author': {
      source: ['u', 'Users'],
      columns: {
        id: 'id',
        name: 'Name',
        age: 'age',
      },
      join: {
        'Users2': {
          source: ['u', 'Users'],
          columns: {
            id: 'id',
            name: 'Name',
          },
        },
      },
    },
  },
};
