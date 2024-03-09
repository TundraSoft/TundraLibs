import type { FlattenEntity } from '../../../../utils/mod.ts';

import type {
  BaseFilter,
  BigIntFilter,
  BooleanFilter,
  DateFilter,
  Filters,
  NumberFilter,
  Operators,
  StringFilter,
} from './Operators.ts';

export type QueryFilters<
  R extends Record<string, unknown> = Record<string, unknown>,
  FE extends FlattenEntity<R> = FlattenEntity<Required<R>>,
> =
  & {
    [Property in keyof FE]?: Filters<FE[Property]>;
  }
  & {
    $or?: QueryFilters<FE>[];
    $and?: QueryFilters<FE>[];
  } extends infer O ? { [P in keyof O]: O[P] } : never;
// | {
//   $and?: Filters<FE>[];
//   $or?: Filters<FE>[];
// }
// | {
//   [K in keyof FE]?: Filters<FE[K]>;
// } extends infer O ? { [P in keyof O]: O[P] } : never;

export type {
  BaseFilter,
  BigIntFilter,
  BooleanFilter,
  DateFilter,
  Filters,
  NumberFilter,
  Operators,
  StringFilter,
};
