/**
 * Decorator used to seal a class constructor and its prototype.
 *
 * @template T - The type of the class constructor.
 * @param {T} constructor - The class constructor to be sealed.
 */
export const sealed = <
  // deno-lint-ignore no-explicit-any
  T extends { new (...args: any[]): Record<string | number | symbol, never> },
>(constructor: T) => {
  /* Seal the constructor */
  Object.seal(constructor);
  /* Seal the constructor prototype */
  Object.seal(constructor.prototype);
};
