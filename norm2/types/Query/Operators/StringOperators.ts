import type { BaseOperators } from './BaseOperators.ts';

export type StringOperators<ValueType extends string | undefined> =
  & BaseOperators<ValueType>
  & {
    $like?: ValueType;
    $nlike?: ValueType;
  };
