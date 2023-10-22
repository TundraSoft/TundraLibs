import type { BaseOperators } from './BaseOperators.ts';

export type BooleanOperators<ValueType extends boolean | undefined> = Omit<
  BaseOperators<ValueType>,
  '$in' | '$nin'
>;
