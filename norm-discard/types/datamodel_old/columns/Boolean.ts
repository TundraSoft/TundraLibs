import type { BaseColumnDefinition } from './Base.ts';
import type { BooleanDataType } from '../../datatypes/mod.ts';

export type BooleanColumnDefinition = BaseColumnDefinition & {
  type: BooleanDataType;
};
