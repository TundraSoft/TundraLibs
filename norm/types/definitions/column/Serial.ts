import type { BaseColumnDefinition } from './Base.ts';
import type { SerialTypes } from '../../../../dam/types/mod.ts';

export type SerialColumnDefinition = BaseColumnDefinition & {
  type: SerialTypes;
  nullable?: false;
};
