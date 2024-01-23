import type { SchemaDefinition } from './Schema.ts';
import type {
  ColumnDefinition,
  ExpressionColumnDefinition,
  ExtractColumnType,
  ExtractColumnTypeLOV,
} from '../columns/mod.ts';
import type { ExcludeNever } from '../../utils/mod.ts';
import { SerialDataType } from '../datatypes/mod.ts';

//#region Get the Column types (PK, Serial, Required, Optional, Expression, Related, Encrypted, Hashed etc)
type PrimaryKeys<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    { type: SerialDataType } ? C
    : (S[MN]['primaryKey'] extends Array<infer P> ? (P extends C ? C : never)
      : never);
}[keyof S[MN]['columns']];

type EncryptedColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    { security: object } ? C : never;
}[keyof S[MN]['columns']];

type DefaultColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    { defaults: { insert: infer D } } ? C
    : never;
}[keyof S[MN]['columns']];

//#endregion Get the Column types (PK, Serial, Required, Optional, Expression, Related, Encrypted, Hashed etc)

//#region Generate the types

//#endregion Generate the types

/**
 * Represents the columns in a model that have a serial data type.
 *
 * @template S - The schema definition.
 * @template MN - The key of the model in the schema definition.
 */
type SerialColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends ColumnDefinition
    ? S[MN]['columns'][C] extends { type: SerialDataType } ? C : never
    : never;
}[keyof S[MN]['columns']];

/**
 * Represents the columns that make up the primary key of a model.
 *
 * @template S - The schema definition.
 * @template MN - The model name.
 */
type PrimaryKeyColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  readonly [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    ColumnDefinition
    ? (S[MN]['primaryKey'] extends Array<infer P> ? (P extends C ? C : never)
      : never)
    : never;
}[keyof S[MN]['columns']];

/**
 * Represents the keys of columns in a model's schema definition that have default values for insertion.
 *
 * @template S - The schema definition type.
 * @template MN - The key of the model in the schema definition.
 */
type InsertDefaultColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends ColumnDefinition
    ? S[MN]['columns'][C] extends { defaults: { insert: infer D } } ? C : never
    : never;
}[keyof S[MN]['columns']];

/**
 * Represents the columns of an expression in a model schema.
 *
 * @template S - The schema definition.
 * @template MN - The key of the model in the schema.
 */
type ExpressionColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
    ExpressionColumnDefinition ? C
    : never;
}[keyof S[MN]['columns']];

/**
 * Represents the type of read-only columns in a model.
 *
 * @template S - The schema definition.
 * @template MN - The model name.
 * @returns The type of read-only columns.
 */
type ExtractReadOnlyColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  Pick<
    {
      readonly [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
        ColumnDefinition
        ? S[MN]['columns'][C] extends { lov: unknown }
          ? ExtractColumnTypeLOV<S[MN]['columns'][C]>
        : ExtractColumnType<S[MN]['columns'][C]>
        : never;
    },
    PrimaryKeyColumns<S, MN> | SerialColumns<S, MN>
  >
>;

/**
 * Extracts the required columns from a schema definition.
 *
 * @template S - The schema definition type.
 * @template MN - The key of the schema definition.
 * @returns The required columns from the schema definition.
 */
type ExtractRequiredColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  Omit<
    {
      [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
        ColumnDefinition
        ? S[MN]['columns'][C] extends { nullable: true } ? never
        : S[MN]['columns'][C] extends { lov: unknown }
          ? ExtractColumnTypeLOV<S[MN]['columns'][C]>
        : ExtractColumnType<S[MN]['columns'][C]>
        : never;
    },
    keyof ExtractReadOnlyColumns<S, MN> | ExpressionColumns<S, MN>
  >
>;

/**
 * Represents the optional columns of a model.
 *
 * @template S - The schema definition.
 * @template MN - The key of the model in the schema definition.
 */
type ExtractOptionalColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  Omit<
    {
      [C in keyof S[MN]['columns']]?: S[MN]['columns'][C] extends
        ColumnDefinition
        ? S[MN]['columns'][C] extends { nullable: true }
          ? S[MN]['columns'][C] extends { lov: unknown }
            ? ExtractColumnTypeLOV<S[MN]['columns'][C]>
          : ExtractColumnType<S[MN]['columns'][C]>
        : never
        : never;
    },
    | keyof ExtractReadOnlyColumns<S, MN>
    | keyof ExtractRequiredColumns<S, MN>
    | ExpressionColumns<S, MN>
  >
>;

/**
 * Extracts the columns from a schema definition that are of type ExpressionColumnDefinition.
 * Returns a new type that includes only the columns that match the specified expression types.
 *
 * @template S - The schema definition type.
 * @template MN - The key of the schema definition.
 * @returns A new type that includes only the columns that match the specified expression types.
 */
type ExtractExpressionColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = ExcludeNever<
  Pick<
    {
      [C in keyof S[MN]['columns']]: S[MN]['columns'][C] extends
        ExpressionColumnDefinition
        ? S[MN]['columns'][C] extends StringExpressions ? string
        : S[MN]['columns'][C] extends NumericExpressions ? number | bigint
        : S[MN]['columns'][C] extends DateExpressions ? Date
        : never
        : never;
    },
    ExpressionColumns<S, MN>
  >
>;

/**
 * Extracts the related columns from a schema definition for a given model.
 *
 * @template S - The schema definition type.
 * @template MN - The key of the model in the schema definition.
 * @returns An object representing the related columns for the given model.
 */
type ExtractRelatedColumns<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> = {
  [R in keyof S[MN]['foreignKeys']]?: S[MN]['foreignKeys'][R] extends
    { model: keyof S }
    ? S[MN]['foreignKeys'][R] extends { contains: 'SINGLE' }
      ? ModelType<S, S[MN]['foreignKeys'][R]['model']>
    : Array<ModelType<S, S[MN]['foreignKeys'][R]['model']>>
    : never;
} extends infer O ? { [P in keyof O]: O[P] } : never;

/**
 * Represents the columns of a model based on the provided schema definition.
 *
 * @template S - The schema definition.
 * @template MN - The model name.
 * @returns The combined columns of the model.
 */
type ModelType<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> =
  & ExtractReadOnlyColumns<S, MN>
  & ExtractRequiredColumns<S, MN>
  & ExtractOptionalColumns<S, MN>
  & ExtractExpressionColumns<S, MN>
  & ExtractRelatedColumns<S, MN> extends infer O ? { [P in keyof O]: O[P] }
  : never;

type InsertModelType<
  S extends SchemaDefinition = SchemaDefinition,
  MN extends keyof S = keyof S,
> =
  & ExtractRequiredColumns<S, MN>
  & ExtractOptionalColumns<S, MN>;

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
    primaryKey: ['id'],
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
        security: {
          type: 'HASH',
          mode: 'SHA256',
        },
        lov: [18, 19, 20, 21, 22, 23, 24, 25],
        // defaults: {
        //   insert: 18,
        // },
      },
      u2id: {
        type: 'BIGINT',
        defaults: {
          insert: 1n,
        },
      },
    },
    primaryKey: ['name'],
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

type KeysMatching<T, V> = {
  [K in keyof T]-?: T[K] extends V ? K : never;
}[keyof T];

import type { DeepWritable } from '../../utils/mod.ts';
import {
  DateExpressions,
  NumericExpressions,
  StringExpressions,
} from '../expressions/mod.ts';

type a = DeepWritable<typeof tableDefinition>;

type s = SerialColumns<a, 'Users'>;
type p = PrimaryKeys<a, 'Users'>;
type se = EncryptedColumns<a, 'Users'>;
type i = InsertDefaultColumns<a, 'Users'>;
type re = ExtractReadOnlyColumns<a, 'Users'>;
type r = ExtractRequiredColumns<a, 'Users'>;
type o = ExtractOptionalColumns<a, 'Users'>;
type df = ExtractExpressionColumns<a, 'Posts'>;
type m = ModelType<a, 'Posts'>;
