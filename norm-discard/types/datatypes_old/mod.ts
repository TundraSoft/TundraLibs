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

export type ArrayDataType = 'ARRAY';

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
