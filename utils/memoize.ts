// deno-lint-ignore-file
// memoize.ts

/**
 * Memoizes the provided function by caching its return values for the same set of arguments.
 *
 * @param fn The function to cache.
 * @param timeout The cache timeout in seconds. Default is 30 minutes.
 * @returns A memoized version of the provided function.
 *
 * @example
 * ```ts
 * // Basic usage
 * const add = (a: number, b: number): number => a + b;
 * const memoizedAdd = memoize(add, 60); // Cache results for 60 seconds
 *
 * console.log(memoizedAdd(1, 2)); // Computes and caches the result
 * console.log(memoizedAdd(1, 2)); // Retrieves the result from the cache
 *
 * // Using with asynchronous functions
 * const fetchData = async (url: string): Promise<string> => {
 *   const response = await fetch(url);
 *   return response.text();
 * };
 * const memoizedFetchData = memoize(fetchData, 120); // Cache results for 120 seconds
 *
 * memoizedFetchData('https://api.example.com/data').then(console.log); // Fetches and caches the result
 * memoizedFetchData('https://api.example.com/data').then(console.log); // Retrieves the result from the cache
 * ```
 */
export const memoize = <T extends (...args: any[]) => any>(
  fn: T,
  timeout: number = 30 * 60,
): T => {
  const cache = new Map<string, { expire: number; data: ReturnType<T> }>();

  const memoizedFn = ((...args: Parameters<T>): ReturnType<T> => {
    const key = JSON.stringify(args);
    if (cache.has(key)) {
      if (cache.get(key)!.expire > Date.now()) {
        return cache.get(key)!.data;
      }
      cache.delete(key);
    }
    const result = fn(...args);
    cache.set(key, {
      data: result as ReturnType<T>,
      expire: Date.now() + timeout * 1000,
    });
    return result as ReturnType<T>;
  }) as T;

  return memoizedFn;
};

/**
 * A method decorator that memoizes the result of the decorated method.
 *
 * @param timeout The cache timeout in seconds. Default is 30 minutes.
 * @returns The updated property descriptor.
 *
 * @example
 * ```ts
 * class Calculator {
 *   @Memoize(60) // Cache results for 60 seconds
 *   add(a: number, b: number): number {
 *     return a + b;
 *   }
 * }
 *
 * const calc = new Calculator();
 * console.log(calc.add(1, 2)); // Computes and caches the result
 * console.log(calc.add(1, 2)); // Retrieves the result from the cache
 * ```
 */
export function Memoize(timeout: number = 30 * 60): MethodDecorator {
  return (
    _target: object,
    _propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (typeof descriptor.value === 'function') {
      descriptor.value = memoize(descriptor.value, timeout);
    }
    return descriptor;
  };
}
