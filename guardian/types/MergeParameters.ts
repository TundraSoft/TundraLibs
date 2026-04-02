import type { FunctionParameters } from './Function.ts';
export type MergeParameters<P extends FunctionParameters> = [P] extends [
  never,
] ? [never]
  : [P] extends [[]] ? []
  : [P] extends [[unknown]] ? [P[0]]
  : [P] extends [[unknown?]] ? [P[0]?]
  : P;
