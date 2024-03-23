import type { BaseColumnDefinition } from './Base.ts';
import type {
  IntegerTypes,
  NumberExpressions,
} from '../../../../dam/types/mod.ts';

export type IntegerColumnDefinition = BaseColumnDefinition & {
  type: IntegerTypes;
  defaults?: {
    insert?: NumberExpressions | number;
    update?: NumberExpressions | number;
  };
  lov?: Array<number>;
  range?: [number, number];
};
