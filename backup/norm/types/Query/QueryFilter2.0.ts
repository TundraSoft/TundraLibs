import { Query } from 'https://deno.land/x/postgres@v0.17.0/query/query.ts';
import type { Generators } from '../Translator/mod.ts';

type Unarray<T> = T extends Array<infer U> ? U : T;

export type FilterOperators<ValueType> = ValueType extends
  (number | string | boolean) ? ValueType | Generators | {
    $eq?: ValueType | Generators;
    $neq?: ValueType | Generators;
    $in?: Array<ValueType>;
    $nin?: Array<ValueType>;
    $lt?: ValueType | Generators;
    $lte?: ValueType | Generators;
    $gt?: ValueType | Generators;
    $gte?: ValueType | Generators;
    $between?: {
      $from: ValueType | Generators;
      $to: ValueType | Generators;
    };
    $null?: boolean;
    $like?: ValueType | Generators;
    $nlike?: ValueType | Generators;
    $ilike?: ValueType | Generators;
    $nilike?: ValueType | Generators;
  }
  : never;

export type QueryPaths<T> = {
  [K in keyof T]: T[K] extends object ? K | `${K}.${QueryPaths<T[K]>}` : K;
}[keyof T];

export type BaseQueryFilter<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  & {
    [Property in keyof T]?: FilterOperators<T[Property]>;
  }
  & {
    $or?: BaseQueryFilter<T> | BaseQueryFilter<T>[];
    $and?: BaseQueryFilter<T> | BaseQueryFilter<T>[];
  };

export type QueryFilter<T, Y = Required<T>> = Y extends Record<string, unknown>
  ?
    & {
      [K in QueryPaths<Y>]?: K extends keyof Y
        ? Y[K] extends Array<Record<string, unknown>>
          ? QueryFilter<Unarray<Y[K]>>
        : FilterOperators<Y[K]>
        : FilterOperators<string>;
    }
    & {
      $or?: QueryFilter<T>[] | QueryFilter<T>;
      $and?: QueryFilter<T>[] | QueryFilter<T>;
    }
  : never;

type M = {
  a: string;
  b: {
    c: string;
    d: number;
  };
};

const a: QueryFilter<M> = {
  a: {
    $eq: 'a',
    $neq: 'b',
  },
  'b.c': {
    $eq: 'a',
  },
  'b.d': 1,
};
