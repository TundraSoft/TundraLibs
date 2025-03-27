// deno-lint-ignore-file
// memoize.ts

/**
 * Type for the cached item with expiration
 */
type CachedItem<T> = {
  expire: number;
  data: T;
};

/**
 * Creates a safe cache key from the function arguments
 * @param args - Function arguments to create key from
 * @returns A string representation of the arguments
 */
const createCacheKey = <T extends Array<unknown>>(args: T): string => {
  try {
    return JSON.stringify(args);
  } catch (error) {
    // If arguments can't be stringified, use a fallback approach
    return `${Date.now()}_${Math.random()}`;
  }
};

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
  if (typeof fn !== 'function') {
    throw new TypeError('Expected a function');
  }

  // Ensure timeout is a positive number
  const cacheTimeout = Math.max(0, timeout) * 1000;

  const cache = new Map<string, CachedItem<ReturnType<T>>>();
  // For tracking in-flight promises
  const pendingPromises = new Map<string, Promise<any>>();

  const memoizedFn = ((...args: Parameters<T>): ReturnType<T> => {
    const key = createCacheKey(args);
    const now = Date.now();

    // Check if we have a valid cached value
    const cachedValue = cache.get(key);
    if (cachedValue && cachedValue.expire > now) {
      return cachedValue.data;
    }

    // If expired, remove from cache
    if (cachedValue) {
      cache.delete(key);
    }

    // For async functions, check if there's already a pending promise
    if (pendingPromises.has(key)) {
      return pendingPromises.get(key) as ReturnType<T>;
    }

    try {
      // Call the original function
      const result = fn(...args);

      // Handle promises specially
      if (result instanceof Promise) {
        // Save the promise in the pendingPromises map
        pendingPromises.set(key, result);

        // For async functions, return a new promise
        return Promise.resolve(result)
          .then((resolvedValue) => {
            // Only cache successful promises
            cache.set(key, {
              data: resolvedValue as ReturnType<T>,
              expire: now + cacheTimeout,
            });
            // Remove from pending promises
            pendingPromises.delete(key);
            return resolvedValue;
          })
          .catch((error) => {
            // Don't cache errors and remove from pending
            pendingPromises.delete(key);
            throw error;
          }) as ReturnType<T>;
      }

      // For synchronous functions, cache immediately
      cache.set(key, {
        data: result as ReturnType<T>,
        expire: now + cacheTimeout,
      });
      return result as ReturnType<T>;
    } catch (error) {
      // Don't cache errors
      throw error;
    }
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
    target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ) => {
    if (typeof descriptor.value === 'function') {
      // For normal methods
      const originalMethod = descriptor.value;

      // Create a new descriptor value that preserves the 'this' context
      descriptor.value = function (this: any, ...args: any[]) {
        // Create a unique key for this instance
        const instanceKey = this && this.constructor
          ? `${this.constructor.name}_${propertyKey.toString()}`
          : propertyKey.toString();

        // Create a unique memoized function for this instance if it doesn't exist
        if (!this.__memoized) {
          this.__memoized = new Map();
        }

        if (!this.__memoized.has(instanceKey)) {
          this.__memoized.set(
            instanceKey,
            memoize(
              (...args: any[]) => originalMethod.apply(this, args),
              timeout,
            ),
          );
        }

        // Call the memoized function
        return this.__memoized.get(instanceKey)(...args);
      };
    } else if (typeof descriptor.get === 'function') {
      // For getters
      const originalGetter = descriptor.get;

      descriptor.get = function (this: any) {
        // Create a unique key for this instance and getter
        const instanceKey = this && this.constructor
          ? `${this.constructor.name}_get_${propertyKey.toString()}`
          : `get_${propertyKey.toString()}`;

        // Create a unique memoized function for this instance if it doesn't exist
        if (!this.__memoized) {
          this.__memoized = new Map();
        }

        if (!this.__memoized.has(instanceKey)) {
          this.__memoized.set(
            instanceKey,
            memoize(() => originalGetter.apply(this), timeout),
          );
        }

        // Call the memoized getter
        return this.__memoized.get(instanceKey)();
      };
    }

    return descriptor;
  };
}
