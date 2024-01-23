import type { BaseColumnDefinition } from './Base.ts';
import type { JSONDataType } from '../../../const/mod.ts';

export type JSONColumnDefinition = BaseColumnDefinition & {
  type: JSONDataType;
};
