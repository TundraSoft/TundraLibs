import type { BaseColumnDefinition } from './Base.ts';
import type { BigintColumnDefinition } from './Bigint.ts';
import type { BooleanColumnDefinition } from './Boolean.ts';
import type { DateColumnDefinition } from './Date.ts';
import type { DecimalColumnDefinition } from './Decimal.ts';
import type { IntegerColumnDefinition } from './Integer.ts';
import type { JSONColumnDefinition } from './JSON.ts';
import type { SerialColumnDefinition } from './Serial.ts';
import type { StringColumnDefinition } from './String.ts';
import type { UUIDColumnDefinition } from './UUID.ts';

export type ColumnDefinition =
  | BooleanColumnDefinition
  | BigintColumnDefinition
  | DateColumnDefinition
  | DecimalColumnDefinition
  | IntegerColumnDefinition
  | JSONColumnDefinition
  | SerialColumnDefinition
  | StringColumnDefinition
  | UUIDColumnDefinition;

export type {
  BaseColumnDefinition,
  BigintColumnDefinition,
  BooleanColumnDefinition,
  DateColumnDefinition,
  DecimalColumnDefinition,
  IntegerColumnDefinition,
  JSONColumnDefinition,
  SerialColumnDefinition,
  StringColumnDefinition,
  UUIDColumnDefinition,
};

import type {
  ExtractJSONStructure,
  JSONStructure,
} from '../../JSONStructure.ts';
// Extract types
export type ExtractColumnType<C extends ColumnDefinition> = C extends
  BooleanColumnDefinition ? boolean
  : C extends BigintColumnDefinition ? bigint
  : C extends DateColumnDefinition ? Date
  : C extends DecimalColumnDefinition ? number
  : C extends IntegerColumnDefinition ? number
  : C extends JSONColumnDefinition
    ? C extends { structure: JSONStructure }
      ? ExtractJSONStructure<C['structure']>
    : Record<string, unknown>
  : C extends SerialColumnDefinition ? number // Because BIGINT is defined before, this is safe for BIGSERIAL etc
  : C extends StringColumnDefinition ? string
  : C extends UUIDColumnDefinition ? string
  : never;

export type ExtractColumnLOV<C extends ColumnDefinition> = C extends
  { lov: Array<infer U> } ? U : never;

export type ColumnType<C extends ColumnDefinition> = C extends { lov: unknown }
  ? ExtractColumnLOV<C>
  : ExtractColumnType<C>;

export type ColumnIdentifier = `$${string}`;
