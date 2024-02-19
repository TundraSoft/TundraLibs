import type { FlattenEntity } from '../../../../utils/mod.ts';

import type {
  BaseFilter,
  BigIntFilter,
  BooleanFilter,
  DateFilter,
  Filters,
  NumberFilter,
  StringFilter,
} from './Operators.ts';

export type QueryFilters<
  R extends Record<string, unknown> = Record<string, unknown>,
  FE extends FlattenEntity<R> = FlattenEntity<R>,
> = {
  [K in keyof FE]?: Filters<FE[K]>;
} extends infer O ? { [P in keyof O]: O[P] } : never;

export type {
  BaseFilter,
  BigIntFilter,
  BooleanFilter,
  DateFilter,
  Filters,
  NumberFilter,
  StringFilter,
};
