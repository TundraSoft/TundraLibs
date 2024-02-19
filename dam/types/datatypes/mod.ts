import type { BooleanTypes } from './Boolean.ts';
import type { DateTypes } from './Date.ts';
import type { JSONTypes } from './JSON.ts';
import type {
  BigintTypes,
  DecimalTypes,
  IntegerTypes,
  SerialTypes,
} from './Numeric.ts';
import type { StringTypes, UUIDTypes } from './String.ts';

export type DataTypes =
  | BooleanTypes
  | DateTypes
  | SerialTypes
  | IntegerTypes
  | DecimalTypes
  | StringTypes
  | UUIDTypes
  | JSONTypes;

// Re-export types
export type {
  BigintTypes,
  BooleanTypes,
  DateTypes,
  DecimalTypes,
  IntegerTypes,
  JSONTypes,
  SerialTypes,
  StringTypes,
  UUIDTypes,
};
