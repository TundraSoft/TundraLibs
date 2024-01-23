import type { BaseColumnDefinition } from './Base.ts';
import type { ArrayDataType } from '../datatypes/mod.ts';

export type ArrayColumnDefinition = BaseColumnDefinition & {
  type: ArrayDataType;
};
