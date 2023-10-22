import type {
  BooleanOperators,
  DateOperators,
  NumberOperators,
  StringOperators,
} from './Operators/mod.ts';
import type { FlattenEntity } from '../utils/mod.ts';

type FilterOperator<
  ValueType extends string | number | bigint | boolean | Date | unknown,
> = ValueType extends string ? StringOperators<ValueType>
  : ValueType extends number ? NumberOperators<ValueType>
  : ValueType extends bigint ? NumberOperators<ValueType>
  : ValueType extends Date ? DateOperators<ValueType>
  : ValueType extends boolean ? BooleanOperators<ValueType>
  : ValueType extends unknown
    ? StringOperators<string> | NumberOperators<number> | DateOperators<Date>
  : never;

export type QueryFilters<
  T extends Record<string, unknown> = Record<string, unknown>,
  Y = FlattenEntity<T>,
> =
  & {
    [K in keyof Y]?: FilterOperator<Y[K]>;
  }
  & {
    $or?: QueryFilters<T> | QueryFilters<T>[];
    $and?: QueryFilters<T> | QueryFilters<T>[];
  };
