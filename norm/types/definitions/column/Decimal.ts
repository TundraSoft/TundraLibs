import type { BaseColumnDefinition } from './Base.ts';
import type { DecimalTypes, NumberExpressions } from '../../../../dam/mod.ts';

export type DecimalColumnDefinition = BaseColumnDefinition & {
  type: DecimalTypes;
  length?: [number, number];
  defaults?: {
    insert?: NumberExpressions | number;
    update?: NumberExpressions | number;
  };
  lov?: Array<number>;
  range?: [number, number];
};
