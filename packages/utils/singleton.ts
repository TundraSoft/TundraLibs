/**
 * @fileoverview Class decorator that turns any class into a singleton —
 * subsequent `new` calls return the first instance, ignoring later args.
 *
 * @module
 */

// deno-lint-ignore-file no-explicit-any

const instanceMap = new WeakMap<any, any>();

/**
 * Wrap a class so only the first `new ctor(...)` actually constructs;
 * later calls return the stored instance and ignore their arguments.
 *
 * Instances are keyed by the original constructor in a `WeakMap`, so
 * subclasses get their own singleton and instances become eligible for
 * GC once no references remain.
 *
 * @typeParam T - Constructor type of the decorated class.
 * @param ctor - The class constructor to wrap.
 * @returns A subclass whose constructor enforces singleton semantics.
 *
 * @example
 * ```typescript
 * @Singleton
 * class DatabaseConnection {
 *   constructor(public url: string) {}
 * }
 *
 * const a = new DatabaseConnection('postgres://...');
 * const b = new DatabaseConnection('mysql://...'); // ignored
 * console.log(a === b);     // true
 * console.log(b.url);       // 'postgres://...'
 * ```
 */
export const Singleton = <T extends new (...args: any[]) => any>(
  ctor: T,
): T => {
  return class extends ctor {
    constructor(...args: any[]) {
      if (instanceMap.has(ctor)) {
        return instanceMap.get(ctor); // NOSONAR
      }
      super(...args);
      instanceMap.set(ctor, this);
    }
  };
};
