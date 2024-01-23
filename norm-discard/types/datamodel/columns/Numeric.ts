import type { BaseColumnDefinition } from './Base.ts';
import type { NumericExpressions } from '../expressions/mod.ts';

import type {
  BigIntDataType,
  DecimalDataType,
  IntegerDataType,
  SerialDataType,
} from '../datatypes/mod.ts';

type BigintColumnDefinition = BaseColumnDefinition & {
  type: BigIntDataType;
  length?: number;
  lov?: bigint[];
  range?: [bigint, bigint];
  defaults?: {
    insert?: NumericExpressions | bigint;
    update?: NumericExpressions | bigint;
  };
};

type IntegerColumnDefinition = BaseColumnDefinition & {
  type: IntegerDataType;
  length?: number;
  lov?: number[];
  range?: [number, number];
  defaults?: {
    insert?: NumericExpressions | number;
    update?: NumericExpressions | number;
  };
};

type SerialColumnDefinition = BaseColumnDefinition & {
  type: SerialDataType;
};

type DecimalColumnDefinition = BaseColumnDefinition & {
  type: DecimalDataType;
  length?: {
    precision: number;
    scale?: number;
  };
  lov?: number[];
  range?: [number, number];
  defaults?: {
    insert?: NumericExpressions | number;
    update?: NumericExpressions | number;
  };
};

export type NumericColumnDefinition =
  | BigintColumnDefinition
  | IntegerColumnDefinition
  | SerialColumnDefinition
  | DecimalColumnDefinition;
