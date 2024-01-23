import type { BaseColumnDefinition } from './Base.ts';
import type {
  BigIntDataType,
  DecimalDataType,
  IntegerDataType,
  SerialDataType,
} from '../../datatypes/mod.ts';

type IntegerColumnDefinition = BaseColumnDefinition & {
  type: IntegerDataType | BigIntDataType;
  length?: number;
  lov?: number[];
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
};

export type NumericColumnDefinition =
  | IntegerColumnDefinition
  | SerialColumnDefinition
  | DecimalColumnDefinition;
