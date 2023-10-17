// type Flatten<T extends Record<string, unknown>> = {
//   [K in keyof T]: T[K] extends Record<string, unknown> 
//     ? { 
//         [K2 in keyof T[K]]: `${string & K}.${string & K2}` extends infer NewK 
//           ? NewK extends keyof T 
//             ? never 
//             : NewK extends string 
//               ? { [key in NewK]: T[K][K2] } 
//               : never 
//           : never  
//       }[keyof T[K]]
//     : { [KK in string & K]: T[KK] }
// }[keyof T]

type Unarray<T> = T extends Array<infer U> ? U : T;

type UnionToIntersection<U> = (U extends Record<string, unknown>
  ? (k: U) => void
  : never) extends ((k: infer I) => void)
  ? I extends infer O ? { [D in keyof O]: O[D] } : never
  : never


type KeyCombiner<Parent extends string = '', K extends string = ''> =
  `${Parent}${Parent extends '' ? '' : '.'}${K}`;

export type FlattenEntity<T extends Record<string, unknown> = Record<string, unknown>, Parent extends string = ''> =  UnionToIntersection<
  {
    [K in keyof T]: T[K] extends Array<Record<string, unknown>>
      ? FlattenEntity<Unarray<T[K]>, KeyCombiner<Parent, K & string>>
      : T[K] extends Record<string, unknown>
        ? FlattenEntity<T[K], KeyCombiner<Parent, K & string>>
        : & {[KK in KeyCombiner<Parent, K & string>]: Unarray<T[K]>}
  }[keyof T] extends infer O ? { [P in keyof O]: O[P] } : never
>


type CommonOperators<ValueType extends string | number | bigint | boolean | Date | unknown> = ValueType 
  | {
    $eq?: ValueType;
    $ne?: ValueType;
    $in?: ValueType[];
    $nin?: ValueType[];
    $null?: boolean;
  }

type NumberOperators<ValueType extends number | bigint> = CommonOperators<ValueType> | {
  $lt?: ValueType;
  $lte?: ValueType;
  $gt?: ValueType;
  $gte?: ValueType;
  $between?: {
    $from: ValueType;
    $to: ValueType;
  };
}

type StringOperators<ValueType extends string = string> = CommonOperators<ValueType> | {
  $like?: ValueType;
  $nlike?: ValueType;
}

type DateOperators<ValueType extends Date> = CommonOperators<ValueType> | {
  $lt?: ValueType;
  $lte?: ValueType;
  $gt?: ValueType;
  $gte?: ValueType;
  $between?: {
    $from: ValueType;
    $to: ValueType;
  };
}

type FilterOperators<T> = T extends string
  ? StringOperators<T>
  : T extends number
    ? NumberOperators<T>
    : T extends bigint
      ? NumberOperators<T>
      : T extends Date
        ? DateOperators<T>
        : T extends boolean
          ? CommonOperators<T>
          : T extends unknown
            ? StringOperators<string> | NumberOperators<number> | DateOperators<Date>
            : never

type QueryFilter<T extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<T>> = 
  & {
    [K in keyof Y]?: FilterOperators<Y[K]>;
  } & {
    $or?: QueryFilter<T> | QueryFilter<T>[];
    $and?: QueryFilter<T> | QueryFilter<T>[];
  };

type BaseQuery<T extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<T>> = {
  table: string;
  schema?: string;
  columns: Array<keyof Y>,
}

type SelectQuery<T extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<T>> = BaseQuery<T> & {
  project?: {
    [alias: string]: keyof Y
  }, 
  // compute?: {
  //   [alias: string]: 
  // }
  filter?: QueryFilter<T>
}

type InsertQuery<T extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<T>> = BaseQuery<T> & {
  values: Array<{
    [K in keyof Y]: Y[K]
  }>
}

type UpdateQuery<T extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<T>> = BaseQuery<T> & {
  values: {
    [K in keyof Y]?: Y[K]
  },
  filter?: QueryFilter<T>
}

type DeleteQuery<T extends Record<string, unknown> = Record<string, unknown>, Y = FlattenEntity<T>> = BaseQuery<T> & {
  filter?: QueryFilter<T>
}

type test21 = FlattenEntity<{ id: number[], name: string[], address: { city: string, street: string, zipCode: string, geo: {lat: number, long: number, radius?: number}[] } }>
type tk = keyof test21;
const s: SelectQuery<{ id: number[], name: string[], address: { city: string, street: string, zipCode: string, geo: {lat: number, long: number, radius?: number}[] } }> = {
  table: 'TestTable', 
  columns: ['id', 'name', 'address.city', 'address.street', 'address.zipCode', 'address.geo.lat', 'address.geo.long', 'address.geo.radius'],
  project: {
    'ID': 'id',
  }, 
  filter: {
    id: 123, 
    name: { $eq: '123' },
    'address.city': '123',
    $or: [{
      id: 123,
    }]
  }
}

const s2: SelectQuery = {
  table: 'TestTable',
  columns: ['id', 'name', 'address.city', 'address.street', 'address.zipCode', 'address.geo.lat', 'address.geo.long', 'address.geo.radius'],
  project: {
    'ID': 'id',
  }, 
  filter : {
    id: 123, 
    name: { $eq: '123' },
    'address.city': '123',
    $or: [{
      id: 123,
    }]
  }
}