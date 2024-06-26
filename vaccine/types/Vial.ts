// deno-lint-ignore no-explicit-any
export type Vial<T = any> = new (...args: any[]) => T;
