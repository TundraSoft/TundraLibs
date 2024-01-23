import type { BaseColumnDefinition } from './Base.ts';
import type {
  SimpleStringDataType,
  UUIDDataType,
} from '../../datatypes/mod.ts';

type SimpleStringColumnDefinition = BaseColumnDefinition & {
  type: SimpleStringDataType;
  length?: number;
  lov?: string[];
};

type UUIDColumnDefinition = BaseColumnDefinition & {
  type: UUIDDataType;
};

export type StringColumnDefinition =
  | SimpleStringColumnDefinition
  | UUIDColumnDefinition;
