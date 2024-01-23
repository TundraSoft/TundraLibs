import type { BaseColumnDefinition } from './Base.ts';
import type { SimpleStringDataType, UUIDDataType } from '../datatypes/mod.ts';
import type {
  StringExpressions,
  StringGenerators,
} from '../expressions/mod.ts';

type SimpleStringColumnDefinition = BaseColumnDefinition & {
  type: SimpleStringDataType;
  length?: number;
  lov?: string[];
  pattern?: RegExp;
  defaults?: {
    insert?: StringExpressions | string;
    update?: StringExpressions | string;
  };
};

type UUIDColumnDefinition = BaseColumnDefinition & {
  type: UUIDDataType;
  defaults?: {
    insert: StringGenerators | string;
    update?: StringGenerators | string;
  };
};

export type StringColumnDefinition =
  | SimpleStringColumnDefinition
  | UUIDColumnDefinition;
