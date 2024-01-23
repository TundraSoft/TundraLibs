import type { BooleanDataType } from './Boolean.ts';
import type { DateDataType } from './Date.ts';
import type {
  BigIntDataType,
  DecimalDataType,
  IntegerDataType,
  NumericDataType,
  SerialDataType,
} from './Numeric.ts';
import type {
  SimpleStringDataType,
  StringDataType,
  UUIDDataType,
} from './String.ts';

export type JSONDataType = 'JSON' | 'JSONB';

export type ArrayDataType =
  | 'ARRAY'
  | 'ARRAY_STRING'
  | 'ARRAY_NUMBER'
  | 'ARRAY_BIGINT'
  | 'ARRAY_BOOLEAN'
  | 'ARRAY_DATE';

export type DataTypes =
  | BooleanDataType
  | DateDataType
  | NumericDataType
  | StringDataType
  | JSONDataType
  | ArrayDataType;

export type {
  BigIntDataType,
  BooleanDataType,
  DateDataType,
  DecimalDataType,
  IntegerDataType,
  NumericDataType,
  SerialDataType,
  SimpleStringDataType,
  StringDataType,
  UUIDDataType,
};
