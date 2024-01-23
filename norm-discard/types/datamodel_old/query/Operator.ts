import type { SchemaDefinition } from '../model/mod.ts';
import type { ExtractColumnType } from '../types/Column.ts';

type OperatorTypes = string | number | bigint | Date | boolean | `${string}`;

export type BaseOperators<
  T extends OperatorTypes,
  LOV extends Array<T> | undefined = undefined,
> = {
  $eq?: LOV extends Array<infer U> ? U : T;
  $neq?: LOV extends Array<infer U> ? U : T;
  $in?: LOV extends Array<infer U> ? U[] : T;
  $nIn?: LOV extends Array<infer U> ? U[] : T;
  $null?: boolean;
} extends infer O ? { [P in keyof O]?: O[P] } : never;

export type StringOperators<
  T extends string | `${string}` = string | `${string}`,
  LOV extends Array<T> | undefined = undefined,
> = BaseOperators<T, LOV> & {
  $regexp?: RegExp;
  $like?: T;
  $nLike?: T;
  $iLike?: T;
  $nILike?: T;
  $startsWith?: T;
  $nStartsWith?: T;
  $endsWith?: T;
  $nEndsWith?: T;
  $contains?: T;
  $nContains?: T;
} extends infer O ? { [P in keyof O]?: O[P] } : never;

export type NumberOperators<
  T extends number | bigint | Date | `${string}` =
    | number
    | bigint
    | Date
    | `${string}`,
  LOV extends Array<T> | undefined = undefined,
> = BaseOperators<T, LOV> & {
  $gt?: LOV extends Array<infer U> ? U : T;
  $gte?: LOV extends Array<infer U> ? U : T;
  $lt?: LOV extends Array<infer U> ? U : T;
  $lte?: LOV extends Array<infer U> ? U : T;
  $between?: LOV extends Array<infer U> ? [U, U] : [T, T];
  $nBetween?: LOV extends Array<infer U> ? [U, U] : [T, T];
} extends infer O ? { [P in keyof O]?: O[P] } : never;

export type DateOperators<
  T extends Date | `${string}` = Date | `${string}`,
  LOV extends Array<T> | undefined = undefined,
> = NumberOperators<T, LOV> extends infer O ? { [P in keyof O]?: O[P] } : never;

export type BooleanOperators<
  T extends boolean | `${string}` = boolean | `${string}`,
  LOV extends Array<T> | undefined = undefined,
> = BaseOperators<T, LOV> extends infer O ? { [P in keyof O]?: O[P] } : never;

export type QueryOperators<T extends OperatorTypes> =
  | T
  | T extends string | `${string}` ? StringOperators<T>
  : T extends number | bigint | Date | `${string}` ? NumberOperators<T>
  : T extends boolean | `${string}` ? BooleanOperators<T>
  : never;

export type QueryFilters<S extends SchemaDefinition, TN extends keyof S> = {
  // add capability to set same type column as value (example string column = string column)
  [C in keyof S[TN]['columns']]?: QueryOperators<
    ExtractColumnType<S[TN]['columns'][C]>
  >;
} extends infer O ? { [P in keyof O]?: O[P] } : never;

const a: NumberOperators<number, [1, 2, 3, 4, 5, 6]> = {
  $eq: 1,
  $between: [3, 6],
};

const _a: StringOperators = {
  $eq: 'df',
};

const tableDefinition = {
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
    },
  },
} as const;
import { DeepWritable } from '../../utils/mod.ts';

type _e = ExtractColumnType<
  DeepWritable<typeof tableDefinition>['Users']['columns']['name']
>;
const _f: QueryFilters<DeepWritable<typeof tableDefinition>, 'Users'> = {
  id: {
    $gt: 1n,
  },
  name: {
    $nIn: ['Doe', 'Jane', 'John'],
  },
};

function regexpToLike(regExp: RegExp): string {
  return regExp.source
    .replace(/%/g, '\\%') // escape existing percent signs
    .replace(/_/g, '\\_') // escape existing underscores
    .replace(/\./g, '_') // dot matches any single character
    .replace(/\*/g, '%') // asterisk matches zero or more of any characters
    .replace(/\?/g, '_') // question mark matches any single character
    .replace(/\\(.)/g, '$1'); // remove backslashes used for escaping in RegExp
}

function likeToRegExp(likePattern: string): RegExp {
  let regExpPattern = likePattern
    .replace(/%/g, '.*') // percent sign matches any sequence of characters
    .replace(/_/g, '.') // underscore matches any single character
    .replace(/([.^$*+?()[{\\|-])/g, '\\$1'); // escape special RegExp characters

  return new RegExp(`^${regExpPattern}$`);
}

export type Operatorsd = {
  eq?: unknown;
  neq?: unknown;
  gt?: unknown;
  gte?: unknown;
  lt?: unknown;
  lte?: unknown;
  in?: unknown[];
  notIn?: unknown[];
  like?: string;
  notLike?: string;
  iLike?: string;
  notILike?: string;
  startsWith?: string;
  endsWith?: string;
  substring?: string;
  regexp?: string;
  notRegexp?: string;
  iRegexp?: string;
  notIRegexp?: string;
  between?: unknown[];
  notBetween?: unknown[];
  overlap?: unknown[];
  contains?: unknown[];
  contained?: unknown[];
  adjacent?: unknown[];
  strictLeft?: unknown[];
  strictRight?: unknown[];
  noExtendRight?: unknown[];
  noExtendLeft?: unknown[];
  and?: unknown[];
  or?: unknown[];
  any?: unknown;
  all?: unknown;
  values?: unknown[];
  col?: string;
  placeholder?: string;
  raw?: string;
  [key: string]: unknown;
};
