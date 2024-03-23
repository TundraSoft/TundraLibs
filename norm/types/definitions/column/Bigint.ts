import type { BaseColumnDefinition } from './Base.ts';
import type { BigintTypes, NumberExpressions } from '../../../../dam/mod.ts';

export type BigintColumnDefinition = BaseColumnDefinition & {
  type: BigintTypes;
  defaults?: {
    insert?: NumberExpressions | bigint;
    update?: NumberExpressions | bigint;
  };
  lov?: Array<bigint>;
  range?: [bigint, bigint];
};
