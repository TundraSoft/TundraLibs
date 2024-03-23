import type { BaseColumnDefinition } from './Base.ts';
import type { JSONTypes } from '../../../../dam/types/mod.ts';
import type { JSONStructure } from '../../JSONStructure.ts';

export type JSONColumnDefinition = BaseColumnDefinition & {
  type: JSONTypes;
  structure?: JSONStructure;
};
