import type { ArrayColumnDefinition } from './Array.ts';
import type { BooleanColumnDefinition } from './Boolean.ts';
import type { DateColumnDefinition } from './Date.ts';
import type { JSONColumnDefinition } from './JSON.ts';
import type { NumericColumnDefinition } from './Numeric.ts';
import type { StringColumnDefinition } from './String.ts';

import type {
  DateExpressions,
  NumericExpressions,
  StringExpressions,
} from '../expressions/mod.ts';

export type ExpressionColumnDefinition =
  | StringExpressions
  | DateExpressions
  | NumericExpressions;

export type ColumnDefinition =
  | ArrayColumnDefinition
  | BooleanColumnDefinition
  | DateColumnDefinition
  | JSONColumnDefinition
  | NumericColumnDefinition
  | StringColumnDefinition;

export type ColumnIdentifier = `\$${string}`;
export type JSONIdentifier = `\$\$${string}`;

import type {
  ArrayDataType,
  BigIntDataType,
  BooleanDataType,
  DateDataType,
  JSONDataType,
  NumericDataType,
  SerialDataType,
  StringDataType,
} from '../datatypes/mod.ts';

export type ExtractColumnType<
  CD extends ColumnDefinition | ExpressionColumnDefinition,
> = CD extends ColumnDefinition ? CD['type'] extends BigIntDataType ? bigint
  : CD['type'] extends SerialDataType | NumericDataType ? number
  : CD['type'] extends BooleanDataType ? boolean
  : CD['type'] extends DateDataType ? Date
  : CD['type'] extends StringDataType ? string
  : CD['type'] extends JSONDataType ? object
  : CD['type'] extends ArrayDataType
    ? CD['type'] extends 'ARRAY_STRING' ? Array<string>
    : CD['type'] extends 'ARRAY_NUMBER' ? Array<number>
    : CD['type'] extends 'ARRAY_BIGINT' ? Array<bigint>
    : CD['type'] extends 'ARRAY_BOOLEAN' ? Array<boolean>
    : CD['type'] extends 'ARRAY_DATE' ? Array<Date>
    : Array<unknown>
  : never
  : CD extends ExpressionColumnDefinition
    ? CD extends StringExpressions ? string
    : CD extends NumericExpressions ? number | bigint
    : CD extends DateExpressions ? Date
    : never
  : never;

export type ExtractColumnLOV<CD extends ColumnDefinition> = CD extends
  { lov: Array<infer U> } ? U : never;

export type ExtractColumnIdentifier<CD extends ColumnDefinition> = CD extends
  { identifier: infer U } ? U : never;

export type ExtractColumnTypeLOV<CD extends ColumnDefinition> = CD extends
  { lov: unknown } ? ExtractColumnLOV<CD> : ExtractColumnType<CD>;
