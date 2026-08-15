/** Constructor type for an injectable class registered with the container. */
// deno-lint-ignore no-explicit-any
export type Vial<T = any> = new (...args: any[]) => T;
