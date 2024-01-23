import type { ModelDefinition } from './Model.ts';
import type { ViewDefinition } from './View.ts';

import type {
  ColumnDefinition,
  ExpressionColumnDefinition,
  ExtractColumnLOV,
  ExtractColumnType,
  ExtractColumnTypeLOV,
} from '../columns/mod.ts';

import type {
  DateExpressions,
  NumericExpressions,
  StringExpressions,
} from '../expressions/mod.ts';

import type { SerialDataType } from '../datatypes/mod.ts';

import type { ExcludeNever } from '../../utils/mod.ts';

export type { ModelDefinition };
export type { ViewDefinition };

export type SchemaDefinition = Record<string, ModelDefinition | ViewDefinition>;

export type SerialColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  {
    [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends ColumnDefinition
      ? S[MN]['columns'][C] extends { type: SerialDataType } ? C : never
      : never;
  }
> extends infer O ? { [P in keyof O]: O[P] } : never;

export type PrimaryKeyColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  {
    readonly [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
      ColumnDefinition
      ? (S[MN]['primaryKey'] extends Array<infer P>
        ? (P extends C ? ExtractColumnTypeLOV<S[MN]['columns'][C]> : never)
        : never)
      : never;
  }
> extends infer O ? { [P in keyof O]: O[P] } : never;

export type RequiredColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  {
    [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends ColumnDefinition
      ? S[MN]['columns'][C] extends { nullable: true } ? never
      : S[MN]['columns'][C] extends { lov: unknown }
        ? ExtractColumnLOV<S[MN]['columns'][C]>
      : ExtractColumnType<S[MN]['columns'][C]>
      : never;
  }
> extends infer O ? { [P in keyof O]: O[P] } : never;

export type OptionalColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = Partial<
  ExcludeNever<
    {
      [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
        ColumnDefinition
        ? S[MN]['columns'][C] extends { nullable: true }
          ? S[MN]['columns'][C] extends { lov: unknown }
            ? ExtractColumnLOV<S[MN]['columns'][C]>
          : ExtractColumnType<S[MN]['columns'][C]>
        : never
        : never;
    }
  >
> extends infer O ? { [P in keyof O]: O[P] } : never;

export type ExpressionColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  {
    [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
      ExpressionColumnDefinition
      ? S[MN]['columns'][C] extends StringExpressions ? string
      : S[MN]['columns'][C] extends NumericExpressions ? number | bigint
      : S[MN]['columns'][C] extends DateExpressions ? Date
      : never
      : never;
  }
> extends infer O ? { [P in keyof O]: O[P] } : never;

export type RelatedColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = Partial<
  ExcludeNever<
    {
      [R in keyof S[MN]['foreignKeys']]: S[MN]['foreignKeys'][R] extends
        { model: infer M }
        ? M extends keyof S
          ? S[MN]['foreignKeys'][R] extends { contains: 'SINGLE' }
            ? ModelColumns<S, M>
          : Array<ModelColumns<S, M>>
        : never
        : never;
    }
  >
> extends infer O ? { [P in keyof O]: O[P] } : never;

export type ModelColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> =
  & RequiredColumns<S, MN>
  & OptionalColumns<S, MN>
  & ExpressionColumns<S, MN>
  & RelatedColumns<S, MN> extends infer O ? { [P in keyof O]: O[P] } : never;

// Types for Insert and Update of model
// For insert, any column which is of type serial is optional and with defaults.insert is also optional
export type ModelColumns2<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> =
  & Omit<
    RequiredColumns<S, MN>,
    {
      [K in keyof RequiredColumns<S, MN>]: RequiredColumns<S, MN>[K] extends
        { defaults: { insert: unknown } } ? K : never;
    }[keyof RequiredColumns<S, MN>]
  >
  & Partial<
    Pick<
      RequiredColumns<S, MN>,
      {
        [K in keyof RequiredColumns<S, MN>]: RequiredColumns<S, MN>[K] extends
          { defaults: { insert: unknown } } ? K : never;
      }[keyof RequiredColumns<S, MN>]
    >
  >
  & OptionalColumns<S, MN>
  & ExpressionColumns<S, MN>
  & RelatedColumns<S, MN> extends infer O ? { [P in keyof O]: O[P] } : never;
// For update Serial columns are not allowed, and columns with defaults.update are optional

export type SchemaType<S extends SchemaDefinition = SchemaDefinition> = {
  [M in keyof S]: ModelColumns<S, M>;
};

const tableDefinition = {
  'Users2': {
    source: 'Users2',
    schema: 'u',
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
    source: 'Users',
    schema: 'u',
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
        nullable: true,
        lov: [18, 19, 20, 21, 22, 23, 24, 25],
        // defaults: {
        //   insert: 18,
        // },
      },
      u2id: {
        type: 'BIGINT',
      },
    },
    foreignKeys: {
      'Users2': {
        model: 'Users2',
        contains: 'SINGLE',
        relation: {
          u2id: 'id',
        },
      },
    },
  },
  'Posts': {
    source: 'Posts',
    schema: 'blog',
    columns: {
      id: {
        type: 'BIGSERIAL',
      },
      title: {
        name: 'Title',
        type: 'VARCHAR',
        defaults: {
          insert: 'Untitled',
        },
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
      test: {
        add: [1, 3],
      },
      meta: {
        type: 'JSON',
      },
    },
    primaryKey: ['id'],
    foreignKeys: {
      'Author': {
        model: 'Users',
        contains: 'SINGLE',
        relation: {
          authorId: 'id',
        },
      },
    },
  },
} as const;

import type { DeepWritable } from '../../utils/mod.ts';

type a = DeepWritable<typeof tableDefinition>;
type a2 = ModelColumns<a, 'Posts'>;
type ss = SchemaType<a>;
type pk = PrimaryKeyColumns<a, 'Posts'>;
type ds = ExpressionColumns<a, 'Posts'>;
const d: a2 = {
  id: 1n,
  title: 'a',
  content: 'b',
  authorId: 1n,
  test: 2,
  meta: {
    a: 1,
  },
};

const pl: pk = {
  id: 12n,
};
