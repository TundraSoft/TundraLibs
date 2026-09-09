/**
 * @fileoverview {@link RapidModuleMethodKeys} — the names `invoke` accepts
 * for a module: its public PROTOTYPE methods, minus lifecycle hooks and
 * `_`-prefixed (by convention private/protected) members. Arrow-function
 * instance fields are not methods and are not indexed at mount.
 *
 * @module
 */

// deno-lint-ignore no-explicit-any
type AnyFn = (...args: any[]) => unknown;

/** Invokable method names of `T`. */
export type RapidModuleMethodKeys<T> =
  & {
    [K in keyof T]: K extends `_${string}` | 'init' | 'dispose' ? never
      : T[K] extends AnyFn ? K
      : never;
  }[keyof T]
  & string;
