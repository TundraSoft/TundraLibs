import type { BaseColumnDefinition } from './Base.ts';
import type { DateDataType } from '../datatypes/mod.ts';
import type { DateExpressions } from '../expressions/mod.ts';

export type DateColumnDefinition = BaseColumnDefinition & {
  type: DateDataType;
  defaults?: {
    insert?: DateExpressions | Date;
    update?: DateExpressions | Date;
  };
  lov?: Date[];
  range?: [Date, Date];
};
