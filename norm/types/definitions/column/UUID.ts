import type { BaseColumnDefinition } from './Base.ts';
import type { UUIDExpressions, UUIDTypes } from '../../../../dam/types/mod.ts';

export type UUIDColumnDefinition = BaseColumnDefinition & {
  type: UUIDTypes;
  defaults?: {
    insert?: UUIDExpressions;
    update?: UUIDExpressions;
  };
};
