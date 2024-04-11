import type { BaseColumnDefinition } from './Base.ts';
import type {
  StringExpressions,
  StringTypes,
} from '../../../../dam/types/mod.ts';

export type StringColumnDefinition = BaseColumnDefinition & {
  type: StringTypes;
  length?: [number];
  defaults?: {
    insert?: StringExpressions | string;
    update?: StringExpressions | string;
  };
  lov?: Array<string>;
  pattern?: string;
};
