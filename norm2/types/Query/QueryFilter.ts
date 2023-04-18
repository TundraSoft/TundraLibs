import type { Generators } from '../Translator/mod.ts';

export type FilterOperators<ValueType> = ValueType | Generators | {
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
};

// export type SimpleQueryFilter<
//   T extends Record<string, unknown> = Record<string, unknown>,
// > = {
//   [Property in keyof T]?: FilterOperators<T[Property]>;
// };

// export type QueryFilter<
//   T extends Record<string, unknown> = Record<string, unknown>,
// > =
//   & {
//     [Property in keyof T]?: FilterOperators<T[Property]>;
//   }
//   & {
//     $or?: QueryFilter<T> | QueryFilter<T>[];
//     $and?: QueryFilter<T> | QueryFilter<T>[];
//   };
// | Array<
//   {
//     [Property in keyof T]?: FilterOperators<T[Property]>;
//   }
// >;

// export type QueryFilter<T extends Record<string, unknown> = Record<string, unknown>> = 
//   & {
//     [Property in keyof T]?: T[Property] extends Record<string, unknown>
//       ? QueryFilter<T[Property]>
//       : FilterOperators<T[Property]>;
//   }
//   & {
//     $or?: QueryFilter<T> | QueryFilter<T>[];
//     $and?: QueryFilter<T> | QueryFilter<T>[];
//   };

export type QueryFilter<T extends Record<string, unknown> = Record<string, unknown>> =
  & {
    [Property in keyof T]?: T[Property] extends Array<infer Item>
      ? Item extends Record<string, unknown>
        ? QueryFilter<Item>
        : FilterOperators<Item>
      : T[Property] extends Record<string, unknown>
        ? QueryFilter<T[Property]>
        : FilterOperators<T[Property]>;
  }
  & {
    $or?: QueryFilter<T> | QueryFilter<T>[];
    $and?: QueryFilter<T> | QueryFilter<T>[];
  };

// export type QueryFilter<T extends Record<string, unknown> = Record<string, unknown>> =
//   & {
//     [Property in keyof T]?: T[Property] extends Record<string, unknown>
//       ? 'YES'
//       : 'NO'
//   }
//   // & {
//   //   $or?: QueryFilter<T> | QueryFilter<T>[];
//   //   $and?: QueryFilter<T> | QueryFilter<T>[];
//   // };