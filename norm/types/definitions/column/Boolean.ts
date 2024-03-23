import type { BaseColumnDefinition } from './Base.ts';
import type { BooleanTypes } from '../../../../dam/mod.ts';

export type BooleanColumnDefinition = BaseColumnDefinition & {
  type: BooleanTypes;
  defaults?: {
    insert?: boolean;
    update?: boolean;
  };
};
