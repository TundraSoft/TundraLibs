import type { Generators } from '../Translator/mod.ts';

type Unarray<T> = T extends Array<infer U> ? U : T;

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

export type BaseQueryFilter<
  T extends Record<string, unknown> = Record<string, unknown>,
> =
  & {
    [Property in keyof T]?: FilterOperators<T[Property]>;
  }
  & {
    $or?: QueryFilter<T> | QueryFilter<T>[];
    $and?: QueryFilter<T> | QueryFilter<T>[];
  };

export type QueryFilter<T, Y = Required<T>> = Y extends Record<string, unknown>
  ?
    & {
      [K in keyof Y]?: Y[K] extends Array<Record<string, unknown>>
        ? QueryFilter<Unarray<Y[K]>>
        : FilterOperators<Y[K]>;
    }
    & {
      $or?: QueryFilter<T>[] | QueryFilter<T>;
      $and?: QueryFilter<T>[] | QueryFilter<T>;
    }
  : never;

// type Path<T> = T extends Record<string, unknown>
//   ? {
//       [K in keyof T]: `${string & K}` | `${string & K}.${Path<T[K]>}`;
//     }[keyof T]
//   : "";

//   export type QueryFilter<T, Y = Required<T>> = Y extends Record<string, unknown>
//   ? {
//       [K in keyof Y]?: Y[K] extends Array<infer U> 
//         ? U extends Record<string, unknown> 
//           ? QueryFilter<U>[]
//           : FilterOperators<Y[K]>
//         : Y[K] extends Record<string, unknown> 
//           ? QueryFilter<Y[K]> 
//           : FilterOperators<Y[K]>;
//     } & {
//       $or?: QueryFilter<T>[] | QueryFilter<T>;
//       $and?: QueryFilter<T>[] | QueryFilter<T>;
//     }
//   : never;
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

// export type QueryFilter<T extends Record<string, unknown> = Record<string, unknown>> =
//   & {
//     [Property in keyof T]?: T[Property] extends Array<infer Item>
//       ? Item extends Record<string, unknown>
//         ? QueryFilter<Item>
//         : FilterOperators<Item>
//       : T[Property] extends Record<string, unknown>
//         ? QueryFilter<T[Property]>
//         : FilterOperators<T[Property]>;
//   }
//   & {
//     $or?: QueryFilter<T> | QueryFilter<T>[];
//     $and?: QueryFilter<T> | QueryFilter<T>[];
//   };
