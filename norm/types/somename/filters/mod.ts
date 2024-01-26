import type {
  BaseOperators,
  BooleanOperators,
  DateOperators,
  NumberOperators,
  StringOperators,
} from './Operators.ts';

export type QueryFilters<
  R extends Record<string, unknown> = Record<string, unknown>,
> =
  & {
    [Property in keyof R]?: R[Property] extends string
      ? StringOperators<R[Property]>
      : R[Property] extends number | bigint ? NumberOperators<R[Property]>
      : R[Property] extends Date ? DateOperators<R[Property]>
      : R[Property] extends boolean ? BooleanOperators<R[Property]>
      : BaseOperators<R[Property]>;
  }
  & {
    $and: QueryFilters<R> | QueryFilters<R>[];
    $or: QueryFilters<R> | QueryFilters<R>[];
  };
