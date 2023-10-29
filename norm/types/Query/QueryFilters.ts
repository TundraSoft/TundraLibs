import type { FilterOperators } from './FilterOperators.ts';

import type { TableDefinition } from '../schema/mod.ts';
import { DataTypeMap } from '../../const/mod.ts';

export type QueryFilters<T extends TableDefinition = TableDefinition> =
  & {
    [C in keyof T['columns']]?: FilterOperators<
      ReturnType<typeof DataTypeMap[T['columns'][C]['type']]>
    >;
  }
  & {
    $or?: QueryFilters<T> | QueryFilters<T>[];
    $and?: QueryFilters<T> | QueryFilters<T>[];
  };

// export type SimpleQueryFilter<
//   T extends Record<string, unknown> = Record<string, unknown>,
// > = {
//   [Property in keyof T]?: FilterOperators<T[Property]>;
// };

// export type QueryFilters<
//   T extends Record<string, unknown> = Record<string, unknown>,
// > =
//   & {
//     [Property in keyof T]?: FilterOperators<T[Property]>;
//   }
//   & {
//     $or?: QueryFilters<T> | QueryFilters<T>[];
//     $and?: QueryFilters<T> | QueryFilters<T>[];
//   };
