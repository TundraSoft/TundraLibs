import type { BaseColumnDefinition } from './Base.ts';
import type { DateExpressions, DateTypes } from '../../../../dam/mod.ts';

export type DateColumnDefinition = BaseColumnDefinition & {
  type: DateTypes;
  defaults?: {
    insert?: DateExpressions | Date;
    update?: DateExpressions | Date;
  };
  lov?: Array<Date>;
  range?: [Date, Date];
};
