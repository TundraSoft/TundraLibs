// deno-lint-ignore-file
/**
 * Wraps a function so that it can only be called once irrespective of the arguments.
 *
 * @param fn The function to call only once.
 * @returns Wrapped function that only calls the provided function once.
 *
 * @example
 * ```ts
 * // Basic usage
 * const initialize = () => {
 *   console.log('Initialized');
 * };
 * const initializeOnce = once(initialize);
 *
 * initializeOnce(); // Logs: Initialized
 * initializeOnce(); // Does nothing
 * ```
 *
 * @example
 * ```ts
 * // Using with a function that returns a value
 * const compute = (a: number, b: number): number => a + b;
 * const computeOnce = once(compute);
 *
 * console.log(computeOnce(1, 2)); // Computes and returns 3
 * console.log(computeOnce(3, 4)); // Returns 3 (ignores new arguments)
 * ```
 */
export const once = <T extends (...args: any[]) => any>(fn: T): T => {
  let result: ReturnType<T> | undefined;

  const onceFn = ((...args: Parameters<T>): ReturnType<T> => {
    if (result === undefined) {
      result = fn(...args);
    }
    return result as ReturnType<T>;
  }) as T;

  return onceFn;
};

/**
 * A method decorator that ensures the decorated method is only called once.
 *
 * @param _target The target object.
 * @param _propertyKey The name of the decorated property.
 * @param descriptor The property descriptor.
 * @returns The updated property descriptor.
 *
 * @example
 * ```ts
 * class Service {
 *   @Once
 *   initialize() {
 *     console.log('Service initialized');
 *   }
 * }
 *
 * const service = new Service();
 * service.initialize(); // Logs: Service initialized
 * service.initialize(); // Does nothing
 * ```
 *
 * @example
 * ```ts
 * class Calculator {
 *   @Once
 *   add(a: number, b: number): number {
 *     return a + b;
 *   }
 * }
 *
 * const calc = new Calculator();
 * console.log(calc.add(1, 2)); // Computes and returns 3
 * console.log(calc.add(3, 4)); // Returns 3 (ignores new arguments)
 * ```
 */
export function Once(
  _target: object,
  _propertyKey: string | symbol,
  descriptor: PropertyDescriptor,
): PropertyDescriptor {
  if (typeof descriptor.value === 'function') {
    descriptor.value = once(descriptor.value);
  }
  return descriptor;
}
