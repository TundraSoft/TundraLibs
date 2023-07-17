/**
 * Creates a singleton instance of a class.
 *
 * @param ctor - The constructor function of the class.
 * @returns The singleton instance of the class.
 */
// deno-lint-ignore no-explicit-any
export const singleton = <T extends new (...args: any[]) => any>(
  ctor: T,
): T => {
  let instance: T | null = null;

  return class extends ctor {
    /**
     * Constructs a new instance of the class.
     * @param args - Arguments to be passed to the constructor.
     * @returns The singleton instance of the class.
     */
    // deno-lint-ignore no-explicit-any
    constructor(...args: any[]) {
      if (instance) {
        return instance;
      }
      super(...args);
      instance = this as unknown as T;
    }
  };
};
