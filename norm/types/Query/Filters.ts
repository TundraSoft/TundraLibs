import type { Generators } from '../Translator/mod.ts';

export type FilterOperators<PropVal> = PropVal | Generators | {
  $eq?: PropVal | Generators;
  $neq?: PropVal | Generators;
  $in?: Array<PropVal | Generators>;
  $nin?: Array<PropVal | Generators>;
  $lt?: PropVal | Generators;
  $lte?: PropVal | Generators;
  $gt?: PropVal | Generators;
  $gte?: PropVal | Generators;
  $between?: {
    $from: PropVal | Generators;
    $to: PropVal | Generators;
  };
  $null?: boolean;
  $like?: PropVal | Generators;
  $nlike?: PropVal | Generators;
  $ilike?: PropVal | Generators;
  $nilike?: PropVal | Generators;
};

export type SimpleQueryFilter<
  T extends Record<string, unknown> = Record<string, unknown>,
> = {
  [Property in keyof T]?: FilterOperators<T[Property]>;
};

export type QueryFilter<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  & {
    [Property in keyof T]?: FilterOperators<T[Property]>;
  }
  & {
    $or?: QueryFilter<T> | QueryFilter<T>[];
    $and?: QueryFilter<T> | QueryFilter<T>[];
  };
// | Array<
//   {
//     [Property in keyof T]?: FilterOperators<T[Property]>;
//   }
// >;
