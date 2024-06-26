import type { Vial } from './Vial.ts';
// deno-lint-ignore no-explicit-any
export type Prescription<T = any> = { key: string; type: Vial<T> };
