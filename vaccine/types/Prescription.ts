import type { Vial } from './Vial.ts';

// Factory function type
// deno-lint-ignore no-explicit-any
export type Factory<T> = (...args: any[]) => T;

// deno-lint-ignore no-explicit-any
export type Prescription<T = any> = {
  key: string | symbol;
  type: Vial<T> | Factory<T> | T;
  isValue?: boolean;
  isFactory?: boolean;
};
