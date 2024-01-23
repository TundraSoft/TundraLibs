import type { BaseColumnDefinition } from './Base.ts';
import type { DateDataType } from '../../datatypes/mod.ts';

export type DateColumnDefinition = BaseColumnDefinition & {
  type: DateDataType;
  lov?: Date[];
};
