import type { Vial } from './Vial.ts';
/** A single injection descriptor: which key resolves to which {@link Vial}. */
// deno-lint-ignore no-explicit-any
export type Prescription<T = any> = {
  key: string | symbol;
  type: Vial<T>;
  // Optional metadata for more advanced injection scenarios
  optional?: boolean;
};
