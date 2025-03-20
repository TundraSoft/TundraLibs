// deno-lint-ignore-file no-explicit-any

// Store instances by constructor to properly handle inheritance
const instanceMap = new WeakMap<any, any>();

/**
 * Creates a singleton instance of a class.
 *
 * @param ctor - The constructor function of the class.
 * @returns The singleton instance of the class.
 *
 * @example
 * ```ts
 * // Basic usage
 * @Singleton
 * class MyClass {
 *   constructor(public value: number) {}
 * }
 *
 * const instance1 = new MyClass(1);
 * const instance2 = new MyClass(2);
 *
 * console.log(instance1 === instance2); // true
 * console.log(instance1.value); // 1
 * console.log(instance2.value); // 1
 * ```
 */
export const Singleton = <T extends new (...args: any[]) => any>(
  ctor: T,
): T => {
  return class extends ctor {
    /**
     * Constructs a new instance of the class.
     * @param args - Arguments to be passed to the constructor.
     * @returns The singleton instance of the class.
     */
    constructor(...args: any[]) {
      // Check if we already have an instance for this specific constructor
      if (instanceMap.has(ctor)) {
        return instanceMap.get(ctor); // NOSONAR
      }

      super(...args);
      // Store the new instance with its actual constructor as the key
      instanceMap.set(ctor, this);
    }
  };
};
